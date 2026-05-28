// src/auth/auth.service.ts
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { User, UserRole } from "../users/entities/user.entity";
import { UsersService } from "../users/users.service";
import { RegisterDto } from "./dto/register.dto";
import { JwtPayload } from "./strategies/jwt.strategy";

// Respuesta pública de login/register/refresh
// Nunca expone passwordHash ni refreshTokenHash
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject("VALKEY_CLIENT")
    private readonly valkeyClient: Redis,
  ) {}

  // register — crea usuario con rol PATIENT forzado en servidor
  // El cliente no puede escoger su rol — OWASP A01 + A04
  async register(dto: RegisterDto): Promise<AuthTokens> {
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      // Rol forzado a PATIENT — nunca desde el cliente
      role: UserRole.PATIENT,
    });

    this.logger.log(`Nuevo usuario registrado: ${user.email}`);
    return this.issueTokens(user);
  }

  // login — valida credenciales y emite par de tokens
  // La validación real ocurre en LocalStrategy.validate()
  // Aquí solo emitimos los tokens para el usuario ya validado
  async login(user: User): Promise<AuthTokens> {
    return this.issueTokens(user);
  }

  // refreshToken — rota el refresh token y emite par nuevo
  // Implementa reuse detection: detecta tokens robados
  async refreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<AuthTokens> {
    // Cargamos directamente del repo para obtener refreshTokenHash
    // (UsersService.findById no lo selecciona por seguridad)
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Refresh token inválido");
    }

    // Caso: sin hash activo — logout previo o familia ya revocada
    // Alguien está usando un token antiguo — rechazar
    if (!user.refreshTokenHash) {
      this.logger.warn(
        `Refresh sin hash activo para userId ${userId} — posible reuso post-logout`,
      );
      throw new UnauthorizedException("Refresh token inválido");
    }

    // Comparar el token recibido contra el hash almacenado
    const valid = await argon2.verify(user.refreshTokenHash, refreshToken);

    if (!valid) {
      // Reuse detection — firma válida pero hash no coincide:
      // el token ya fue rotado. Casi seguro un token robado.
      // Revocar familia completa — forzar re-login en todos los dispositivos
      // OWASP A07:2021
      this.logger.error(
        `Refresh reuse detectado para userId ${userId}. Revocando familia completa.`,
      );
      await this.userRepository.update(userId, { refreshTokenHash: null });
      throw new UnauthorizedException(
        "Reuso de refresh token detectado. Sesión revocada.",
      );
    }

    // Rotación obligatoria — emitir par nuevo y reemplazar hash
    return this.issueTokens(user);
  }

  // logout — invalida el access token en Valkey y limpia el refresh hash
  async logout(userId: string, accessToken: string): Promise<void> {
    // decode() no verifica firma — el token ya fue validado por JwtAuthGuard
    const decoded = this.jwtService.decode<{ jti?: string; exp?: number }>(
      accessToken,
    );

    if (decoded?.jti && decoded?.exp) {
      // TTL = segundos hasta expiración natural
      // La entrada en Valkey se auto-elimina al expirar — sin acumulación
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);

      if (ttl > 0) {
        try {
          // key namespaced para evitar colisiones con otras claves
          // blocklist:at:{jti} — patrón consistente con la JwtStrategy
          await this.valkeyClient.set(
            `blocklist:at:${decoded.jti}`,
            "1",
            "EX",
            ttl,
          );
        } catch (err) {
          // Fail-open: el refresh se invalida igual
          // El access token quedará activo hasta su expiración natural (15min)
          // OWASP A09: registrar el fallo
          this.logger.error(
            `Blocklist Valkey error en logout: ${(err as Error).message}`,
          );
        }
      }
    }

    // Invalidar refresh token — el usuario tendrá que hacer login de nuevo
    await this.userRepository.update(userId, { refreshTokenHash: null });
    this.logger.log(`Logout para userId: ${userId}`);
  }

  // validate — endpoint interno para Kong
  // Kong llama a GET /auth/validate para verificar tokens en el borde
  // Retorna los claims del usuario si el token es válido
  async validateToken(token: string): Promise<{
    id: string;
    email: string;
    role: string;
  } | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>("jwt.secret"),
        algorithms: ["HS256"],
        issuer: this.configService.getOrThrow<string>("jwt.issuer"),
        audience: this.configService.getOrThrow<string>("jwt.audience"),
      });

      // Verificar blocklist
      const blocked = await this.valkeyClient.get(
        `blocklist:at:${payload.jti}`,
      );
      if (blocked) return null;

      // Verificar usuario activo
      const user = await this.usersService.findById(payload.sub);
      if (!user.isActive) return null;

      return { id: user.id, email: user.email, role: user.role };
    } catch {
      return null;
    }
  }

  // issueTokens — firma access + refresh y persiste el hash
  // Método privado reutilizado por register / login / refreshToken
  private async issueTokens(user: User): Promise<AuthTokens> {
    // jti único por token — prerequisito de la blocklist
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
    };

    const issuer = this.configService.getOrThrow<string>("jwt.issuer");
    const audience = this.configService.getOrThrow<string>("jwt.audience");

    // Access token — vida corta (15min), secreto propio
    const accessOptions = {
      secret: this.configService.getOrThrow<string>("jwt.secret"),
      expiresIn: this.configService.getOrThrow<string>("jwt.expiration"),
      algorithm: "HS256",
      issuer,
      audience,
    } as JwtSignOptions;

    // Refresh token — vida larga (7d), secreto DIFERENTE
    // Si se compromete el secreto del access, el refresh sigue seguro
    // OWASP A02:2025 — separación de secretos por propósito
    const refreshOptions = {
      secret: this.configService.getOrThrow<string>("jwt.refreshSecret"),
      expiresIn: this.configService.getOrThrow<string>("jwt.refreshExpiration"),
      algorithm: "HS256",
      issuer,
      audience,
    } as JwtSignOptions;

    const accessToken = await this.jwtService.signAsync(payload, accessOptions);
    // El payload del refresh solo lleva el sub — mínimo necesario
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id },
      refreshOptions,
    );

    // Hashear el refresh token antes de persistirlo
    // Si la BD es comprometida, los refresh tokens no son utilizables
    const refreshTokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await this.userRepository.update(user.id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}

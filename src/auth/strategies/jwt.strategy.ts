// src/auth/strategies/jwt.strategy.ts
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type Redis from "ioredis";
import { UsersService } from "../../users/users.service";

// Payload del access token — campos que viajan firmados
export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string;
  jti: string; // JWT ID único — prerequisito de la blocklist
}

// AuthenticatedUser — lo que se inyecta en req.user
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @Inject("VALKEY_CLIENT")
    private readonly valkeyClient: Redis,
  ) {
    const secret = configService.getOrThrow<string>("jwt.secret");

    super({
      // Extrae el token del header Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Tokens expirados se rechazan automáticamente
      ignoreExpiration: false,
      secretOrKey: secret,
      // Pinear algoritmo — bloquea ataques algorithm confusion (alg:none)
      // OWASP ASVS V3.5
      algorithms: ["HS256"],
      // Validar issuer y audience — los tokens de otros servicios no son válidos aquí
      issuer: configService.getOrThrow<string>("jwt.issuer"),
      audience: configService.getOrThrow<string>("jwt.audience"),
    });
  }

  // validate() se ejecuta tras verificar firma y expiración
  // Lo retornado se asigna a req.user
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Verificar que el usuario sigue activo en cada request
    // Un usuario desactivado no puede usar su token aunque no haya expirado
    // OWASP A01: Broken Access Control
    const user = await this.usersService.findById(payload.sub);

    if (!user.isActive) {
      throw new UnauthorizedException("Usuario desactivado");
    }

    // Consultar blocklist — si el jti está en Valkey el token fue revocado en logout
    // Fail-open deliberado: si Valkey no responde, dejamos pasar
    // isActive es la defensa principal
    // OWASP A07:2021 Identification and Authentication Failures
    try {
      const blocked = await this.valkeyClient.get(
        `blocklist:at:${payload.jti}`,
      );
      if (blocked) {
        throw new UnauthorizedException("Token revocado");
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `Valkey blocklist check fallido — fail-open: ${(err as Error).message}`,
      );
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}

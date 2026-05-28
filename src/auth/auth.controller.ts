// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { Public } from "../common/decorators/public.decorator";
import { User } from "../users/entities/user.entity";
import type { AuthenticatedUser } from "./strategies/jwt.strategy";

// Nombre de la cookie HttpOnly del refresh token
const REFRESH_COOKIE = "refresh_token";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /auth/register — endpoint público
  // Rate limit estricto: 5 requests cada 10 minutos por IP
  // Previene spam de cuentas — OWASP A04 Insecure Design
  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("register")
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const tokens = await this.authService.register(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return res.json({ accessToken: tokens.accessToken, user: tokens.user });
  }

  // POST /auth/login — endpoint público
  // LocalAuthGuard activa LocalStrategy: valida email + password
  // Rate limit: 5 requests por minuto por IP — brute force protection
  @Public()
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() _dto: LoginDto, // body validado pero el usuario ya viene de LocalStrategy
    @Req() req: Request & { user: User },
    @Res() res: Response,
  ) {
    const tokens = await this.authService.login(req.user);
    this.setRefreshCookie(res, tokens.refreshToken);
    return res.json({ accessToken: tokens.accessToken, user: tokens.user });
  }

  // POST /auth/refresh — lee la cookie HttpOnly del refresh token
  // Rate limit: 10 requests por minuto por IP
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token no encontrado");
    }

    // Verificar firma del refresh token para extraer el userId
    // La validación completa (reuse detection) ocurre en AuthService
    let userId: string;
    try {
      const payload = this.authService["jwtService"].verify<{ sub: string }>(
        refreshToken,
        {
          secret:
            this.authService["configService"].getOrThrow("jwt.refreshSecret"),
          algorithms: ["HS256"],
        },
      );
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }

    const tokens = await this.authService.refreshToken(userId, refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return res.json({ accessToken: tokens.accessToken, user: tokens.user });
  }

  // POST /auth/logout — requiere JWT válido
  // Añade el jti a la blocklist de Valkey y limpia el refresh hash
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("logout")
  async logout(
    @Req() req: Request & { user: AuthenticatedUser },
    @Res() res: Response,
  ) {
    // Extraer el token del header Authorization: Bearer <token>
    const authHeader = req.headers.authorization ?? "";
    const accessToken = authHeader.replace("Bearer ", "");

    await this.authService.logout(req.user.id, accessToken);

    // Limpiar la cookie del refresh token
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth/refresh",
    });

    return res.status(HttpStatus.NO_CONTENT).send();
  }

  // GET /auth/validate — endpoint interno para Kong
  // Kong llama a este endpoint para validar tokens antes de enrutar
  // No está expuesto al cliente — solo accesible desde la red interna
  @Public()
  @Get("validate")
  async validate(@Headers("authorization") authHeader: string) {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token no proporcionado");
    }

    const token = authHeader.replace("Bearer ", "");
    const user = await this.authService.validateToken(token);

    if (!user) {
      throw new UnauthorizedException("Token inválido o revocado");
    }

    // Retorna los claims para que Kong los inyecte como headers
    // hacia los microservicios destino
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  // Configura la cookie HttpOnly del refresh token
  // SameSite=Strict — previene CSRF
  // HttpOnly — inaccesible a JavaScript — previene XSS
  // path restringido — la cookie solo viaja en /auth/refresh
  // OWASP A01 + A02
  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth/refresh",
      // 7 días en ms — mismo TTL que el token
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}

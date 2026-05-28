// src/auth/strategies/local.strategy.ts
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { UsersService } from "../../users/users.service";
import * as argon2 from "argon2";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, "local") {
  private readonly logger = new Logger(LocalStrategy.name);

  constructor(private readonly usersService: UsersService) {
    super({
      // passport-local busca 'username' por defecto
      // lo cambiamos a 'email' para nuestro dominio
      usernameField: "email",
      passwordField: "password",
    });
  }

  // validate() es llamado por passport-local con los valores del body
  // Lo retornado se asigna a req.user y pasa al controller
  async validate(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    // Respuesta genérica — no revelar si el email existe
    // Previene user enumeration — OWASP A01
    if (!user || !user.isActive) {
      this.logger.warn(`Login fallido para: ${email}`);
      throw new UnauthorizedException("Credenciales inválidas");
    }

    // argon2.verify() — comparación en tiempo constante
    // Previene timing attacks — OWASP A02:2025
    const valid = await argon2.verify(user.passwordHash, password);

    if (!valid) {
      this.logger.warn(`Password incorrecto para: ${email}`);
      throw new UnauthorizedException("Credenciales inválidas");
    }

    this.logger.log(`Login exitoso para: ${email}`);
    return user;
  }
}

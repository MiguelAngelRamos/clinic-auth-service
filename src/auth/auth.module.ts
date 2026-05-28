// src/auth/auth.module.ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UsersModule } from "../users/users.module";
import { User } from "../users/entities/user.entity";

@Module({
  imports: [
    // PassportModule con estrategia por defecto jwt
    PassportModule.register({ defaultStrategy: "jwt" }),

    // JwtModule — configuración asíncrona para esperar ConfigModule
    // El secreto se lee del .env via ConfigService
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("jwt.secret"),
        signOptions: {
          expiresIn: configService.getOrThrow<string>("jwt.expiration"),
          algorithm: "HS256",
          issuer: configService.getOrThrow<string>("jwt.issuer"),
          audience: configService.getOrThrow<string>("jwt.audience"),
        },
      }),
    }),

    // Necesitamos el repositorio de User para operaciones de refresh/logout
    TypeOrmModule.forFeature([User]),

    // UsersModule exporta UsersService para crear/buscar usuarios
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}

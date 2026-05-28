// src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { appConfig, databaseConfig, jwtConfig, valkeyConfig } from "./config";
import { ValkeyModule } from "./valkey/valkey.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";

@Module({
  imports: [
    // ConfigModule global — carga .env y los 4 namespaces
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, valkeyConfig],
      envFilePath: ".env",
      cache: true,
    }),

    // TypeORM conecta a la BD propia del auth-service
    // synchronize: false SIEMPRE — los cambios van por migraciones
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get<string>("database.host"),
        port: configService.get<number>("database.port"),
        username: configService.get<string>("database.username"),
        password: configService.get<string>("database.password"),
        database: configService.get<string>("database.name"),
        entities: [__dirname + "/**/*.entity.{ts,js}"],
        // NUNCA true — protege la BD en producción
        synchronize: false,
        logging: configService.get<string>("app.nodeEnv") === "development",
        ssl: configService.get<boolean>("database.ssl") ?? false,
      }),
    }),

    // Rate limiting global — 60 req/min baseline por IP
    // Los endpoints sensibles usan @Throttle() con límites más estrictos
    // OWASP A04 Insecure Design
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 60,
      },
    ]),

    // Valkey global — provee VALKEY_CLIENT (ioredis) para la blocklist
    ValkeyModule,

    UsersModule,
    AuthModule,
  ],
  providers: [
    // ThrottlerGuard global — activo en todos los endpoints
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JwtAuthGuard global — todo endpoint requiere JWT por defecto
    // Los marcados con @Public() se saltan la validación
    // OWASP A01: authentication-by-default
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}

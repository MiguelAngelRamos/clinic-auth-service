// src/valkey/valkey.module.ts
import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

// @Global hace que VALKEY_CLIENT esté disponible en toda la app
// sin necesidad de importar ValkeyModule en cada módulo
@Global()
@Module({
  providers: [
    {
      provide: "VALKEY_CLIENT",
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger("ValkeyClient");

        const client = new Redis({
          host: configService.getOrThrow<string>("valkey.host"),
          port: configService.getOrThrow<number>("valkey.port"),
          password: configService.getOrThrow<string>("valkey.password"),
          // Reintentos automáticos si Valkey no está disponible al arrancar
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => Math.min(times * 100, 3000),
          lazyConnect: false,
        });

        client.on("connect", () => {
          logger.log(
            `Valkey conectado en ${configService.get("valkey.host")}:${configService.get("valkey.port")}`,
          );
        });

        client.on("error", (err: Error) => {
          // Fail-open: si Valkey cae, el servicio sigue funcionando
          // La blocklist pierde efectividad pero la app no cae
          // OWASP A09: registrar el fallo para alertar
          logger.error(`Valkey error: ${err.message}`);
        });

        return client;
      },
    },
  ],
  exports: ["VALKEY_CLIENT"],
})
export class ValkeyModule {}

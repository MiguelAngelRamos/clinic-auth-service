// src/config/app.config.ts
import { registerAs } from "@nestjs/config";

// registerAs agrupa las variables bajo el namespace 'app'
// Se accede con configService.get('app.port')
export const appConfig = registerAs("app", () => ({
  port: parseInt(process.env.PORT ?? "3001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
}));

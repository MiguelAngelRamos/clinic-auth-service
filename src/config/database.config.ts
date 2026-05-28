// src/config/database.config.ts
import { registerAs } from "@nestjs/config";

export const databaseConfig = registerAs("database", () => ({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USERNAME ?? "",
  password: process.env.DB_PASSWORD ?? "",
  name: process.env.DB_NAME ?? "auth_db",
  // DB_SSL=true en producción para cifrar la conexión
  ssl: process.env.DB_SSL === "true",
}));

// src/config/valkey.config.ts
import { registerAs } from "@nestjs/config";

export const valkeyConfig = registerAs("valkey", () => ({
  host: process.env.VALKEY_HOST ?? "127.0.0.1",
  port: parseInt(process.env.VALKEY_PORT ?? "6379", 10),
  password: process.env.VALKEY_PASSWORD ?? "",
}));

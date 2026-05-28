// src/config/jwt.config.ts
import { registerAs } from "@nestjs/config";

// Longitud mínima del secreto JWT en producción
// Secretos cortos son vulnerables a ataques de fuerza bruta
const MIN_SECRET_LENGTH = 32;

export const jwtConfig = registerAs("jwt", () => {
  const secret = process.env.JWT_SECRET ?? "";
  const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "";
  const nodeEnv = process.env.NODE_ENV ?? "development";

  // Fail-fast en producción — el servicio no arranca con secretos débiles
  // OWASP A02:2025 Cryptographic Failures
  if (nodeEnv === "production") {
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} bytes en producción. ` +
          `Genera uno con: openssl rand -base64 48`,
      );
    }
    if (refreshSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_REFRESH_SECRET debe tener al menos ${MIN_SECRET_LENGTH} bytes en producción.`,
      );
    }
    if (secret === refreshSecret) {
      throw new Error(
        "JWT_SECRET y JWT_REFRESH_SECRET deben ser distintos. " +
          "Usar el mismo secreto elimina la separación de propósito.",
      );
    }
  }

  return {
    secret,
    expiration: process.env.JWT_EXPIRATION ?? "15m",
    refreshSecret,
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? "7d",
    issuer: process.env.JWT_ISSUER ?? "clinic-auth",
    audience: process.env.JWT_AUDIENCE ?? "clinic-web",
  };
});

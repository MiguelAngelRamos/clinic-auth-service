// src/database/data-source.ts — DataSource independiente para el CLI de TypeORM
//
// Pensado para EJECUTAR migraciones en producción sobre código YA compilado.
// La imagen Docker solo contiene dist/ + node_modules (sin package.json ni
// scripts de pnpm), por eso este archivo se compila a dist/database/data-source.js
// y se invoca con:
//   node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
//
// Para desarrollo (sobre .ts con ts-node) seguimos usando ormconfig.ts.
// Ambos leen exactamente las mismas variables de entorno que database.config.ts.
import "reflect-metadata";
import { join } from "path";
import { DataSource } from "typeorm";

// Las rutas se resuelven con __dirname para que funcionen sea cual sea el
// directorio de trabajo desde el que se lance el CLI dentro del contenedor.
// En ejecución: __dirname === <raíz>/dist/database
//   entities   -> dist/**/*.entity.js
//   migrations -> dist/database/migrations/*.js
export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: parseInt(process.env.DB_PORT ?? "5432", 10),
  username: process.env.DB_USERNAME ?? "",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "auth_db",
  // DB_SSL=true en producción para cifrar la conexión
  ssl: process.env.DB_SSL === "true",
  // synchronize: false SIEMPRE — los cambios van por migraciones
  synchronize: false,
  entities: [join(__dirname, "..", "**", "*.entity.js")],
  migrations: [join(__dirname, "migrations", "*.js")],
});

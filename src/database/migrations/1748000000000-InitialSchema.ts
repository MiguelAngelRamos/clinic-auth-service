// src/database/migrations/1748000000000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from "typeorm";

// Migración inicial del auth-service
// Crea la tabla 'users' con los campos necesarios para autenticación
// synchronize: false garantiza que esta es la ÚNICA forma de modificar el esquema
export class InitialSchema1748000000000 implements MigrationInterface {
  name = "InitialSchema1748000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear el enum de roles a nivel de base de datos
    // Restringe los valores posibles — no se pueden insertar roles arbitrarios
    await queryRunner.query(`
      CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'doctor', 'patient')
    `);

    // Tabla users — vista mínima del auth-service
    // Solo los campos necesarios para autenticación y emisión de tokens
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                 UUID NOT NULL DEFAULT uuid_generate_v4(),
        "email"              VARCHAR(255) NOT NULL,
        "password_hash"      VARCHAR NOT NULL,
        "role"               "public"."users_role_enum" NOT NULL DEFAULT 'patient',
        "is_active"          BOOLEAN NOT NULL DEFAULT true,
        "refresh_token_hash" VARCHAR,
        "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // Extensión para UUID v4 — requerida por uuid_generate_v4()
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
    `);

    // Índice en email — optimiza las búsquedas de login
    await queryRunner.query(`
      CREATE INDEX "IDX_users_email" ON "users" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}

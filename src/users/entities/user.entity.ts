// src/users/entities/user.entity.ts
//
// IMPORTANTE — diseño de microservicio:
// Esta entidad es la VISTA MÍNIMA que auth-service necesita.
// Solo contiene los campos relevantes para autenticación.
// El user-service tendrá su propia entidad con datos adicionales.
// Ningún servicio comparte código con otro — cada uno es dueño de sus tipos.
//
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// Roles del sistema — definidos aquí porque auth los necesita
// para emitir el claim 'role' en el JWT
export enum UserRole {
  ADMIN = "admin",
  DOCTOR = "doctor",
  PATIENT = "patient",
}

@Entity("users")
export class User {
  // UUID v4 — previene enumeración de recursos
  // OWASP A01: Broken Access Control
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Índice único a nivel de BD — no solo validación de servicio
  @Column({ unique: true, length: 255 })
  email!: string;

  // Siempre Argon2id — nunca texto plano
  // El campo se llama passwordHash para dejar explícito en el código
  @Column({ name: "password_hash" })
  passwordHash!: string;

  // Enum a nivel de BD — restringe valores posibles
  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.PATIENT,
  })
  role!: UserRole;

  // Soft delete — desactivar sin perder integridad referencial
  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  // Hash del refresh token — Argon2id antes de persistir
  // null cuando no hay sesión activa (logout, revocación)
  // OWASP A02:2025 Cryptographic Failures
  @Column({ name: "refresh_token_hash", type: "varchar", nullable: true })
  refreshTokenHash!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}

// src/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Email inválido" })
  email!: string;

  // MinLength básico — la complejidad real se valida al crear el usuario
  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  password!: string;
}

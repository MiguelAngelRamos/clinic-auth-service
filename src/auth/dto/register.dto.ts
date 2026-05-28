// src/auth/dto/register.dto.ts
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Email inválido" })
  @MaxLength(255)
  email!: string;

  // Contraseña con requisitos de complejidad mínimos
  // OWASP A07:2021 Identification and Authentication Failures
  @IsString()
  @MinLength(8, { message: "Mínimo 8 caracteres" })
  @MaxLength(128, { message: "Máximo 128 caracteres" })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      "La contraseña debe contener al menos una mayúscula, una minúscula y un número",
  })
  password!: string;
}

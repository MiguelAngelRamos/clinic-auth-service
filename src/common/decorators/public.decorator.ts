// src/common/decorators/public.decorator.ts
import { SetMetadata } from "@nestjs/common";

// Marca un endpoint como público — omite el JwtAuthGuard global
// Todo endpoint sin @Public() requiere JWT por defecto
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

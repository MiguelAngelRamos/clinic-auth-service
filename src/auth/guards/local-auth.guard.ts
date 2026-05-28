// src/auth/guards/local-auth.guard.ts
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

// Activa la LocalStrategy (email + password) para POST /auth/login
// passport-local extrae email y password del body automáticamente
@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {}

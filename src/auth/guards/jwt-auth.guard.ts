// src/auth/guards/jwt-auth.guard.ts
import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";

// Guard global — protege todos los endpoints por defecto
// Los marcados con @Public() se saltan la validación JWT
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Verificar si el handler o la clase tienen @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si es público, saltar la validación JWT completamente
    if (isPublic) return true;

    return super.canActivate(context);
  }
}

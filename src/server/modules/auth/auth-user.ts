import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** The signed-in admin, set by `JwtAuthGuard`. `clinicId` scopes every query. */
export interface AuthUser {
  id: string;
  clinicId: string;
  role: string;
  fullName: string;
}

export interface JwtPayload {
  sub: string;
  clinicId: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

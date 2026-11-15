import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { errorKey } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { accessRefusal } from './auth-core';
import type { AuthUser, JwtPayload } from './auth-user';

/**
 * Dashboard auth: `Authorization: Bearer <jwt>`. The account is re-checked on every request, so
 * a deactivated or demoted admin, or a blocked clinic, loses access before the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization?.trim() ?? '');
    if (!m) throw new UnauthorizedException(errorKey('unauthorized'));

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(m[1]);
    } catch {
      throw new UnauthorizedException(errorKey('unauthorized'));
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, clinicId: payload.clinicId },
      include: { clinic: { select: { active: true, blockAt: true } } },
    });
    if (!user) throw new UnauthorizedException(errorKey('unauthorized'));
    const refusal = accessRefusal({ user, clinic: user.clinic }, new Date());
    if (refusal) throw new ForbiddenException(errorKey(refusal));

    req.user = { id: user.id, clinicId: user.clinicId, role: user.role, fullName: user.fullName };
    return true;
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../../../shared/phone';
import { errorKey } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { pickLogin } from './auth-core';
import type { AuthUser, JwtPayload } from './auth-user';

export const BCRYPT_ROUNDS = 10;

const clinicOut = (c: {
  id: string;
  name: string;
  plan: string | null;
  expiresAt: Date | null;
}) => ({
  id: c.id,
  name: c.name,
  plan: c.plan,
  expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
});

const profileOut = (u: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
}) => ({ id: u.id, fullName: u.fullName, phone: u.phone, email: u.email, role: u.role });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(phoneRaw: string, password: string) {
    const phone = normalizePhone(phoneRaw);
    const users = phone
      ? await this.prisma.user.findMany({
          where: { phone },
          include: { clinic: true },
          orderBy: { createdAt: 'asc' },
          take: 20,
        })
      : [];
    const result = await pickLogin(
      users.map((u) => ({ user: u, clinic: u.clinic })),
      password,
      (p, h) => bcrypt.compare(p, h),
      new Date(),
    );
    if (!result.ok) {
      if (result.code === 'invalid_credentials') {
        throw new UnauthorizedException(errorKey('invalid_credentials'));
      }
      throw new ForbiddenException(errorKey(result.code));
    }
    const { user, clinic } = result.candidate;
    const payload: JwtPayload = { sub: user.id, clinicId: user.clinicId, role: user.role };
    this.logger.log(`login user=${user.id} clinic=${user.clinicId}`);
    return {
      token: await this.jwt.signAsync(payload),
      user: profileOut(user),
      clinic: clinicOut(clinic),
    };
  }

  async profile(actor: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, clinicId: actor.clinicId },
      include: { clinic: true },
    });
    if (!user) throw new NotFoundException(errorKey('not_found'));
    return { ...profileOut(user), clinic: clinicOut(user.clinic) };
  }

  async changePassword(actor: AuthUser, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, clinicId: actor.clinicId },
    });
    if (!user) throw new NotFoundException(errorKey('not_found'));
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException(errorKey('wrong_password'));
    }
    const now = new Date();
    // updatedAt moves too, so the main till pulls the new hash (staff log in there with it).
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
        updatedAt: now,
        syncedAt: now,
      },
    });
    await this.audit.record(actor, 'change_password', 'user', user.id);
    return { success: true };
  }
}

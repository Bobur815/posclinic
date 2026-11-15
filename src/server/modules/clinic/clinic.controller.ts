import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { errorKey } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

@ApiTags('clinic')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('clinic')
export class ClinicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'This clinic: licence plan/expiry (read-only) and its tills' })
  async get(@CurrentUser() user: AuthUser) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: user.clinicId },
      include: { heartbeats: { orderBy: { lastSyncAt: 'desc' } } },
    });
    if (!clinic) throw new NotFoundException(errorKey('not_found'));
    return {
      id: clinic.id,
      name: clinic.name,
      plan: clinic.plan,
      expiresAt: iso(clinic.expiresAt),
      lastSyncAt: iso(clinic.lastSyncAt),
      terminals: clinic.heartbeats.map((h) => ({
        terminalId: h.terminalId,
        lastSyncAt: h.lastSyncAt.toISOString(),
        appVersion: h.appVersion,
      })),
    };
  }
}

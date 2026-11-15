import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { optionalDate, paging } from '../../common/dates';
import { errorKey } from '../../common/errors';
import { appointmentOut } from '../../common/serialize';
import { PrismaService } from '../../prisma/prisma.service';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const include = {
  items: true,
  patient: { select: { id: true, fullName: true, phone: true, patientCode: true } },
  doctor: { select: { id: true, fullName: true } },
} as const;

/** Read-only: visits are created on the tills only. */
@ApiTags('appointments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Visits, newest first. from/to: ISO date-times, to exclusive' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'doctorId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('doctorId') doctorId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { skip, take } = paging(Number(page), Number(pageSize));
    const gte = optionalDate(from);
    const lt = optionalDate(to);
    const where: Prisma.AppointmentWhereInput = {
      clinicId: user.clinicId,
      ...(gte || lt ? { appointmentDate: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {}),
      ...(status ? { status } : {}),
      ...(doctorId ? { doctorId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include,
        orderBy: { appointmentDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return { items: rows.map(appointmentOut), total };
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const a = await this.prisma.appointment.findFirst({
      where: { id, clinicId: user.clinicId },
      include,
    });
    if (!a) throw new NotFoundException(errorKey('not_found'));
    return appointmentOut(a);
  }
}

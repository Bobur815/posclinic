import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { paging } from '../../common/dates';
import { errorKey } from '../../common/errors';
import { appointmentOut, patientOut } from '../../common/serialize';
import { PrismaService } from '../../prisma/prisma.service';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** Read-only: patients are created and edited on the tills only. */
@ApiTags('patients')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Search by name, phone or patient code' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { skip, take } = paging(Number(page), Number(pageSize));
    const q = search?.trim().slice(0, 100);
    const where: Prisma.PatientWhereInput = {
      clinicId: user.clinicId,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q.replace(/[\s()-]/g, '') } },
              { patientCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.patient.count({ where }),
    ]);
    return { items: rows.map(patientOut), total };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Patient with visit history (newest first)' })
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId: user.clinicId },
      include: {
        appointments: {
          orderBy: { appointmentDate: 'desc' },
          take: 200,
          include: { items: true, doctor: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!patient) throw new NotFoundException(errorKey('not_found'));
    return { ...patientOut(patient), visits: patient.appointments.map(appointmentOut) };
  }
}

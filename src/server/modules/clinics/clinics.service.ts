import { Injectable, NotFoundException } from '@nestjs/common';
import type { ClinicDetailResponse, ClinicListResponse } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<ClinicListResponse> {
    return this.prisma.clinic.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true, patients: true, appointments: true } },
      },
    }) as unknown as Promise<ClinicListResponse>;
  }

  async findById(id: string): Promise<ClinicDetailResponse> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, patients: true, appointments: true } },
      },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic as unknown as ClinicDetailResponse;
  }

  async update(id: string, data: UpdateClinicDto): Promise<ClinicDetailResponse> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    const updated = await this.prisma.clinic.update({
      where: { id },
      data,
      include: { _count: { select: { users: true, patients: true, appointments: true } } },
    });
    return updated as unknown as ClinicDetailResponse;
  }
}

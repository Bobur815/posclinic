import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.doctor.findMany({
      where: { clinicId },
      orderBy: { fullName: 'asc' },
    });
  }

  async findActive(clinicId: string) {
    return this.prisma.doctor.findMany({
      where: { clinicId, active: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(clinicId: string, data: {
    fullName: string;
    specialty?: string;
    phone?: string;
    active?: boolean;
  }) {
    return this.prisma.doctor.create({ data: { ...data, clinicId } });
  }

  async update(id: string, data: Partial<{
    fullName: string;
    specialty: string;
    phone: string;
    active: boolean;
  }>) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return this.prisma.doctor.update({ where: { id }, data });
  }
}

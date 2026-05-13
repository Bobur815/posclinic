import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicType } from '@prisma/client';

@Injectable()
export class ClinicsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.clinic.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  async create(data: {
    name: string;
    phone?: string;
    address?: string;
    type?: ClinicType;
  }) {
    return this.prisma.clinic.create({ data });
  }

  async update(id: string, data: Partial<{ name: string; phone: string; address: string; active: boolean }>) {
    return this.prisma.clinic.update({ where: { id }, data });
  }
}

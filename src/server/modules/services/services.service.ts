import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.service.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
    });
  }

  async findActive(clinicId: string) {
    return this.prisma.service.findMany({
      where: { clinicId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async search(clinicId: string, query: string) {
    return this.prisma.service.findMany({
      where: {
        clinicId,
        active: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(clinicId: string, data: {
    code: string;
    name: string;
    price: number;
    duration?: number;
    active?: boolean;
  }) {
    return this.prisma.service.create({ data: { ...data, clinicId } });
  }

  async update(id: string, data: Partial<{
    code: string;
    name: string;
    price: number;
    duration: number;
    active: boolean;
  }>) {
    return this.prisma.service.update({ where: { id }, data });
  }
}

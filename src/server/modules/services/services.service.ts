import { Injectable, NotFoundException } from '@nestjs/common';
import type { ServiceListResponse, ServiceMutationResponse } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateServiceDto } from './dto/create-service.dto';
import type { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string): Promise<ServiceListResponse> {
    const rows = await this.prisma.service.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
    });
    return rows as unknown as ServiceListResponse;
  }

  async findActive(clinicId: string): Promise<ServiceListResponse> {
    const rows = await this.prisma.service.findMany({
      where: { clinicId, active: true },
      orderBy: { name: 'asc' },
    });
    return rows as unknown as ServiceListResponse;
  }

  async search(clinicId: string, query: string): Promise<ServiceListResponse> {
    const rows = await this.prisma.service.findMany({
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
    return rows as unknown as ServiceListResponse;
  }

  async create(clinicId: string, data: CreateServiceDto): Promise<ServiceMutationResponse> {
    const row = await this.prisma.service.create({ data: { ...data, clinicId } });
    return row as unknown as ServiceMutationResponse;
  }

  async update(id: string, data: UpdateServiceDto): Promise<ServiceMutationResponse> {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Service not found');
    const row = await this.prisma.service.update({ where: { id }, data });
    return row as unknown as ServiceMutationResponse;
  }
}

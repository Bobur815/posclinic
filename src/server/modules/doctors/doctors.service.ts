import { Injectable, NotFoundException } from '@nestjs/common';
import type { DoctorDetailResponse, DoctorListResponse } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateDoctorDto } from './dto/create-doctor.dto';
import type { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string): Promise<DoctorListResponse> {
    const rows = await this.prisma.doctor.findMany({
      where: { clinicId },
      orderBy: { fullName: 'asc' },
    });
    return rows as unknown as DoctorListResponse;
  }

  async findActive(clinicId: string): Promise<DoctorListResponse> {
    const rows = await this.prisma.doctor.findMany({
      where: { clinicId, active: true },
      orderBy: { fullName: 'asc' },
    });
    return rows as unknown as DoctorListResponse;
  }

  async findById(id: string): Promise<DoctorDetailResponse> {
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor as unknown as DoctorDetailResponse;
  }

  async create(clinicId: string, data: CreateDoctorDto): Promise<DoctorDetailResponse> {
    const row = await this.prisma.doctor.create({ data: { ...data, clinicId } });
    return row as unknown as DoctorDetailResponse;
  }

  async update(id: string, data: UpdateDoctorDto): Promise<DoctorDetailResponse> {
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    const row = await this.prisma.doctor.update({ where: { id }, data });
    return row as unknown as DoctorDetailResponse;
  }
}

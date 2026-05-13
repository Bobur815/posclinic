import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Gender } from '@prisma/client';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, query?: string) {
    return this.prisma.patient.findMany({
      where: {
        clinicId,
        ...(query
          ? {
              OR: [
                { fullName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
                { patientCode: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: { doctor: true },
          orderBy: { appointmentDate: 'desc' },
          take: 20,
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(clinicId: string, data: {
    fullName: string;
    phone: string;
    birthDate?: string;
    gender?: Gender;
    bloodType?: string;
    allergies?: string;
    address?: string;
    city?: string;
    notes?: string;
  }) {
    const count = await this.prisma.patient.count({ where: { clinicId } });
    const patientCode = `P-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.patient.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        patientCode,
        clinicId,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender ?? null,
        bloodType: data.bloodType,
        allergies: data.allergies,
        address: data.address,
        city: data.city,
        notes: data.notes,
      },
    });
  }

  async update(id: string, data: Partial<{
    fullName: string;
    phone: string;
    birthDate: string;
    gender: Gender;
    bloodType: string;
    allergies: string;
    address: string;
    city: string;
    notes: string;
  }>) {
    return this.prisma.patient.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        gender: data.gender ?? undefined,
        bloodType: data.bloodType,
        allergies: data.allergies,
        address: data.address,
        city: data.city,
        notes: data.notes,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
      },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PatientDetailResponse,
  PatientListResponse,
  PatientMutationResponse,
} from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreatePatientDto } from './dto/create-patient.dto';
import type { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string, search?: string): Promise<PatientListResponse> {
    const rows = await this.prisma.patient.findMany({
      where: {
        clinicId,
        active: true,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { patientCode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows as unknown as PatientListResponse;
  }

  async findById(id: string): Promise<PatientDetailResponse> {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            doctor: { select: { fullName: true, specialty: true } },
            items: true,
          },
          orderBy: { appointmentDate: 'desc' },
          take: 20,
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient as unknown as PatientDetailResponse;
  }

  async create(clinicId: string, data: CreatePatientDto): Promise<PatientMutationResponse> {
    const count = await this.prisma.patient.count({ where: { clinicId } });
    const patientCode = `P-${String(count + 1).padStart(6, '0')}`;

    const row = await this.prisma.patient.create({
      data: {
        clinicId,
        patientCode,
        fullName: data.fullName,
        phone: data.phone,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender ?? null,
        bloodType: data.bloodType,
        allergies: data.allergies,
        address: data.address,
        city: data.city,
        notes: data.notes,
      },
    });
    return row as unknown as PatientMutationResponse;
  }

  async update(id: string, data: UpdatePatientDto): Promise<PatientMutationResponse> {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) throw new NotFoundException('Patient not found');

    const row = await this.prisma.patient.update({
      where: { id },
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        gender: data.gender ?? undefined,
      },
    });
    return row as unknown as PatientMutationResponse;
  }
}

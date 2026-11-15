import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizePhone } from '../../../shared/phone';
import { errorKey } from '../../common/errors';
import { doctorOut, serviceOut, userOut } from '../../common/serialize';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import type { AuthUser } from '../auth/auth-user';
import { changedFields, isSelfLockout, nullable } from './catalog-core';
import type {
  CreateDoctorDto,
  CreateServiceDto,
  CreateUserDto,
  UpdateDoctorDto,
  UpdateServiceDto,
  UpdateUserDto,
} from './dto/catalog.dto';

/**
 * Web edits of the catalog (services, doctors, staff). Every write stamps
 * `updatedAt = syncedAt = now`, so the main till pulls it and it wins last-write-wins against
 * older till edits, and writes an AuditLog row in the same transaction.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private notFound(): never {
    throw new NotFoundException(errorKey('not_found'));
  }

  // ── Services ──────────────────────────────────────────────────────────────────────────────

  async listServices(clinicId: string) {
    const rows = await this.prisma.service.findMany({
      where: { clinicId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return rows.map(serviceOut);
  }

  private async assertCodeFree(
    tx: Prisma.TransactionClient,
    clinicId: string,
    code: string,
    id?: string,
  ) {
    const other = await tx.service.findUnique({ where: { clinicId_code: { clinicId, code } } });
    if (other && other.id !== id) throw new ConflictException(errorKey('code_taken'));
  }

  createService(actor: AuthUser, dto: CreateServiceDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const code = dto.code.trim();
      await this.assertCodeFree(tx, actor.clinicId, code);
      const row = await tx.service.create({
        data: {
          id: randomUUID(),
          clinicId: actor.clinicId,
          code,
          name: dto.name.trim(),
          description: nullable(dto.description) ?? null,
          price: dto.price,
          duration: dto.duration ?? 30,
          active: dto.active ?? true,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
        },
      });
      await this.audit.record(actor, 'create', 'service', row.id, undefined, tx);
      return serviceOut(row);
    });
  }

  updateService(actor: AuthUser, id: string, dto: UpdateServiceDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.service.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!existing) this.notFound();
      const code = dto.code?.trim();
      if (code !== undefined) await this.assertCodeFree(tx, actor.clinicId, code, id);
      const data = {
        code,
        name: dto.name?.trim(),
        description: nullable(dto.description),
        price: dto.price,
        duration: dto.duration,
        active: dto.active,
      };
      const row = await tx.service.update({
        where: { id },
        data: { ...data, updatedAt: now, syncedAt: now },
      });
      await this.audit.record(actor, 'update', 'service', id, { fields: changedFields(data) }, tx);
      return serviceOut(row);
    });
  }

  // ── Doctors ───────────────────────────────────────────────────────────────────────────────

  async listDoctors(clinicId: string) {
    const rows = await this.prisma.doctor.findMany({
      where: { clinicId },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
    return rows.map(doctorOut);
  }

  createDoctor(actor: AuthUser, dto: CreateDoctorDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.doctor.create({
        data: {
          id: randomUUID(),
          clinicId: actor.clinicId,
          fullName: dto.fullName.trim(),
          phone: nullable(dto.phone) ?? null,
          specialty: nullable(dto.specialty) ?? null,
          licenseNo: nullable(dto.licenseNo) ?? null,
          active: dto.active ?? true,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
        },
      });
      await this.audit.record(actor, 'create', 'doctor', row.id, undefined, tx);
      return doctorOut(row);
    });
  }

  updateDoctor(actor: AuthUser, id: string, dto: UpdateDoctorDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.doctor.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!existing) this.notFound();
      const data = {
        fullName: dto.fullName?.trim(),
        phone: nullable(dto.phone),
        specialty: nullable(dto.specialty),
        licenseNo: nullable(dto.licenseNo),
        active: dto.active,
      };
      const row = await tx.doctor.update({
        where: { id },
        data: { ...data, updatedAt: now, syncedAt: now },
      });
      await this.audit.record(actor, 'update', 'doctor', id, { fields: changedFields(data) }, tx);
      return doctorOut(row);
    });
  }

  // ── Users (staff) ─────────────────────────────────────────────────────────────────────────

  async listUsers(clinicId: string) {
    const rows = await this.prisma.user.findMany({
      where: { clinicId },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
    return rows.map(userOut);
  }

  private phoneOf(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException(errorKey('phone_invalid'));
    return phone;
  }

  private async assertPhoneFree(
    tx: Prisma.TransactionClient,
    clinicId: string,
    phone: string,
    id?: string,
  ) {
    const other = await tx.user.findUnique({ where: { clinicId_phone: { clinicId, phone } } });
    if (other && other.id !== id) throw new ConflictException(errorKey('phone_taken'));
  }

  async createUser(actor: AuthUser, dto: CreateUserDto) {
    const phone = this.phoneOf(dto.phone);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.assertPhoneFree(tx, actor.clinicId, phone);
      const row = await tx.user.create({
        data: {
          id: randomUUID(),
          clinicId: actor.clinicId,
          fullName: dto.fullName.trim(),
          phone,
          email: nullable(dto.email) ?? null,
          role: dto.role,
          active: dto.active ?? true,
          passwordHash,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
        },
      });
      await this.audit.record(actor, 'create', 'user', row.id, { role: row.role }, tx);
      return userOut(row);
    });
  }

  updateUser(actor: AuthUser, id: string, dto: UpdateUserDto) {
    if (isSelfLockout(actor.id, id, dto)) {
      throw new ForbiddenException(errorKey('self_demote'));
    }
    const phone = dto.phone !== undefined ? this.phoneOf(dto.phone) : undefined;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!existing) this.notFound();
      if (phone !== undefined) await this.assertPhoneFree(tx, actor.clinicId, phone, id);
      const data = {
        fullName: dto.fullName?.trim(),
        phone,
        email: nullable(dto.email),
        role: dto.role,
        active: dto.active,
      };
      const row = await tx.user.update({
        where: { id },
        data: { ...data, updatedAt: now, syncedAt: now },
      });
      await this.audit.record(
        actor,
        'update',
        'user',
        id,
        { fields: changedFields(data), ...(dto.role ? { role: dto.role } : {}) },
        tx,
      );
      return userOut(row);
    });
  }

  async resetPassword(actor: AuthUser, id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { id, clinicId: actor.clinicId } });
      if (!existing) this.notFound();
      await tx.user.update({
        where: { id },
        data: { passwordHash, updatedAt: now, syncedAt: now },
      });
      await this.audit.record(actor, 'reset_password', 'user', id, undefined, tx);
      return { success: true };
    });
  }
}

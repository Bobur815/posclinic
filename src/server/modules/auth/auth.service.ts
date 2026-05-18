import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type {
  ChangePasswordResponse,
  CreateClinicResponse,
  ElectronSetupResponse,
  GoogleLoginResponse,
  LoginResponse,
  ProfileResponse,
  RequestOtpResponse,
  SetPasswordResponse,
  SuccessMessageResponse,
  VerifyOtpResponse,
} from '../../common/interfaces';
import { EmailService } from '../../common/services/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { ElectronSetupDto } from './dto/register.dto';
import type { GoogleUser } from './jwt/google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true },
      include: {
        tenant: { select: { id: true, organizationName: true, isActive: true } },
        clinic: { select: { id: true, name: true, active: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.tenant.isActive) throw new UnauthorizedException('Organization is inactive');

    if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPERADMIN') {
      if (!user.clinicId) throw new UnauthorizedException('clinicId is required');
      if (!user.clinic?.active) throw new UnauthorizedException('Clinic is inactive');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginPlatform: 'WEB' },
    });

    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { lastAccessedAt: new Date() },
    });

    const token = this.signToken(
      user.id,
      user.tenantId,
      user.clinicId ?? undefined,
      user.role,
      user.email,
    );

    return {
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        clinicId: user.clinicId ?? null,
        organizationName: user.tenant.organizationName,
        clinicName: user.clinic?.name ?? null,
      },
    };
  }

  async electronSetup(dto: ElectronSetupDto): Promise<ElectronSetupResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { clinicCode: dto.clinicCode },
    });
    if (!tenant) throw new NotFoundException('Clinic code not found');
    if (!tenant.isActive) throw new BadRequestException('Organization is inactive');

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: tenant.id, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginPlatform: 'ELECTRON' },
    });
    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { primaryPlatform: 'ELECTRON', lastAccessedAt: new Date() },
    });

    const token = this.signToken(
      user.id,
      tenant.id,
      user.clinicId ?? undefined,
      user.role,
      user.email,
      '30d',
    );

    return {
      token,
      tenant: { id: tenant.id, name: tenant.organizationName, clinicCode: tenant.clinicCode },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  // ── OTP: Email Verification ──────────────────────────────────────────────────

  async requestOtp(email: string): Promise<RequestOtpResponse> {
    const user = await this.prisma.user.findFirst({ where: { email } });

    // Block if already registered and verified — they should use login/forgot-password instead
    if (user?.emailVerified) {
      throw new BadRequestException(
        'Email is already registered. Please login or use forgot-password.',
      );
    }

    await this.sendOtpToEmail(email, 'EMAIL_VERIFICATION');
    return { success: true, message: 'OTP sent to your email' };
  }

  async verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const otp = await this.prisma.otpVerification.findFirst({
      where: {
        email,
        code,
        type: 'EMAIL_VERIFICATION',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('Invalid or expired OTP code');

    await this.prisma.otpVerification.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.findFirst({ where: { email } });
    if (user) {
      // Existing user (e.g. re-verifying email) — mark verified and return
      await this.prisma.user.updateMany({ where: { email }, data: { emailVerified: true } });
      return { success: true, isNewUser: false, message: 'Email verified successfully' };
    }

    // New user — issue a short-lived registration token to carry state across steps
    const registrationToken = this.jwtService.sign(
      { email, regStep: 'EMAIL_VERIFIED' },
      { expiresIn: '30m' },
    );
    return { success: true, isNewUser: true, registrationToken };
  }

  // ── Registration Step 2: set password ────────────────────────────────────────

  async setPassword(
    registrationToken: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<SetPasswordResponse> {
    let payload: { email: string; regStep: string };
    try {
      payload = this.jwtService.verify(registrationToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired registration token');
    }
    if (payload.regStep !== 'EMAIL_VERIFIED') {
      throw new UnauthorizedException(
        'Invalid registration step — complete email verification first',
      );
    }

    const existing = await this.prisma.user.findFirst({ where: { email: payload.email } });
    if (existing?.emailVerified) throw new ConflictException('Email is already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const setupToken = this.jwtService.sign(
      { email: payload.email, regStep: 'PASSWORD_SET', passwordHash, firstName, lastName },
      { expiresIn: '30m' },
    );
    return { setupToken };
  }

  // ── Registration Step 3: create clinic / tenant ───────────────────────────────

  async createClinic(
    setupToken: string,
    organizationName: string,
    opts: {
      organizationNameUz?: string;
      organizationNameRu?: string;
      contactPhone?: string;
      address?: string;
      city?: string;
      region?: string;
    } = {},
  ): Promise<CreateClinicResponse> {
    let payload: {
      email: string;
      regStep: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
    };
    try {
      payload = this.jwtService.verify(setupToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired setup token');
    }
    if (payload.regStep !== 'PASSWORD_SET') {
      throw new UnauthorizedException('Invalid registration step — set password first');
    }

    const existing = await this.prisma.user.findFirst({ where: { email: payload.email } });
    if (existing?.emailVerified) throw new ConflictException('Email is already registered');

    const clinicCode = this.generateClinicCode();
    const slug = organizationName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          organizationName,
          organizationNameUz: opts.organizationNameUz,
          organizationNameRu: opts.organizationNameRu,
          slug: `${slug}-${Date.now()}`,
          clinicCode,
          contactEmail: payload.email,
          contactPhone: opts.contactPhone,
          address: opts.address,
          city: opts.city ?? 'Tashkent',
          region: opts.region,
          subscriptionTier: 'TRIAL',
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          primaryPlatform: 'WEB',
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: payload.email,
          password: payload.passwordHash,
          firstName: payload.firstName,
          lastName: payload.lastName,
          role: 'SUPERADMIN',
          isActive: true,
          emailVerified: true,
        },
      });

      return { tenant, user };
    });

    const token = this.signToken(
      result.user.id,
      result.tenant.id,
      undefined,
      result.user.role,
      result.user.email,
      '7d',
    );

    return {
      token,
      clinicCode: result.tenant.clinicCode,
      tenant: {
        id: result.tenant.id,
        organizationName: result.tenant.organizationName,
        clinicCode: result.tenant.clinicCode,
      },
      user: {
        id: result.user.id,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId,
        emailVerified: true,
      },
    };
  }

  // ── OTP: Forgot Password ─────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<SuccessMessageResponse> {
    const user = await this.prisma.user.findFirst({ where: { email } });
    // Always respond success to prevent email enumeration
    if (!user) return { success: true, message: 'If that email exists, a reset code was sent' };

    await this.sendOtpToEmail(email, 'PASSWORD_RESET');
    return { success: true, message: 'If that email exists, a reset code was sent' };
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<SuccessMessageResponse> {
    const otp = await this.prisma.otpVerification.findFirst({
      where: {
        email,
        code,
        type: 'PASSWORD_RESET',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('Invalid or expired reset code');

    await this.prisma.otpVerification.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.updateMany({
      where: { email },
      data: { password: hash },
    });

    return { success: true, message: 'Password reset successfully' };
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  async googleLogin(googleUser: GoogleUser): Promise<GoogleLoginResponse> {
    // Find existing user by email across all tenants
    let user = await this.prisma.user.findFirst({
      where: { email: googleUser.email, isActive: true },
      include: { tenant: { select: { id: true, organizationName: true, isActive: true } } },
    });

    if (user) {
      // Update googleId if not already set
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleUser.googleId,
            emailVerified: true,
            lastLoginAt: new Date(),
            lastLoginPlatform: 'WEB',
          },
          include: { tenant: { select: { id: true, organizationName: true, isActive: true } } },
        });
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), lastLoginPlatform: 'WEB' },
        });
      }

      if (!user.tenant.isActive) throw new UnauthorizedException('Organization is inactive');
    } else {
      // New user via Google → create tenant + SUPERADMIN
      const slug = googleUser.email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      const clinicCode = this.generateClinicCode();

      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            organizationName: `${googleUser.firstName}'s Organization`,
            slug: `${slug}-${Date.now()}`,
            clinicCode,
            contactEmail: googleUser.email,
            subscriptionTier: 'TRIAL',
            subscriptionStatus: 'TRIAL',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            primaryPlatform: 'WEB',
          },
        });

        const newUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: googleUser.email,
            googleId: googleUser.googleId,
            password: await bcrypt.hash(Math.random().toString(36), 10),
            firstName: googleUser.firstName,
            lastName: googleUser.lastName ?? '',
            role: 'SUPERADMIN',
            isActive: true,
            emailVerified: googleUser.verified,
            lastLoginAt: new Date(),
            lastLoginPlatform: 'WEB',
          },
          include: { tenant: { select: { id: true, organizationName: true, isActive: true } } },
        });

        return newUser;
      });

      user = result;
    }

    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { lastAccessedAt: new Date() },
    });

    const token = this.signToken(
      user.id,
      user.tenantId,
      user.clinicId ?? undefined,
      user.role,
      user.email,
    );

    return {
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        clinicId: user.clinicId ?? null,
        organizationName: user.tenant.organizationName,
      },
    };
  }

  // ── Existing methods ─────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        tenantId: true,
        clinicId: true,
        isActive: true,
        emailVerified: true,
        tenant: { select: { organizationName: true } },
        clinic: { select: { name: true, type: true } },
      },
    });
    if (!user?.isActive) throw new NotFoundException('User not found');
    return user;
  }

  async validateToken(payload: {
    sub: string;
    tenantId: string;
    clinicId?: string;
    role: string;
    email: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        tenantId: true,
        clinicId: true,
        isActive: true,
      },
    });
    if (!user?.isActive) return null;
    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Wrong current password');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return { success: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async sendOtpToEmail(email: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + (type === 'PASSWORD_RESET' ? 10 : 2) * 60 * 1000);

    await this.prisma.otpVerification.create({ data: { email, code, type, expiresAt } });

    if (type === 'PASSWORD_RESET') {
      await this.emailService.sendPasswordResetOtp(email, code);
    } else {
      await this.emailService.sendOtpCode(email, code);
    }
  }

  private signToken(
    userId: string,
    tenantId: string,
    clinicId: string | undefined,
    role: string,
    email: string,
    expiresIn = '7d',
  ) {
    const payload: Record<string, unknown> = { sub: userId, tenantId, role, email };
    if (clinicId) payload.clinicId = clinicId;
    return this.jwtService.sign(payload, { expiresIn });
  }

  private generateClinicCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'PC-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
}

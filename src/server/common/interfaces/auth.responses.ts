import type { ClinicType, ISODateString, JwtToken, UserRole } from './base';

// ── Shared sub-shapes ────────────────────────────────────────────────────────

export interface AuthUserInToken {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: UserRole;
  tenantId: string;
  clinicId: string | null;
  organizationName: string;
}

// ── POST /auth/login ─────────────────────────────────────────────────────────

export interface LoginResponse {
  token: JwtToken;
  user: AuthUserInToken & { clinicName: string | null };
}

// ── POST /auth/electron/setup ────────────────────────────────────────────────

export interface ElectronSetupResponse {
  token: JwtToken;
  tenant: { id: string; name: string; clinicCode: string };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: UserRole;
  };
}

// ── POST /auth/request-otp ───────────────────────────────────────────────────

export interface RequestOtpResponse {
  success: true;
  message: string;
}

// ── POST /auth/verify-otp ────────────────────────────────────────────────────

export type VerifyOtpResponse =
  | { success: true; isNewUser: true; registrationToken: string }
  | { success: true; isNewUser: false; message: string };

// ── POST /auth/set-password ──────────────────────────────────────────────────

export interface SetPasswordResponse {
  setupToken: string;
}

// ── POST /auth/create-clinic ─────────────────────────────────────────────────

export interface CreateClinicResponse {
  token: JwtToken;
  clinicCode: string;
  tenant: { id: string; organizationName: string; clinicCode: string };
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: UserRole;
    tenantId: string;
    emailVerified: boolean;
  };
}

// ── POST /auth/forgot-password ───────────────────────────────────────────────
// ── POST /auth/reset-password ────────────────────────────────────────────────

export interface SuccessMessageResponse {
  success: true;
  message: string;
}

// ── POST /auth/logout ────────────────────────────────────────────────────────

export interface LogoutResponse {
  success: true;
}

// ── PUT /auth/change-password ────────────────────────────────────────────────

export interface ChangePasswordResponse {
  success: true;
}

// ── GET /auth/profile ────────────────────────────────────────────────────────

export interface ProfileResponse {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: UserRole;
  tenantId: string;
  clinicId: string | null;
  isActive: boolean;
  emailVerified: boolean;
  tenant: { organizationName: string } | null;
  clinic: { name: string; type: ClinicType } | null;
}

// ── GET /auth/google/callback ────────────────────────────────────────────────
// (Google OAuth redirects — same user shape as LoginResponse, no clinicName)

export interface GoogleLoginResponse {
  token: JwtToken;
  user: AuthUserInToken;
}

// ── Internal: token JWT payload ──────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  tenantId: string;
  clinicId?: string;
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}

// ── Internal: validated user attached to request ─────────────────────────────

export interface RequestUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: UserRole;
  tenantId: string;
  clinicId: string | null;
  isActive: boolean;
}

// ── Internal: timestamp fields in responses ───────────────────────────────────

export type WithTimestamps = { createdAt: ISODateString; updatedAt: ISODateString };

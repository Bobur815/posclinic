// Primitive aliases
export type ISODateString = string;
export type JwtToken = string;

// Enums mirrored from Prisma schema
export type UserRole = 'PLATFORM_ADMIN' | 'SUPERADMIN' | 'ADMIN' | 'NURSE' | 'PATIENT';
export type Gender = 'MALE' | 'FEMALE';
export type ClinicType =
  | 'GENERAL'
  | 'DENTAL'
  | 'OPHTHALMOLOGY'
  | 'PEDIATRIC'
  | 'ORTHOPEDIC'
  | 'DERMATOLOGY'
  | 'CARDIOLOGY'
  | 'NEUROLOGY'
  | 'OTHER';
export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'INSURANCE';
export type SubscriptionTier = 'TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
export type Platform = 'WEB' | 'ELECTRON';

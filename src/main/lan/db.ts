import type { PrismaClient } from '../../generated/prisma-sqlite';

/** The part of the till's Prisma client the LAN code uses. */
export type LanDb = Pick<PrismaClient, 'setting' | 'lanDevice' | 'localConfig'>;

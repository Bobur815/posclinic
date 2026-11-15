import type { AdminUnitDto } from '../../shared/address';
import { getPrismaClient } from '../database/sqlite-client';
import { handle, RefusedError } from './ipc-safe';

/**
 * Uzbekistan addresses (SOATO) for the AddressSelector. Reads the till's own `admin_units`
 * table, so it works offline; on a satellite the calls go to the main till like any other.
 */

const SELECT = {
  code: true,
  parentCode: true,
  type: true,
  level: true,
  nameUz: true,
  nameUzCyrl: true,
  nameRu: true,
  nameEn: true,
} as const;

const CODE = /^\d{4,10}$/;

export function setupAddressHandlers(): void {
  /** All active top-level units: 12 regions, Karakalpakstan, Tashkent City. */
  handle(
    'addresses:regions',
    // type/level were validated against AdminUnitType by the importer (admin-units.ts).
    async (): Promise<AdminUnitDto[]> =>
      getPrismaClient().adminUnit.findMany({
        where: { level: 1, active: true },
        select: SELECT,
        orderBy: { code: 'asc' },
      }) as Promise<AdminUnitDto[]>,
  );

  /**
   * Active children of a unit: districts and cities of a region. A district has none (mahallas
   * are not in the dataset), so it answers an empty list rather than an error.
   */
  handle('addresses:children', async (_ctx, parentCode: unknown): Promise<AdminUnitDto[]> => {
    if (typeof parentCode !== 'string' || !CODE.test(parentCode)) {
      throw new RefusedError('errors.invalidAddress');
    }
    const db = getPrismaClient();
    const parent = await db.adminUnit.findUnique({
      where: { code: parentCode },
      select: { code: true },
    });
    if (!parent) throw new RefusedError('errors.invalidAddress');
    return db.adminUnit.findMany({
      where: { parentCode, active: true },
      select: SELECT,
      orderBy: { nameUz: 'asc' },
    }) as Promise<AdminUnitDto[]>;
  });
}

export interface ResolvedAddress {
  regionCode: string | null;
  districtCode: string | null;
  /** "District, Region" in Uzbek, kept in `patients.city` for the server/web, which have no dataset. */
  city: string | null;
}

/**
 * Validates a submitted region/district pair against the till's dataset: both must exist and be
 * active, the region must be top-level, and the district must belong to that region. Codes are
 * what get stored, so the address does not depend on the display language. `undefined` for both
 * means "address not part of this update".
 */
export async function resolveAddress(
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma client or transaction
  db: any,
  regionCode: unknown,
  districtCode: unknown,
): Promise<ResolvedAddress | undefined> {
  if (regionCode === undefined && districtCode === undefined) return undefined;
  const region = regionCode === null || regionCode === '' ? null : regionCode;
  const district = districtCode === null || districtCode === '' ? null : districtCode;
  if (region === null) {
    if (district !== null) throw new RefusedError('errors.invalidAddress');
    return { regionCode: null, districtCode: null, city: null };
  }
  if (typeof region !== 'string' || !CODE.test(region))
    throw new RefusedError('errors.invalidAddress');
  if (district !== null && (typeof district !== 'string' || !CODE.test(district))) {
    throw new RefusedError('errors.invalidAddress');
  }

  const units: { code: string; parentCode: string | null; level: number; nameUz: string }[] =
    await db.adminUnit.findMany({
      where: { code: { in: district ? [region, district] : [region] }, active: true },
      select: { code: true, parentCode: true, level: true, nameUz: true },
    });
  const r = units.find((u) => u.code === region);
  if (!r || r.level !== 1) throw new RefusedError('errors.invalidAddress');
  if (!district) return { regionCode: r.code, districtCode: null, city: r.nameUz };
  const d = units.find((u) => u.code === district);
  if (!d || d.parentCode !== r.code) throw new RefusedError('errors.invalidAddress');
  return { regionCode: r.code, districtCode: d.code, city: `${d.nameUz}, ${r.nameUz}` };
}

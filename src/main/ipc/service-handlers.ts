import { handle, ipcSafe, RefusedError, requireAdmin, errorSummary } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { isUniqueConflict } from './appointment-handlers';
import {
  RESULT_TYPES,
  type ResultType,
  SERVICE_KINDS,
  type ServiceKind,
} from '../../shared/clinic';
import { MXIK_PATTERN, PACKAGE_CODE_PATTERN } from '../../shared/fiscal-codes';
import {
  mxikPackages,
  searchMxik,
  type TasnifLang,
  TasnifUnavailableError,
} from '../fiscal/tasnif';

/**
 * A service's fiscal codes (v2.6): undefined = unchanged; null / '' = none (the kind's default from
 * Settings → Fiscal receipt). An MXIK is 17 digits; a package code goes with its MXIK, so clearing
 * the MXIK clears it too.
 */
export function fiscalCodeFields(
  data: Record<string, unknown>,
  current?: { mxik: string | null; packageCode: string | null },
): { mxik?: string | null; packageCode?: string | null } {
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, '') : v);
  const out: { mxik?: string | null; packageCode?: string | null } = {};
  if (data.mxik !== undefined) {
    const m = clean(data.mxik);
    if (m === null || m === '') out.mxik = null;
    else if (typeof m === 'string' && MXIK_PATTERN.test(m)) out.mxik = m;
    else throw new RefusedError('errors.invalidMxik');
  }
  if (data.packageCode !== undefined) {
    const p = clean(data.packageCode);
    if (p === null || p === '') out.packageCode = null;
    else if (typeof p === 'string' && PACKAGE_CODE_PATTERN.test(p)) out.packageCode = p;
    else throw new RefusedError('errors.invalidPackageCode');
  }
  const mxik = out.mxik !== undefined ? out.mxik : (current?.mxik ?? null);
  if (mxik === null && (out.packageCode ?? current?.packageCode ?? null) !== null) {
    out.packageCode = null;
  }
  return out;
}

const TASNIF_LANGS: readonly TasnifLang[] = ['uz_latn', 'uz_cyrl', 'ru'];
const tasnifLang = (v: unknown): TasnifLang =>
  TASNIF_LANGS.includes(v as TasnifLang) ? (v as TasnifLang) : 'uz_latn';

/** tasnif being unreachable is a refusal the form can show; anything else is a bug. */
async function askTasnif<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TasnifUnavailableError) {
      log.warn(`[services] ${error.message}`);
      throw new RefusedError('errors.tasnifUnavailable');
    }
    throw error;
  }
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null;

/**
 * Type fields of a service, made consistent: only a consultation can be a follow-up, and only an
 * analysis has a result type (QUALITATIVE unless chosen), unit and reference range. `current`
 * is the stored row on update, so a partial update keeps the rules.
 */
export function serviceTypeFields(
  data: Record<string, unknown>,
  current?: {
    kind: string;
    isFollowUp: boolean;
    resultType: string | null;
    resultUnit: string | null;
    referenceRange: string | null;
  },
) {
  const kind = (data.kind ?? current?.kind ?? 'PROCEDURE') as ServiceKind;
  if (!SERVICE_KINDS.includes(kind)) throw new RefusedError('errors.invalidServiceKind');
  const rt = (data.resultType !== undefined ? data.resultType : current?.resultType) as
    | ResultType
    | null
    | undefined;
  if (rt != null && !RESULT_TYPES.includes(rt)) throw new RefusedError('errors.invalidServiceKind');
  const analysis = kind === 'ANALYSIS';
  return {
    kind,
    isFollowUp:
      kind === 'CONSULTATION' &&
      (data.isFollowUp !== undefined ? data.isFollowUp === true : current?.isFollowUp === true),
    resultType: analysis ? (rt ?? 'QUALITATIVE') : null,
    resultUnit: analysis
      ? data.resultUnit !== undefined
        ? text(data.resultUnit)
        : (current?.resultUnit ?? null)
      : null,
    referenceRange: analysis
      ? data.referenceRange !== undefined
        ? text(data.referenceRange)
        : (current?.referenceRange ?? null)
      : null,
  };
}

/** Largest stored picture: the till resizes to ≤ 256 px before saving, so this is generous. */
export const SERVICE_IMAGE_MAX = 300_000;

/**
 * A service picture as sent by ServiceList: undefined = unchanged, null / '' = remove, otherwise
 * a PNG / JPEG / WebP data URL within SERVICE_IMAGE_MAX characters.
 */
export function serviceImage(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (
    typeof v !== 'string' ||
    v.length > SERVICE_IMAGE_MAX ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)
  ) {
    throw new RefusedError('errors.invalidImage');
  }
  return v;
}

function codeTaken(error: unknown): never {
  if (isUniqueConflict(error, ['code'])) throw new RefusedError('errors.codeTaken');
  throw error;
}

/**
 * A service's custom type: undefined = unchanged, null / '' = none, otherwise an active type; the
 * type's behaviour becomes the service's kind (the request's kind is ignored).
 */
async function withServiceType(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (data.serviceTypeId === undefined) return data;
  if (data.serviceTypeId === null || data.serviceTypeId === '') {
    return { ...data, serviceTypeId: null };
  }
  const type = await getPrismaClient().serviceType.findUnique({
    where: { id: String(data.serviceTypeId) },
  });
  if (!type || !type.active) throw new RefusedError('errors.invalidServiceKind');
  return { ...data, serviceTypeId: type.id, kind: type.behavior };
}

export function setupServiceHandlers(): void {
  handle('services:getAll', async () => {
    try {
      const prisma = getPrismaClient();
      const services = await prisma.service.findMany({
        orderBy: { name: 'asc' },
      });
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:getAll]', errorSummary(error));
      throw error;
    }
  });

  handle('services:getActive', async () => {
    try {
      const prisma = getPrismaClient();
      const services = await prisma.service.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      });
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:getActive]', errorSummary(error));
      throw error;
    }
  });

  handle('services:search', async (_event, query: string) => {
    try {
      const prisma = getPrismaClient();
      const q = String(query ?? '').trim();
      if (!q) return [];
      const services = await prisma.service.findMany({
        where: { active: true, OR: [{ name: { contains: q } }, { code: { contains: q } }] },
        orderBy: { name: 'asc' },
        take: 30,
      });
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:search]', errorSummary(error));
      throw error;
    }
  });

  handle('services:create', async (ctx, raw: Record<string, unknown>) => {
    try {
      requireAdmin(ctx);
      const data = await withServiceType(raw ?? {});
      const prisma = getPrismaClient();
      const { randomUUID } = await import('crypto');
      const service = await prisma.service.create({
        data: {
          id: randomUUID(),
          code: data.code as string,
          name: data.name as string,
          description: (data.description as string) || null,
          price: data.price as number,
          duration: (data.duration as number) || 30,
          ...serviceTypeFields(data),
          image: serviceImage(data.image) ?? null,
          ...fiscalCodeFields(data),
          serviceTypeId: (data.serviceTypeId as string | null | undefined) ?? null,
          active: data.active !== false,
        },
      }).catch(codeTaken);
      return ipcSafe(service);
    } catch (error) {
      log.error('[services:create]', errorSummary(error));
      throw error;
    }
  });

  // v2.6: MXIK lookups on tasnif.soliq.uz for the services form (admins; only the words are sent).
  handle('services:searchMxik', async (ctx, text: unknown, lang: unknown) => {
    requireAdmin(ctx);
    return askTasnif(() => searchMxik(String(text ?? ''), tasnifLang(lang)));
  });

  handle('services:mxikPackages', async (ctx, mxik: unknown, lang: unknown) => {
    requireAdmin(ctx);
    return askTasnif(() => mxikPackages(String(mxik ?? ''), tasnifLang(lang)));
  });

  handle('services:update', async (ctx, id: string, raw: Record<string, unknown>) => {
    try {
      requireAdmin(ctx);
      const data = await withServiceType(raw ?? {});
      const prisma = getPrismaClient();
      const current = await prisma.service.findUnique({ where: { id } });
      if (!current) throw new RefusedError('errors.notFound');
      const service = await prisma.service.update({
        where: { id },
        data: {
          code: data.code as string | undefined,
          name: data.name as string | undefined,
          description: data.description as string | null | undefined,
          price: data.price as number | undefined,
          duration: data.duration as number | undefined,
          ...serviceTypeFields(data, current),
          image: serviceImage(data.image),
          ...fiscalCodeFields(data, current),
          serviceTypeId: data.serviceTypeId as string | null | undefined,
          active: data.active as boolean | undefined,
        },
      }).catch(codeTaken);
      return ipcSafe(service);
    } catch (error) {
      log.error('[services:update]', errorSummary(error));
      throw error;
    }
  });
}

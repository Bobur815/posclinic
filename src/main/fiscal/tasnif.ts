/**
 * tasnif.soliq.uz lookups for MXIK (IKPU) codes, from the main process (no browser CORS). posgro's
 * src/main/fiscal/tasnif.ts searches goods by barcode; a clinic sells services, which that search
 * (`elasticsearch/search`) does not index. Checked live 2026-11-16:
 *
 *   - services: `mxik/search/by-params?text=<words>&lang=…` (only `text` and `mxikCode` filter);
 *     medical services are class 10902 (consultations 10902001…, diagnostics 10902002…,
 *     procedures 10902003…);
 *   - package codes: `integration-mxik/get/history/<mxik>` → `packageNames` (a service has one,
 *     "xizmat (marta)"; each MXIK has its own code).
 *
 * Only the search words leave the till: never patient data. Electron-free (global fetch,
 * injectable), so tests run it against a local fake server.
 */

export const TASNIF_URL = 'https://tasnif.soliq.uz/api/cls-api';
export const MXIK_PATTERN = /^\d{17}$/;

export type TasnifLang = 'uz_latn' | 'uz_cyrl' | 'ru';

export interface MxikHit {
  code: string;
  name: string;
  /** e.g. "Медицинские услуги" */
  className: string;
  groupName: string;
}

export interface MxikPackage {
  code: string;
  name: string;
}

export interface TasnifOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Thrown when tasnif could not be asked (offline, HTTP error, a body it does not usually send). */
export class TasnifUnavailableError extends Error {
  constructor(reason: string) {
    super(`tasnif unavailable: ${reason}`);
    this.name = 'TasnifUnavailableError';
  }
}

async function getJson(path: string, opts: TasnifOptions): Promise<unknown> {
  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(`${opts.baseUrl ?? TASNIF_URL}${path}`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch (e) {
    throw new TasnifUnavailableError(e instanceof Error ? e.name : 'network');
  }
  if (!res.ok) throw new TasnifUnavailableError(`HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new TasnifUnavailableError('not JSON');
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * MXIK codes whose names match the words, services first (codes starting with 1), one row per
 * code (tasnif repeats rows per language variant). An empty or one-letter query asks nothing.
 */
export async function searchMxik(
  text: string,
  lang: TasnifLang = 'uz_latn',
  opts: TasnifOptions = {},
): Promise<MxikHit[]> {
  const q = String(text ?? '')
    .trim()
    .slice(0, 100);
  if (q.length < 2) return [];
  // A code typed in full is looked up as a code.
  const param = MXIK_PATTERN.test(q) ? `mxikCode=${q}` : `text=${encodeURIComponent(q)}`;
  const json = (await getJson(
    `/mxik/search/by-params?${param}&size=50&page=0&lang=${lang}`,
    opts,
  )) as { success?: boolean; data?: { content?: unknown } } | null;
  const rows = json?.data?.content;
  if (!json?.success || !Array.isArray(rows)) throw new TasnifUnavailableError('unexpected body');
  const seen = new Set<string>();
  const hits: MxikHit[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const code = str(r.mxikCode);
    if (!MXIK_PATTERN.test(code) || seen.has(code)) continue;
    seen.add(code);
    hits.push({
      code,
      name: str(r.mxikName) || str(r.subPositionName) || str(r.positionName),
      className: str(r.className),
      groupName: str(r.groupName),
    });
  }
  // Services (1xx groups) before goods: a clinic looks for services first.
  return hits.sort((a, b) => Number(b.code.startsWith('1')) - Number(a.code.startsWith('1')));
}

/** The package (unit) codes registered for an MXIK; [] when tasnif has none. */
export async function mxikPackages(
  mxik: string,
  lang: TasnifLang = 'uz_latn',
  opts: TasnifOptions = {},
): Promise<MxikPackage[]> {
  if (!MXIK_PATTERN.test(String(mxik ?? ''))) return [];
  const json = (await getJson(`/integration-mxik/get/history/${mxik}`, opts)) as {
    data?: { packageNames?: unknown } | null;
  } | null;
  const list = json?.data?.packageNames;
  if (!Array.isArray(list)) return [];
  const out: MxikPackage[] = [];
  for (const p of list as Array<Record<string, unknown>>) {
    const code = p.code === undefined || p.code === null ? '' : String(p.code).trim();
    if (!/^\d{1,20}$/.test(code)) continue;
    const name =
      (lang === 'ru' ? str(p.nameRu) : lang === 'uz_cyrl' ? str(p.nameUz) : str(p.nameLat)) ||
      str(p.nameLat) ||
      str(p.nameUz) ||
      str(p.nameRu);
    out.push({ code, name });
  }
  return out;
}

export interface PackageAnswer {
  packages: MxikPackage[];
  /** tasnif could not be asked (offline, slow): the code is typed by hand. */
  unavailable: boolean;
}

/** What tasnif calls a service's one package ("xizmat (marta)"), in each language. */
const SERVICE_UNIT: Record<TasnifLang, string> = {
  uz_latn: 'xizmat (marta)',
  uz_cyrl: 'хизмат (марта)',
  ru: 'услуга (раз)',
};

/**
 * Package codes for the MXIK fields, without asking tasnif more than needed:
 *   - the till's starter codes (shared/fiscal-codes.ts) are answered locally;
 *   - an answer is kept for the session (package codes do not change while the till runs), and
 *     the same MXIK asked twice at once (several fields on a page) is one request;
 *   - tasnif unreachable is an answer too (`unavailable`), never an error: the field then takes
 *     the code typed by hand. A failure is not kept, so the next field asks again.
 */
export function createPackageLookup(
  opts: TasnifOptions = {},
  known: ReadonlyArray<{ mxik: string; packageCode: string }> = [],
) {
  const local = new Map(known.map((k) => [k.mxik, k.packageCode]));
  const cache = new Map<string, MxikPackage[]>();
  const inFlight = new Map<string, Promise<PackageAnswer>>();
  return async (mxik: string, lang: TasnifLang = 'uz_latn'): Promise<PackageAnswer> => {
    if (!MXIK_PATTERN.test(String(mxik ?? ''))) return { packages: [], unavailable: false };
    const own = local.get(mxik);
    if (own) return { packages: [{ code: own, name: SERVICE_UNIT[lang] }], unavailable: false };
    const key = `${mxik}|${lang}`;
    const hit = cache.get(key);
    if (hit) return { packages: hit, unavailable: false };
    const running = inFlight.get(key);
    if (running) return running;
    const ask = mxikPackages(mxik, lang, opts)
      .then((packages) => {
        cache.set(key, packages);
        return { packages, unavailable: false };
      })
      .catch((e: unknown) => {
        if (!(e instanceof TasnifUnavailableError)) throw e;
        return { packages: [], unavailable: true };
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, ask);
    return ask;
  };
}

/**
 * Clinic workflow settings, kept as JSON values in the till's `settings` table (key/value).
 * Defaults are the owner's decisions of 2026-11-15; an admin can change them in Settings.
 */

export interface ClinicSettings {
  /** A follow-up consultation is free this many days after a paid consultation in the case. */
  followUpFreeDays: number;
  /** A receptionist may discount a full course up to this; more needs an admin. */
  maxDiscountPercent: number;
  /** Print a queue ticket / receipt right after payment. */
  printTicketAfterPayment: boolean;
}

export const CLINIC_SETTINGS_DEFAULTS: ClinicSettings = {
  followUpFreeDays: 14,
  maxDiscountPercent: 10,
  printTicketAfterPayment: false,
};

const KEYS: Record<keyof ClinicSettings, string> = {
  followUpFreeDays: 'clinic_follow_up_free_days',
  maxDiscountPercent: 'clinic_max_discount_percent',
  printTicketAfterPayment: 'clinic_print_ticket',
};

interface SettingsDb {
  setting: {
    findMany(args: { where: { key: { in: string[] } } }): Promise<{ key: string; value: string }[]>;
    upsert(args: {
      where: { key: string };
      update: { value: string; updatedAt: Date };
      create: { key: string; value: string };
    }): Promise<unknown>;
  };
}

function parse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Valid value or undefined, so a bad stored value falls back to the default. */
function check<K extends keyof ClinicSettings>(key: K, v: unknown): ClinicSettings[K] | undefined {
  if (key === 'printTicketAfterPayment') {
    return (typeof v === 'boolean' ? v : undefined) as ClinicSettings[K] | undefined;
  }
  const max = key === 'followUpFreeDays' ? 365 : 100;
  return (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined) as
    | ClinicSettings[K]
    | undefined;
}

export async function getClinicSettings(db: SettingsDb): Promise<ClinicSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const out = { ...CLINIC_SETTINGS_DEFAULTS };
  for (const k of Object.keys(KEYS) as (keyof ClinicSettings)[]) {
    const row = rows.find((r) => r.key === KEYS[k]);
    const v = row ? check(k, parse(row.value)) : undefined;
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Writes the valid fields of `patch`; throws `errors.invalidSetting` on any invalid one. */
export async function setClinicSettings(
  db: SettingsDb,
  patch: Partial<Record<keyof ClinicSettings, unknown>>,
): Promise<ClinicSettings> {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in KEYS)) continue;
    const key = k as keyof ClinicSettings;
    const value = check(key, v);
    if (value === undefined) throw Object.assign(new Error('errors.invalidSetting'), { key: k });
    await db.setting.upsert({
      where: { key: KEYS[key] },
      update: { value: JSON.stringify(value), updatedAt: new Date() },
      create: { key: KEYS[key], value: JSON.stringify(value) },
    });
  }
  return getClinicSettings(db);
}

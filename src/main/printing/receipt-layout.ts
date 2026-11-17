import {
  applyReceiptLayout,
  RECEIPT_LAYOUT_DEFAULTS,
  type ReceiptLayout,
  readReceiptLayout,
} from '../../shared/receipt-html';

/**
 * The clinic's receipt layout (Settings → Receipt): one JSON value in the main till's `settings`
 * table. Satellites read it over the LAN (`receipt:getLayout`), so every till prints the same
 * receipt. Electron-free (tests).
 */
export const RECEIPT_LAYOUT_KEY = 'receipt_layout';

interface SettingsDb {
  setting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>;
    upsert(args: {
      where: { key: string };
      update: { value: string; updatedAt: Date };
      create: { key: string; value: string };
    }): Promise<unknown>;
  };
  localConfig?: { findFirst(): Promise<{ clinicName: string } | null> };
}

/** The stored layout; before anything is saved, the clinic's name from its licence. */
export async function getReceiptLayout(db: SettingsDb): Promise<ReceiptLayout> {
  const row = await db.setting.findUnique({ where: { key: RECEIPT_LAYOUT_KEY } });
  if (row) {
    try {
      return readReceiptLayout(JSON.parse(row.value));
    } catch {
      // unreadable: defaults below
    }
  }
  const config = await db.localConfig?.findFirst().catch(() => null);
  return { ...RECEIPT_LAYOUT_DEFAULTS, clinicName: config?.clinicName ?? '' };
}

/** Saves the valid `patch`; throws `errors.invalidSetting` when any field is invalid. */
export async function setReceiptLayout(
  db: SettingsDb,
  patch: Record<string, unknown>,
): Promise<ReceiptLayout> {
  const next = applyReceiptLayout(await getReceiptLayout(db), patch ?? {});
  if ('invalid' in next) throw new Error('errors.invalidSetting');
  const value = JSON.stringify(next);
  await db.setting.upsert({
    where: { key: RECEIPT_LAYOUT_KEY },
    update: { value, updatedAt: new Date() },
    create: { key: RECEIPT_LAYOUT_KEY, value },
  });
  return next;
}

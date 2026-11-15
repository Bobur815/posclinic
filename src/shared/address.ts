/**
 * Uzbekistan administrative units (SOATO), as the till's `addresses:*` IPC returns them.
 * All four names travel together and the renderer picks by language, so a stored address (the
 * codes) is independent of the display language.
 */
export type AdminUnitType = 'REGION' | 'REPUBLIC' | 'CITY' | 'DISTRICT';

export interface AdminUnitDto {
  /** Official SOATO / MHOBT code; the stable id. */
  code: string;
  parentCode: string | null;
  type: AdminUnitType;
  /** 1 = region / republic / Tashkent City, 2 = district / city inside it. */
  level: 1 | 2;
  nameUz: string;
  nameUzCyrl: string | null;
  nameRu: string | null;
  nameEn: string | null;
}

export type AddressLang = 'uz' | 'uz-Cyrl' | 'ru' | 'en';

/** The unit's name in `lang`, falling back to Uzbek Latin (always present). */
export function unitName(
  unit: Pick<AdminUnitDto, 'nameUz' | 'nameUzCyrl' | 'nameRu' | 'nameEn'>,
  lang: string,
): string {
  if (lang === 'ru') return unit.nameRu || unit.nameUz;
  if (lang === 'en') return unit.nameEn || unit.nameUz;
  if (lang === 'uz-Cyrl') return unit.nameUzCyrl || unit.nameUz;
  return unit.nameUz;
}

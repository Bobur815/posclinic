import { randomUUID } from 'node:crypto';

/**
 * Starter services for a parasitology clinic, written once when a till is first set up. Prices
 * are 0: the clinic sets its own in Services. Codes are stable so a re-run never duplicates.
 * Only `services.name` exists on the till, so the name is written in the setup language.
 */
export const PARASITOLOGY_SERVICES: ReadonlyArray<{
  code: string;
  uz: string;
  ru: string;
  duration: number;
}> = [
  {
    code: 'PAR-CONS',
    uz: 'Parazitolog konsultatsiyasi',
    ru: 'Консультация паразитолога',
    duration: 20,
  },
  { code: 'PAR-CONS2', uz: 'Takroriy konsultatsiya', ru: 'Повторная консультация', duration: 15 },
  {
    code: 'PAR-OP',
    uz: 'Najas tahlili: tuxum va parazitlar (O&P)',
    ru: 'Анализ кала на яйца глист и простейшие',
    duration: 15,
  },
  {
    code: 'PAR-ENT',
    uz: 'Enterobiozga qirma (skotch-test)',
    ru: 'Соскоб на энтеробиоз (скотч-тест)',
    duration: 10,
  },
  {
    code: 'PAR-GIA',
    uz: 'IFA: Lyambliya (Giardia) antitanachalari',
    ru: 'ИФА: антитела к лямблиям (Giardia)',
    duration: 10,
  },
  {
    code: 'PAR-ASC',
    uz: 'IFA: Askarida antitanachalari',
    ru: 'ИФА: антитела к аскаридам',
    duration: 10,
  },
  {
    code: 'PAR-TOX',
    uz: 'IFA: Toksokara antitanachalari',
    ru: 'ИФА: антитела к токсокарам',
    duration: 10,
  },
  {
    code: 'PAR-ECH',
    uz: 'IFA: Exinokokk antitanachalari',
    ru: 'ИФА: антитела к эхинококку',
    duration: 10,
  },
  {
    code: 'PAR-OPI',
    uz: 'IFA: Opistorx antitanachalari',
    ru: 'ИФА: антитела к описторхам',
    duration: 10,
  },
  {
    code: 'PAR-MAL',
    uz: 'Qon surtmasi: bezgak (malyariya)',
    ru: 'Мазок крови на малярию',
    duration: 15,
  },
];

interface ServiceWriter {
  service: {
    upsert(args: {
      where: { code: string };
      update: Record<string, never>;
      create: { id: string; code: string; name: string; price: number; duration: number };
    }): Promise<unknown>;
  };
}

export async function seedParasitologyServices(
  prisma: ServiceWriter,
  lang: 'uz' | 'ru',
): Promise<void> {
  for (const s of PARASITOLOGY_SERVICES) {
    await prisma.service.upsert({
      where: { code: s.code },
      update: {},
      create: { id: randomUUID(), code: s.code, name: s[lang], price: 0, duration: s.duration },
    });
  }
}

import { useEffect, useState } from 'react';
import { doctorsApi, type Doctor } from '../api/client';

let cache: Promise<Doctor[]> | null = null;

/** Doctors for filters and for naming `doctorId` on visit rows. Cached for the session. */
export function useDoctors(): Doctor[] {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  useEffect(() => {
    cache ??= doctorsApi.list().catch((e) => {
      cache = null;
      throw e;
    });
    let alive = true;
    cache.then((d) => alive && setDoctors(d)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return doctors;
}

/** Call after the doctors page changes the list. */
export function invalidateDoctors() {
  cache = null;
}

export function doctorName(
  doctors: Doctor[],
  a: { doctorId: string; doctor?: { fullName: string } | null },
): string {
  return a.doctor?.fullName ?? doctors.find((d) => d.id === a.doctorId)?.fullName ?? '—';
}

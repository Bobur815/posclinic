import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth-store';
import { useDataVersion } from './useDataVersion';

export interface MyDoctor {
  id: string;
  fullName: string;
  active: boolean;
}

/**
 * The signed-in user's doctor profile (`doctors:mine`), or null. Being a doctor is a profile on a
 * login, not only the DOCTOR role: a clinic admin who sees patients has one too. Re-read when the
 * user or the doctors change (an admin links / unlinks on the Doctors page).
 */
export function useMyDoctor(): MyDoctor | null {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const version = useDataVersion(['doctors']);
  const [doctor, setDoctor] = useState<MyDoctor | null>(null);

  useEffect(() => {
    if (!userId) {
      setDoctor(null);
      return;
    }
    let alive = true;
    window.electronAPI.doctors
      .mine()
      .then((d) => alive && setDoctor(d && d.active ? d : null))
      .catch(() => alive && setDoctor(null));
    return () => {
      alive = false;
    };
  }, [userId, version]);

  return doctor;
}

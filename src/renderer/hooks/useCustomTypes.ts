import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ServiceDto,
  ServiceKind,
  ServiceTypeDto,
  StaffDto,
  StaffTypeDto,
} from '../../shared/clinic';
import { useDataVersion } from './useDataVersion';

/** The clinic's own order and staff types (Settings → Types), reloaded when they change. */
export function useCustomTypes() {
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDto[]>([]);
  const [staffTypes, setStaffTypes] = useState<StaffTypeDto[]>([]);
  const version = useDataVersion(['services', 'users']);
  const reload = useCallback(() => {
    window.electronAPI.types
      .list()
      .then((r) => {
        setServiceTypes(r.serviceTypes);
        setStaffTypes(r.staffTypes);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    reload();
  }, [reload, version]);
  return { serviceTypes, staffTypes, reload };
}

/** Built-in colours of the behaviours (badges, cards). */
export const KIND_COLORS: Record<ServiceKind, string> = {
  CONSULTATION: '#0891b2',
  ANALYSIS: '#d97706',
  PROCEDURE: '#16a34a',
  DIRECT_SALE: '#7c3aed',
};

/** A type's name in the app language (Russian when set and the app is in Russian). */
export function useTypeName() {
  const { i18n } = useTranslation();
  return (t: { nameUz: string; nameRu: string | null }) =>
    i18n.language === 'ru' && t.nameRu ? t.nameRu : t.nameUz;
}

/** What a service is shown as: its custom type (name + colour) or its built-in kind. */
export function useServiceTypeLabel(serviceTypes: ServiceTypeDto[]) {
  const { t } = useTranslation();
  const name = useTypeName();
  return (s: Pick<ServiceDto, 'kind' | 'serviceTypeId'>) => {
    const type = s.serviceTypeId ? serviceTypes.find((x) => x.id === s.serviceTypeId) : undefined;
    return type
      ? { label: name(type), color: type.color ?? KIND_COLORS[type.behavior] }
      : { label: t(`services.kinds.${s.kind}`), color: KIND_COLORS[s.kind] };
  };
}

/** What a staff member is shown as: their custom type or their built-in role. */
export function useStaffTypeLabel(staffTypes: StaffTypeDto[]) {
  const { t } = useTranslation();
  const name = useTypeName();
  return (u: Pick<StaffDto, 'role' | 'staffTypeId'>) => {
    const type = u.staffTypeId ? staffTypes.find((x) => x.id === u.staffTypeId) : undefined;
    return type ? name(type) : t(`staff.roles.${u.role}`);
  };
}

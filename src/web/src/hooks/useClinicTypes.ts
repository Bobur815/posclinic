import { useTranslation } from 'react-i18next';
import { type ClinicTypes, typesApi } from '../api/client';
import { useAsync } from './useAsync';

/** The clinic's own order / staff types (made on the till), named in the app language. */
export function useClinicTypes() {
  const { i18n } = useTranslation();
  const { data } = useAsync<ClinicTypes>(() => typesApi.list(), []);
  const name = (x: { nameUz: string; nameRu: string | null }) =>
    i18n.language === 'ru' && x.nameRu ? x.nameRu : x.nameUz;
  return {
    serviceType: (id: string | null | undefined) => {
      const x = id ? data?.serviceTypes.find((s) => s.id === id) : undefined;
      return x ? { name: name(x), color: x.color } : null;
    },
    staffType: (id: string | null | undefined) => {
      const x = id ? data?.staffTypes.find((s) => s.id === id) : undefined;
      return x ? name(x) : null;
    },
  };
}

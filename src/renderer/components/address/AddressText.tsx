import { useTranslation } from 'react-i18next';
import { unitName } from '../../../shared/address';
import { useChildUnits, useRegions } from '../../hooks/useAdminUnits';

/**
 * A stored address in the app language: "District, Region" from the SOATO codes, through the same
 * session cache as the selector. Falls back to the stored `city` text (Uzbek, or legacy free text)
 * while loading or when there are no codes.
 */
export function AddressText({
  regionCode,
  districtCode,
  fallback,
}: {
  regionCode: string | null;
  districtCode: string | null;
  fallback: string | null;
}) {
  const { i18n } = useTranslation();
  const regions = useRegions();
  const children = useChildUnits(districtCode ? regionCode : null);
  const region = regions.data?.find((u) => u.code === regionCode);
  const district = children.data?.find((u) => u.code === districtCode);
  if (!regionCode || !region || (districtCode && !district)) return <>{fallback || '—'}</>;
  const lang = i18n.language;
  return (
    <>
      {district ? `${unitName(district, lang)}, ${unitName(region, lang)}` : unitName(region, lang)}
    </>
  );
}

import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { unitName } from '../../../shared/address';
import { useChildUnits, useRegions } from '../../hooks/useAdminUnits';

/**
 * Uzbekistan address picker: region / republic / Tashkent City, then a district or city inside
 * it. Value = SOATO codes (what gets stored; independent of the display language). Names follow
 * the app language. The second select stays disabled until a region is chosen, is cleared when
 * the region changes, and only ever offers that region's own children.
 *
 *   <AddressSelector value={{ regionCode, districtCode }} onChange={(v) => setForm({ ...form, ...v })} />
 */

export interface AddressValue {
  regionCode: string | null;
  districtCode: string | null;
}

export interface AddressSelectorProps {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
  disabled?: boolean;
  /** Require a region (and a district once the region has any). */
  required?: boolean;
}

export function AddressSelector({ value, onChange, disabled, required }: AddressSelectorProps) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const regions = useRegions();
  const children = useChildUnits(value.regionCode);

  // A stored district that is not (or no longer) a child of the region is never shown as chosen.
  useEffect(() => {
    if (
      value.districtCode &&
      children.data &&
      !children.data.some((c) => c.code === value.districtCode)
    ) {
      onChange({ regionCode: value.regionCode, districtCode: null });
    }
  }, [children.data, value.regionCode, value.districtCode, onChange]);

  const lang = i18n.language;
  const sortByName = <T extends { nameUz: string }>(list: T[]) =>
    [...list].sort((a, b) =>
      unitName(a as never, lang).localeCompare(unitName(b as never, lang), lang),
    );

  return (
    <Row>
      <Field>
        <Label htmlFor={`${ids}-region`}>
          {t('address.region')}
          {required && <Req>*</Req>}
        </Label>
        <Select
          id={`${ids}-region`}
          value={value.regionCode ?? ''}
          disabled={disabled || regions.loading || regions.error}
          required={required}
          aria-busy={regions.loading}
          onChange={(e) => onChange({ regionCode: e.target.value || null, districtCode: null })}
        >
          <option value="">
            {regions.loading ? t('address.loading') : t('address.chooseRegion')}
          </option>
          {(regions.data ?? []).map((u) => (
            <option key={u.code} value={u.code}>
              {unitName(u, lang)}
            </option>
          ))}
        </Select>
        {regions.error && (
          <Problem role="alert">
            {t('address.loadError')}{' '}
            <RetryBtn type="button" onClick={regions.retry}>
              {t('address.retry')}
            </RetryBtn>
          </Problem>
        )}
        {!regions.loading && !regions.error && regions.data?.length === 0 && (
          <Problem role="status">{t('address.noData')}</Problem>
        )}
      </Field>

      <Field>
        <Label htmlFor={`${ids}-district`}>
          {t('address.district')}
          {required && value.regionCode && (children.data?.length ?? 0) > 0 && <Req>*</Req>}
        </Label>
        <Select
          id={`${ids}-district`}
          value={value.districtCode ?? ''}
          disabled={disabled || !value.regionCode || children.loading || children.error}
          required={required && (children.data?.length ?? 0) > 0}
          aria-busy={children.loading}
          onChange={(e) =>
            onChange({ regionCode: value.regionCode, districtCode: e.target.value || null })
          }
        >
          <option value="">
            {!value.regionCode
              ? t('address.chooseRegionFirst')
              : children.loading
                ? t('address.loading')
                : children.data?.length === 0
                  ? t('address.noDistricts')
                  : t('address.chooseDistrict')}
          </option>
          {sortByName(children.data ?? []).map((u) => (
            <option key={u.code} value={u.code}>
              {unitName(u, lang)}
              {u.type === 'CITY' ? ` (${t('address.city')})` : ''}
            </option>
          ))}
        </Select>
        {children.error && (
          <Problem role="alert">
            {t('address.loadError')}{' '}
            <RetryBtn type="button" onClick={children.retry}>
              {t('address.retry')}
            </RetryBtn>
          </Problem>
        )}
      </Field>
    </Row>
  );
}

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;
const Field = styled.div``;
const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`;
const Req = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;
const Select = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
const Problem = styled.p`
  margin: 4px 0 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;
const RetryBtn = styled.button`
  border: 0;
  background: none;
  padding: 0;
  color: ${({ theme }) => theme.colors.primary};
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
`;

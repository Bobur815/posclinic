import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { MxikHitDto, MxikPackageDto, TasnifLang } from '../../../shared/clinic';
import { ipcErrorKey } from '../../store/lan-store';

export interface MxikValue {
  mxik: string;
  packageCode: string;
}

/**
 * An MXIK (IKPU) with its package code, for the fiscal receipt (v2.6). Typed, or found on
 * tasnif.soliq.uz by words ("паразит", "konsultatsiya"): picking a hit loads that code's packages
 * and takes the only one by itself (a service has one, "xizmat (marta)"). The package always
 * belongs to the MXIK above it: changing the MXIK clears it. Admins only (main enforces).
 */
export function MxikField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: MxikValue;
  onChange(next: MxikValue): void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang: TasnifLang = i18n.language === 'ru' ? 'ru' : 'uz_latn';
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MxikHitDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<MxikPackageDto[]>([]);
  /** tasnif could not be asked for this MXIK's packages: the code is typed. */
  const [offline, setOffline] = useState(false);

  const valid = /^\d{17}$/.test(value.mxik);

  // The package list of the MXIK shown (also for one typed or loaded from the service). Main
  // answers known codes itself and keeps tasnif's answers; tasnif unreachable is not an error.
  useEffect(() => {
    setOffline(false);
    if (!valid) {
      setPackages([]);
      return;
    }
    let live = true;
    window.electronAPI.services
      .mxikPackages(value.mxik, lang)
      .then(({ packages: list, unavailable }) => {
        if (!live) return;
        setPackages(list);
        setOffline(unavailable);
        if (list.length === 1 && !value.packageCode) {
          onChange({ mxik: value.mxik, packageCode: list[0]!.code });
        }
      })
      .catch(() => {
        if (live) {
          setPackages([]);
          setOffline(true);
        }
      });
    return () => {
      live = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: only when the MXIK itself changes
  }, [value.mxik, valid, lang]);

  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setHits(await window.electronAPI.services.searchMxik(query.trim(), lang));
    } catch (e) {
      setHits(null);
      setError(t(ipcErrorKey(e, 'errors.tasnifUnavailable')));
    } finally {
      setBusy(false);
    }
  };

  const pick = (hit: MxikHitDto) => {
    onChange({ mxik: hit.code, packageCode: '' });
    setSearching(false);
    setHits(null);
  };

  return (
    <Wrap>
      <Row>
        <Input
          value={value.mxik}
          inputMode="numeric"
          maxLength={17}
          placeholder={placeholder ?? '10902001034000000'}
          disabled={disabled}
          $invalid={value.mxik !== '' && !valid}
          onChange={(e) =>
            onChange({ mxik: e.target.value.replace(/\D/g, '').slice(0, 17), packageCode: '' })
          }
        />
        {!disabled && (
          <Btn type="button" onClick={() => setSearching((s) => !s)}>
            {searching ? <X size={14} /> : <Search size={14} />}
            {t('mxik.searchTasnif')}
          </Btn>
        )}
      </Row>
      {value.mxik !== '' && !valid && <Hint $error>{t('errors.invalidMxik')}</Hint>}

      {searching && (
        <Panel>
          <Row>
            <Input
              autoFocus
              value={query}
              placeholder={t('mxik.searchPlaceholder')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <Btn
              type="button"
              onClick={() => void search()}
              disabled={busy || query.trim().length < 2}
            >
              {busy ? <Loader2 size={14} /> : <Search size={14} />}
              {t('common.search')}
            </Btn>
          </Row>
          {error && <Hint $error>{error}</Hint>}
          {hits && hits.length === 0 && <Hint>{t('mxik.noHits')}</Hint>}
          {hits && hits.length > 0 && (
            <Hits>
              {hits.map((h) => (
                <li key={h.code}>
                  <button type="button" onClick={() => pick(h)}>
                    <code>{h.code}</code>
                    <span>{h.name}</span>
                    <small>{h.className}</small>
                  </button>
                </li>
              ))}
            </Hits>
          )}
          <Hint>{t('mxik.searchHint')}</Hint>
        </Panel>
      )}

      {valid && (
        <Row>
          <Label>{t('mxik.packageCode')}</Label>
          {packages.length > 0 ? (
            <Select
              value={value.packageCode}
              disabled={disabled}
              onChange={(e) => onChange({ mxik: value.mxik, packageCode: e.target.value })}
            >
              <option value="">—</option>
              {packages.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={value.packageCode}
              inputMode="numeric"
              maxLength={20}
              disabled={disabled}
              placeholder={t('mxik.packagePlaceholder')}
              onChange={(e) =>
                onChange({ mxik: value.mxik, packageCode: e.target.value.replace(/\D/g, '') })
              }
            />
          )}
        </Row>
      )}
      {valid && offline && packages.length === 0 && <Hint>{t('mxik.packagesOffline')}</Hint>}
    </Wrap>
  );
}

const Wrap = styled.div`
  display: grid;
  gap: 6px;
`;
const Row = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;
const Input = styled.input<{ $invalid?: boolean }>`
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-variant-numeric: tabular-nums;
`;
const Select = styled.select`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
`;
const Label = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;
const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
const Panel = styled.div`
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
`;
const Hits = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
  li button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    padding: 7px 8px;
    border: 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    background: none;
    color: ${({ theme }) => theme.colors.text};
    text-align: left;
    font-size: 12px;
    cursor: pointer;
    &:hover {
      background: ${({ theme }) => `${theme.colors.primary}12`};
    }
  }
  code {
    grid-row: span 2;
    color: ${({ theme }) => theme.colors.primary};
  }
  small {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;
const Hint = styled.span<{ $error?: boolean }>`
  font-size: 11px;
  color: ${({ theme, $error }) => ($error ? theme.colors.error : theme.colors.textSecondary)};
`;

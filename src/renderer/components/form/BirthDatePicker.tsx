import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

/**
 * Date of birth as three linked dropdowns: day, month, year (docs/design date-of-birth picture).
 * Faster and safer than a calendar for a birth date decades back, and every part is a native
 * <select>: keyboard, screen readers and the OS list all work.
 *
 *   <BirthDatePicker value={form.birthDate} onChange={(birthDate) => setForm({ ...form, birthDate })} />
 *
 * `value` / `onChange`: 'YYYY-MM-DD', or '' until all three parts are chosen (a half-filled date
 * is never handed to the form). The day list follows the month and leap years; days and months
 * after `max` (default today) are not offered, nor years before `minYear` (default 120 years ago).
 */

export interface BirthDatePickerProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  /** Labels the group, e.g. the id of the visible "Date of birth" label. */
  labelledBy?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** Latest selectable date, 'YYYY-MM-DD'; default today. */
  max?: string;
  minYear?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (year: number | null, month: number | null) =>
  month === null ? 31 : new Date(year ?? 2000, month, 0).getDate(); // 2000: Feb has 29

export interface DateParts {
  d: number | null;
  m: number | null;
  y: number | null;
}

/**
 * One part changed: a month or day that no longer exists (31 → February, 29 Feb in a non-leap
 * year, a month or day after `limit`) is cleared, never moved to another date. `value` is
 * 'YYYY-MM-DD' once all three parts are set, else ''.
 */
export function applyDateChange(
  parts: DateParts,
  next: Partial<DateParts>,
  limit: { y: number; m: number; d: number },
): { parts: DateParts; value: string } {
  const p = { ...parts, ...next };
  if (p.y === limit.y && p.m !== null && p.m > limit.m) p.m = null;
  if (p.d !== null) {
    const dayLimit = Math.min(daysIn(p.y, p.m), p.y === limit.y && p.m === limit.m ? limit.d : 31);
    if (p.d > dayLimit) p.d = null;
  }
  const full = p.d !== null && p.m !== null && p.y !== null;
  return { parts: p, value: full ? `${p.y}-${pad(p.m as number)}-${pad(p.d as number)}` : '' };
}

function parse(value: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

export function BirthDatePicker({
  value,
  onChange,
  labelledBy,
  id,
  disabled,
  invalid,
  required,
  max,
  minYear,
}: BirthDatePickerProps) {
  const { t } = useTranslation();
  const auto = useId();
  const base = id ?? auto;
  const limit =
    parse(max) ??
    (() => {
      const now = new Date();
      return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    })();
  const firstYear = minYear ?? limit.y - 120;

  // The parts live here while the date is incomplete; a full value from the form wins.
  const [parts, setParts] = useState<{ d: number | null; m: number | null; y: number | null }>(
    () => {
      const p = parse(value);
      return p ? { d: p.d, m: p.m, y: p.y } : { d: null, m: null, y: null };
    },
  );
  useEffect(() => {
    const p = parse(value);
    if (p) setParts({ d: p.d, m: p.m, y: p.y });
    else if (!value)
      setParts((cur) => (cur.d && cur.m && cur.y ? { d: null, m: null, y: null } : cur));
  }, [value]);

  const maxMonth = parts.y === limit.y ? limit.m : 12;
  const maxDay = Math.min(
    daysIn(parts.y, parts.m),
    parts.y === limit.y && parts.m === limit.m ? limit.d : 31,
  );

  const update = (next: Partial<DateParts>) => {
    const { parts: p, value: out } = applyDateChange(parts, next, limit);
    setParts(p);
    if (out !== (value ?? '')) onChange(out);
  };

  const months = t('date.months', { returnObjects: true }) as string[];
  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <Row role="group" aria-labelledby={labelledBy} id={base}>
      <Field $grow={1}>
        <Select
          aria-label={t('date.day')}
          value={parts.d ?? ''}
          onChange={(e) => update({ d: num(e.target.value) })}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          $empty={parts.d === null}
          $invalid={invalid}
        >
          <option value="">{t('date.dd')}</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {pad(d)}
            </option>
          ))}
        </Select>
      </Field>
      <Field $grow={1.6}>
        <Select
          aria-label={t('date.month')}
          value={parts.m ?? ''}
          onChange={(e) => update({ m: num(e.target.value) })}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          $empty={parts.m === null}
          $invalid={invalid}
        >
          <option value="">{t('date.mm')}</option>
          {Array.from({ length: maxMonth }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {Array.isArray(months) && months[m - 1] ? months[m - 1] : pad(m)}
            </option>
          ))}
        </Select>
      </Field>
      <Field $grow={1.3}>
        <Select
          aria-label={t('date.year')}
          value={parts.y ?? ''}
          onChange={(e) => update({ y: num(e.target.value) })}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          $empty={parts.y === null}
          $invalid={invalid}
        >
          <option value="">{t('date.yyyy')}</option>
          {Array.from({ length: limit.y - firstYear + 1 }, (_, i) => limit.y - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
    </Row>
  );
}

const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
`;

const Field = styled.div<{ $grow: number }>`
  flex: ${({ $grow }) => $grow} 1 0;
  min-width: 0;
`;

/** The design's filled field: grey fill, no border, solid caret, blue ring with a gap on focus. */
const Select = styled.select<{ $empty: boolean; $invalid?: boolean }>`
  appearance: none;
  width: 100%;
  height: 38px;
  padding: 0 30px 0 12px;
  border: 0;
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => `${theme.colors.textSecondary}1f`};
  /* caret: a filled triangle in the text colour */
  background-image: ${({ theme }) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'><path d='M0.6 0.8h8.8L5 6.2z' fill='${theme.colors.text}' stroke='${theme.colors.text}' stroke-linejoin='round' stroke-width='1.2'/></svg>`,
    )}")`};
  background-repeat: no-repeat;
  background-position: right 12px center;
  color: ${({ theme, $empty }) => ($empty ? theme.colors.textSecondary : theme.colors.text)};
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  box-shadow: ${({ theme, $invalid }) =>
    $invalid ? `inset 0 0 0 1.5px ${theme.colors.error}` : 'none'};
  transition: box-shadow 0.12s;

  &:focus {
    outline: none;
  }
  &:focus-visible,
  &:focus {
    box-shadow:
      0 0 0 2px ${({ theme }) => theme.colors.surface},
      0 0 0 4px ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  option {
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.surface};
  }
`;

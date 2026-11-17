import React, { useEffect } from 'react';
import styled, { css } from 'styled-components';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';

/* ─── Page frame ──────────────────────────────────────────────────────────── */

export const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const TitleText = styled.h1`
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  svg {
    color: ${({ theme }) => theme.colors.primary};
  }

  @media (max-width: 768px) {
    font-size: 1.3rem;
  }
`;

const Subtitle = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: 2px;
`;

export const Row = styled.div<{ $gap?: 'sm' | 'md'; $wrap?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme, $gap }) => theme.spacing[$gap ?? 'sm']};
  flex-wrap: ${({ $wrap }) => ($wrap === false ? 'nowrap' : 'wrap')};
`;

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <HeaderRow>
      <div>
        <TitleText>
          {icon}
          {title}
        </TitleText>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </div>
      {actions && <Row>{actions}</Row>}
    </HeaderRow>
  );
}

export const Card = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: ${({ theme }) => theme.spacing.md};
  min-width: 0;
`;

export const CardTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

export const Grid = styled.div<{ $min?: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min }) => $min ?? 200}px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

/* ─── Stats ───────────────────────────────────────────────────────────────── */

type Tone = 'primary' | 'success' | 'error' | 'warning' | 'info';

const StatBox = styled(Card)<{ $tone: Tone }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-left: 4px solid ${({ theme, $tone }) => theme.colors[$tone]};
`;

const StatLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  align-items: center;
  gap: 6px;
  svg {
    width: 16px;
    height: 16px;
  }
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <StatBox $tone={tone}>
      <StatLabel>
        {icon}
        {label}
      </StatLabel>
      <StatValue>{value}</StatValue>
    </StatBox>
  );
}

/* ─── Controls ────────────────────────────────────────────────────────────── */

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button = styled.button<{ $variant?: BtnVariant; $small?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: ${({ $small }) => ($small ? '4px 10px' : '8px 14px')};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: ${({ $small }) => ($small ? '13px' : '14px')};
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    opacity 0.15s,
    background 0.15s;
  border: 1px solid transparent;

  ${({ theme, $variant = 'secondary' }) => {
    switch ($variant) {
      case 'primary':
        return css`
          background: ${theme.colors.primary};
          color: #fff;
        `;
      case 'danger':
        return css`
          background: ${theme.colors.error};
          color: #fff;
        `;
      case 'ghost':
        return css`
          background: transparent;
          color: ${theme.colors.textSecondary};
          &:hover:not(:disabled) {
            background: ${theme.colors.background};
            color: ${theme.colors.text};
          }
        `;
      default:
        return css`
          background: ${theme.colors.surface};
          color: ${theme.colors.text};
          border-color: ${theme.colors.border};
        `;
    }
  }}

  &:hover:not(:disabled) {
    opacity: 0.88;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
`;

const fieldCss = css`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  min-width: 0;
  width: 100%;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary}30;
  }
  &:disabled {
    opacity: 0.6;
  }
`;

export const Input = styled.input`
  ${fieldCss}
`;
export const Select = styled.select`
  ${fieldCss} cursor: pointer;
`;
export const Textarea = styled.textarea`
  ${fieldCss} resize: vertical;
  min-height: 64px;
`;

const FieldWrap = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const FieldHint = styled.span<{ $error?: boolean }>`
  font-size: 12px;
  color: ${({ theme, $error }) => ($error ? theme.colors.error : theme.colors.textSecondary)};
`;

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <FieldWrap>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {error ? <FieldHint $error>{error}</FieldHint> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </FieldWrap>
  );
}

export const FilterBar = styled(Card)`
  display: flex;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;

  > label {
    flex: 0 1 200px;
  }
`;

const CheckWrap = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  input {
    width: 16px;
    height: 16px;
    accent-color: ${({ theme }) => theme.colors.primary};
  }
`;

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <CheckWrap>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </CheckWrap>
  );
}

/* ─── Tables ──────────────────────────────────────────────────────────────── */

export const TableWrap = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow-x: auto;
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

export const Th = styled.th<{ $right?: boolean }>`
  padding: 10px 14px;
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`;

export const Td = styled.td<{ $right?: boolean; $muted?: boolean; $nowrap?: boolean }>`
  padding: 10px 14px;
  font-size: 14px;
  text-align: ${({ $right }) => ($right ? 'right' : 'left')};
  color: ${({ theme, $muted }) => ($muted ? theme.colors.textSecondary : theme.colors.text)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: ${({ $nowrap }) => ($nowrap ? 'nowrap' : 'normal')};
  font-variant-numeric: tabular-nums;
`;

export const Tr = styled.tr<{ $clickable?: boolean; $dim?: boolean }>`
  opacity: ${({ $dim }) => ($dim ? 0.55 : 1)};
  ${({ $clickable, theme }) =>
    $clickable &&
    css`
      cursor: pointer;
      &:hover td {
        background: ${theme.colors.background};
      }
    `}
  &:last-child td {
    border-bottom: none;
  }
`;

/* ─── Badges ──────────────────────────────────────────────────────────────── */

export const Badge = styled.span<{ $tone?: Tone | 'muted' }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  ${({ theme, $tone = 'primary' }) => {
    const c = $tone === 'muted' ? theme.colors.textSecondary : theme.colors[$tone];
    return css`
      background: ${c}20;
      color: ${c};
    `;
  }}
`;

const STATUS_TONE: Record<string, Tone | 'muted'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
  NO_SHOW: 'muted',
  PENDING: 'warning',
  PARTIAL: 'info',
  PAID: 'success',
  REFUNDED: 'muted',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge $tone={STATUS_TONE[status] ?? 'muted'}>
      {t(`appointments.statuses.${status}`, status)}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge $tone={STATUS_TONE[status] ?? 'muted'}>
      {t(`appointments.paymentStatuses.${status}`, status)}
    </Badge>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge $tone={active ? 'success' : 'muted'}>
      {active ? t('common.active') : t('common.inactive')}
    </Badge>
  );
}

/* ─── States ──────────────────────────────────────────────────────────────── */

const StateBox = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .spin {
    animation: spin 1s linear infinite;
  }
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.error};
`;

/** Loading / error / empty placeholder; renders children when there is data. */
export function DataState({
  loading,
  error,
  empty,
  emptyText,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (loading)
    return (
      <StateBox>
        <Loader2 className="spin" />
        {t('common.loading')}
      </StateBox>
    );
  if (error)
    return (
      <StateBox>
        <ErrorText>{error}</ErrorText>
        {onRetry && (
          <Button $small onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </StateBox>
    );
  if (empty) return <StateBox>{emptyText ?? t('common.noResults')}</StateBox>;
  return <>{children}</>;
}

/* ─── Pagination ──────────────────────────────────────────────────────────── */

// One pagination bar for the till and the web (src/renderer/components/common/Pagination.tsx).
export { Paged, Pagination, usePagination } from '@components/common/Pagination';

/* ─── Modal / drawer ──────────────────────────────────────────────────────── */

const Overlay = styled.div<{ $drawer?: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: ${({ $drawer }) => ($drawer ? 'stretch' : 'center')};
  justify-content: ${({ $drawer }) => ($drawer ? 'flex-end' : 'center')};
  padding: ${({ $drawer }) => ($drawer ? '0' : '16px')};
`;

const Panel = styled.div<{ $drawer?: boolean; $wide?: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  display: flex;
  flex-direction: column;
  max-height: ${({ $drawer }) => ($drawer ? '100vh' : '90vh')};
  width: ${({ $drawer, $wide }) => ($drawer ? '560px' : $wide ? '720px' : '480px')};
  max-width: 100%;
  border-radius: ${({ $drawer, theme }) => ($drawer ? '0' : theme.borderRadius)};
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-weight: 600;
  font-size: 16px;
`;

const PanelBody = styled.div`
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PanelFoot = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: 12px 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

export function Modal({
  title,
  onClose,
  footer,
  drawer,
  wide,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  drawer?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Overlay $drawer={drawer} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Panel $drawer={drawer} $wide={wide} role="dialog" aria-modal="true">
        <PanelHead>
          <span>{title}</span>
          <Button $small $variant="ghost" onClick={onClose} aria-label={t('common.close')}>
            <X />
          </Button>
        </PanelHead>
        <PanelBody>{children}</PanelBody>
        {footer && <PanelFoot>{footer}</PanelFoot>}
      </Panel>
    </Overlay>
  );
}

/* ─── Key/value list ──────────────────────────────────────────────────────── */

const DL = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px 24px;
  margin: 0;

  dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  dd {
    margin: 2px 0 0;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.text};
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

export function InfoList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <DL>
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value ?? '—'}</dd>
        </div>
      ))}
    </DL>
  );
}

export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

export const ErrorBanner = styled.div`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.error}15;
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
`;

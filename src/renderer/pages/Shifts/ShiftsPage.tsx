import { ArrowDownCircle, ArrowUpCircle, Lock, Trash2, Unlock, Wallet } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type {
  CashMovementType,
  PaymentMethod,
  ShiftDto,
  ShiftSummaryDto,
} from '../../../shared/clinic';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';
import { FiscalZPanel } from './FiscalZPanel';

/**
 * Cash shifts (v2.6, SavdoChef's "Smenalar"): the open shift's drawer (opening cash, payments by
 * method, cash in / out, the cash expected), open / close with a count, and the history. Reception
 * and admins; main enforces.
 */

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'INSURANCE'];

type Dialog =
  | { kind: 'open' }
  | { kind: 'move'; type: CashMovementType }
  | { kind: 'close'; shift: ShiftDto; expected: number }
  | { kind: 'delete'; shift: ShiftDto }
  | null;

export function ShiftsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const isAdmin = useAuthStore(
    (s) => s.user?.role === 'CLINIC_ADMIN' || s.user?.role === 'SUPER_ADMIN',
  );
  const version = useDataVersion(['shifts', 'appointments']);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [summary, setSummary] = useState<ShiftSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const fmt = (n: number) =>
    `${Math.round(n).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ')} ${t('common.currency')}`;
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ') : '—';

  const load = useCallback(async () => {
    try {
      const list = await window.electronAPI.shifts.list(30);
      setShifts(list);
      const open = list.find((s) => s.status === 'OPEN');
      setSummary(open ? await window.electronAPI.shifts.summary(open.id) : null);
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` reloads on changes elsewhere
  useEffect(() => {
    void load();
  }, [load, version]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
      setDialog(null);
      await load();
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    } finally {
      setBusy(false);
    }
  };

  const open = summary?.shift ?? null;

  return (
    <Page>
      <Header>
        <h1>
          <Wallet size={20} /> {t('shifts.title')}
        </h1>
        {!loading && !open && (
          <Primary onClick={() => setDialog({ kind: 'open' })}>
            <Unlock size={15} /> {t('shifts.open')}
          </Primary>
        )}
      </Header>

      {loading ? (
        <Card>{t('common.loading')}</Card>
      ) : open && summary ? (
        <Card>
          <CardHead>
            <div>
              <h2>{t('shifts.current')}</h2>
              <Muted>
                {t('shifts.openedAtBy', { at: when(open.openedAt), by: open.openedBy ?? '—' })}
              </Muted>
            </div>
            <Actions>
              <Secondary onClick={() => setDialog({ kind: 'move', type: 'PAY_IN' })}>
                <ArrowDownCircle size={15} /> {t('shifts.payIn')}
              </Secondary>
              <Secondary onClick={() => setDialog({ kind: 'move', type: 'PAY_OUT' })}>
                <ArrowUpCircle size={15} /> {t('shifts.payOut')}
              </Secondary>
              <Danger
                onClick={() =>
                  setDialog({ kind: 'close', shift: open, expected: summary.expectedCash })
                }
              >
                <Lock size={15} /> {t('shifts.close')}
              </Danger>
            </Actions>
          </CardHead>
          <Figures>
            <Figure label={t('shifts.openingCash')} value={fmt(summary.shift.openingCash)} />
            {METHODS.map((m) => (
              <Figure
                key={m}
                label={t(`appointments.paymentMethods.${m}`, m)}
                value={fmt(summary.sales[m])}
              />
            ))}
            <Figure label={t('shifts.salesTotal')} value={fmt(summary.salesTotal)} />
            <Figure label={t('shifts.visits')} value={String(summary.visits)} />
            <Figure label={t('shifts.payIn')} value={fmt(summary.payIn)} />
            <Figure label={t('shifts.payOut')} value={fmt(summary.payOut)} />
            <Figure label={t('shifts.expectedCash')} value={fmt(summary.expectedCash)} strong />
          </Figures>
          {summary.movements.length > 0 && (
            <>
              <h3>{t('shifts.movements')}</h3>
              <Table>
                <tbody>
                  {summary.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{when(m.createdAt)}</td>
                      <td>{m.type === 'PAY_IN' ? t('shifts.payIn') : t('shifts.payOut')}</td>
                      <Num $neg={m.type === 'PAY_OUT'}>
                        {m.type === 'PAY_OUT' ? '−' : '+'}
                        {fmt(m.amount)}
                      </Num>
                      <td>{m.note}</td>
                      <td>{m.createdBy ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Muted>{t('shifts.noneOpen')}</Muted>
        </Card>
      )}

      <FiscalZPanel version={version} />

      <Card>
        <h2>{t('shifts.history')}</h2>
        <Table>
          <thead>
            <tr>
              <th>{t('shifts.openedAt')}</th>
              <th>{t('shifts.closedAt')}</th>
              <th>{t('shifts.openingCash')}</th>
              <th>{t('shifts.expectedCash')}</th>
              <th>{t('shifts.countedCash')}</th>
              <th>{t('shifts.difference')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>
                  {when(s.openedAt)}
                  <Small>{s.openedBy}</Small>
                </td>
                <td>
                  {s.status === 'OPEN' ? <Badge>{t('shifts.statusOpen')}</Badge> : when(s.closedAt)}
                  <Small>{s.closedBy}</Small>
                </td>
                <td>{fmt(s.openingCash)}</td>
                <td>{s.expectedCash === null ? '—' : fmt(s.expectedCash)}</td>
                <td>{s.countedCash === null ? '—' : fmt(s.countedCash)}</td>
                <Num $neg={(s.difference ?? 0) < 0}>
                  {s.difference === null ? '—' : fmt(s.difference)}
                </Num>
                <td>
                  {isAdmin && (
                    <IconBtn
                      title={t('shifts.delete')}
                      onClick={() => setDialog({ kind: 'delete', shift: s })}
                    >
                      <Trash2 size={14} />
                    </IconBtn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {dialog?.kind === 'open' && (
        <AmountDialog
          title={t('shifts.open')}
          label={t('shifts.openingCash')}
          confirm={t('shifts.open')}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={(amount) =>
            act(() => window.electronAPI.shifts.open({ openingCash: amount }), t('shifts.opened'))
          }
          allowZero
        />
      )}
      {dialog?.kind === 'move' && (
        <AmountDialog
          title={dialog.type === 'PAY_IN' ? t('shifts.payIn') : t('shifts.payOut')}
          label={t('shifts.amount')}
          confirm={t('common.save')}
          withNote
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={(amount, note) =>
            act(
              () => window.electronAPI.shifts.addCashMovement({ type: dialog.type, amount, note }),
              t('common.success'),
            )
          }
        />
      )}
      {dialog?.kind === 'close' && (
        <AmountDialog
          title={t('shifts.close')}
          label={t('shifts.countedCash')}
          hint={t('shifts.expectedHint', { amount: fmt(dialog.expected) })}
          confirm={t('shifts.close')}
          danger
          allowZero
          initial={dialog.expected}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={(amount) =>
            act(async () => {
              const r = await window.electronAPI.shifts.close({
                shiftId: dialog.shift.id,
                countedCash: amount,
              });
              const diff = r.shift.difference ?? 0;
              toast.success(
                diff === 0 ? t('shifts.closedEven') : t('shifts.closedDiff', { amount: fmt(diff) }),
              );
            })
          }
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={t('shifts.delete')}
          message={t('shifts.deleteConfirm')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          isLoading={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            act(() => window.electronAPI.shifts.delete(dialog.shift.id), t('common.success'))
          }
        />
      )}
    </Page>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <FigureBox $strong={strong}>
      <span>{label}</span>
      <b>{value}</b>
    </FigureBox>
  );
}

function AmountDialog(props: {
  title: string;
  label: string;
  confirm: string;
  hint?: ReactNode;
  initial?: number;
  allowZero?: boolean;
  withNote?: boolean;
  danger?: boolean;
  busy: boolean;
  onCancel(): void;
  onConfirm(amount: number, note: string): void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(props.initial !== undefined ? String(props.initial) : '');
  const [note, setNote] = useState('');
  const amount = Number(value);
  const valid =
    value.trim() !== '' &&
    Number.isFinite(amount) &&
    (amount > 0 || (props.allowZero && amount === 0));
  return (
    <Overlay onClick={props.onCancel}>
      <Modal
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !props.busy) props.onConfirm(amount, note.trim());
        }}
      >
        <h2>{props.title}</h2>
        <label>
          {props.label}
          <Input
            type="number"
            min={0}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {props.hint && <Muted>{props.hint}</Muted>}
        {props.withNote && (
          <label>
            {t('shifts.note')}
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        <Actions>
          <Secondary type="button" onClick={props.onCancel} disabled={props.busy}>
            {t('common.cancel')}
          </Secondary>
          {props.danger ? (
            <Danger type="submit" disabled={!valid || props.busy}>
              {props.confirm}
            </Danger>
          ) : (
            <Primary type="submit" disabled={!valid || props.busy}>
              {props.confirm}
            </Primary>
          )}
        </Actions>
      </Modal>
    </Overlay>
  );
}

const Page = styled.div`
  display: grid;
  gap: 16px;
  max-width: 1100px;
`;
const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  h1 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 20px;
    color: ${({ theme }) => theme.colors.text};
  }
`;
export const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  h2 {
    font-size: 15px;
    margin: 0 0 8px;
  }
  h3 {
    font-size: 13px;
    margin: 16px 0 8px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;
export const CardHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
`;
export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
export const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;
const btn = `
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
export const Primary = styled.button`
  ${btn}
  border: 0;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
`;
export const Secondary = styled.button`
  ${btn}
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
`;
export const Danger = styled.button`
  ${btn}
  border: 0;
  background: ${({ theme }) => theme.colors.error};
  color: #fff;
`;
const IconBtn = styled.button`
  border: 0;
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover {
    color: ${({ theme }) => theme.colors.error};
  }
`;
export const Figures = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
`;
const FigureBox = styled.div<{ $strong?: boolean }>`
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  background: ${({ theme, $strong }) =>
    $strong ? `${theme.colors.primary}18` : theme.colors.background};
  span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  b {
    font-size: ${({ $strong }) => ($strong ? '17px' : '14px')};
    color: ${({ theme, $strong }) => ($strong ? theme.colors.primary : theme.colors.text)};
  }
`;
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  th,
  td {
    text-align: left;
    padding: 7px 8px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    vertical-align: top;
  }
  th {
    font-size: 12px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;
const Num = styled.td<{ $neg?: boolean }>`
  white-space: nowrap;
  color: ${({ theme, $neg }) => ($neg ? theme.colors.error : 'inherit')};
`;
const Small = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Badge = styled.span`
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: ${({ theme }) => `${theme.colors.success}22`};
  color: ${({ theme }) => theme.colors.success};
`;
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;
const Modal = styled.form`
  width: min(420px, calc(100vw - 32px));
  display: grid;
  gap: 12px;
  padding: 20px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  h2 {
    margin: 0;
    font-size: 16px;
  }
  label {
    display: grid;
    gap: 4px;
  }
`;
const Input = styled.input`
  padding: 9px 11px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
`;

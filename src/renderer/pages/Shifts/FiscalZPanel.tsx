import { Receipt, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FiscalStatusDto, FiscalZReportDto } from '../../../shared/clinic';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorText } from '../../store/lan-store';
import { Actions, Card, CardHead, Danger, Figures, Muted, Secondary } from './ShiftsPage';

/**
 * REGOS:VCR's Z-report beside the shift (v2.6, SavdoChef's fiscal-z-panel). It opens and closes
 * with the shift by itself; the buttons (admins) are for when the two disagree (closed in the REGOS
 * app, VCR's 24-hour close). Also the receipts still waiting, with "Send again". Nothing while
 * fiscal receipts are off.
 */
export function FiscalZPanel({ version }: { version: number }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const isAdmin = useAuthStore(
    (s) => s.user?.role === 'CLINIC_ADMIN' || s.user?.role === 'SUPER_ADMIN',
  );
  const [status, setStatus] = useState<FiscalStatusDto | null>(null);
  const [z, setZ] = useState<FiscalZReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const load = useCallback(async () => {
    const s = await window.electronAPI.fiscal.status().catch(() => null);
    setStatus(s);
    if (!s?.enabled) return;
    try {
      setZ(await window.electronAPI.fiscal.zReport());
      setError(null);
    } catch (e) {
      setZ(null);
      setError(ipcErrorText(e, t));
    }
  }, [t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` reloads on changes elsewhere
  useEffect(() => {
    void load();
  }, [load, version]);

  if (!status?.enabled) return null;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(ipcErrorText(e, t));
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  };
  const fmt = (n: number) =>
    `${Math.round(n).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ')} ${t('common.currency')}`;
  const waiting = status.pending + status.failed;

  return (
    <Card>
      <CardHead>
        <div>
          <h2>
            <Receipt size={15} /> {t('fiscal.zTitle')}
          </h2>
          <Muted>
            {z
              ? z.open
                ? t('fiscal.zIsOpen', { n: z.number, terminal: z.terminalId })
                : t('fiscal.zIsClosed', { terminal: z.terminalId })
              : (error ?? t('common.loading'))}
          </Muted>
        </div>
        <Actions>
          {waiting > 0 && (
            <Secondary
              disabled={busy}
              onClick={() =>
                run(() => window.electronAPI.fiscal.retryAll(), t('fiscal.sendingStarted'))
              }
            >
              <RefreshCw size={14} /> {t('fiscal.sendAgain')}
            </Secondary>
          )}
          {isAdmin && z && !z.open && (
            <Secondary
              disabled={busy}
              onClick={() => run(() => window.electronAPI.fiscal.zOpen(), t('fiscal.zDone'))}
            >
              {t('fiscal.zOpen')}
            </Secondary>
          )}
          {isAdmin && z?.open && (
            <Danger disabled={busy} onClick={() => setConfirmClose(true)}>
              {t('fiscal.zClose')}
            </Danger>
          )}
        </Actions>
      </CardHead>
      {waiting > 0 && (
        <Muted style={{ marginBottom: 8, color: 'inherit' }}>
          {t('fiscal.waiting', { pending: status.pending, failed: status.failed })}
        </Muted>
      )}
      {z && (
        <Figures>
          <Fig label={t('fiscal.zSales')} value={String(z.saleCount)} />
          <Fig label={t('appointments.paymentMethods.CASH')} value={fmt(z.saleCash)} />
          <Fig label={t('appointments.paymentMethods.CARD')} value={fmt(z.saleCard)} />
          <Fig label={t('fiscal.zRefunds')} value={String(z.refundCount)} />
        </Figures>
      )}
      {confirmClose && (
        <ConfirmDialog
          title={t('fiscal.zClose')}
          message={t('fiscal.zCloseConfirm')}
          confirmLabel={t('fiscal.zClose')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          isLoading={busy}
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => run(() => window.electronAPI.fiscal.zClose(), t('fiscal.zDone'))}
        />
      )}
    </Card>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 8 }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
      <b style={{ fontSize: 14 }}>{value}</b>
    </div>
  );
}

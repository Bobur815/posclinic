import { Receipt, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseDto,
  type PaidFrom,
} from '../../../shared/stock';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';
import {
  Btn,
  Card,
  CardTitle,
  Empty,
  Grid,
  Input,
  Label,
  Muted,
  Page,
  Select,
  Title,
} from '../Care/care-ui';
import { Badge, Table, localDay, parseNum, useFormat } from './stock-ui';

/**
 * Xarajatlar / Расходы (v2.10): money spent that is not stock (rent, salaries, utilities…).
 * From the drawer = a cash-out of the open shift; reception may add only those. A mistake is
 * voided (admins), and a drawer one puts the money back.
 */
export function ExpensesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const f = useFormat();
  const role = useAuthStore((s) => s.user?.role ?? '');
  const isAdmin = role === 'CLINIC_ADMIN' || role === 'SUPER_ADMIN';

  // Today by default: a longer list is a report (the plan's `reports` feature).
  const [from, setFrom] = useState(localDay());
  const [to, setTo] = useState(localDay());
  const [rows, setRows] = useState<ExpenseDto[]>([]);
  const [voiding, setVoiding] = useState<ExpenseDto | null>(null);

  const [category, setCategory] = useState<ExpenseCategory>('OTHER');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>(isAdmin ? 'OUTSIDE' : 'DRAWER');
  const [spentAt, setSpentAt] = useState(localDay());
  // One id per expense being entered: a repeated click saves it once.
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  // Drawer cash leaves now; only an admin dates an expense paid outside.
  const mayDate = isAdmin && paidFrom === 'OUTSIDE';

  const version = useDataVersion(['finance']);
  const load = useCallback(() => {
    if (!from || !to) return;
    window.electronAPI.expenses
      .list({ from, to })
      .then(setRows)
      .catch(() => setRows([]));
  }, [from, to]);
  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(t('common.success'));
      load();
      return true;
    } catch (e) {
      const key = ipcErrorKey(e, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
      return false;
    }
  };

  const sum = parseNum(amount);
  const total = rows.filter((r) => !r.voidedAt).reduce((s, r) => s + r.amount, 0);

  const add = () => {
    setBusy(true);
    return run(() =>
      window.electronAPI.expenses.create({
        id: clientId,
        category,
        amount: sum,
        note: note.trim() || null,
        paidFrom,
        // Midday local time, so the day never shifts across time zones.
        spentAt:
          !mayDate || spentAt === localDay() ? null : new Date(`${spentAt}T12:00:00`).toISOString(),
      }),
    ).then((ok) => {
      setBusy(false);
      if (ok) {
        setAmount('');
        setNote('');
        setClientId(crypto.randomUUID());
      }
    });
  };

  return (
    <Page>
      <Title>
        <Receipt size={20} /> {t('expenses.title')}
      </Title>

      <Card>
        <CardTitle>{t('expenses.add')}</CardTitle>
        <Grid $cols={3}>
          <Label>
            {t('expenses.category')}
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`expenses.categories.${c}`)}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            {t('expenses.amount')}
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Label>
          <Label>
            {t('stock.paidFrom.label')}
            <Select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as PaidFrom)}>
              <option value="DRAWER">{t('stock.paidFrom.DRAWER')}</option>
              {isAdmin && <option value="OUTSIDE">{t('stock.paidFrom.OUTSIDE')}</option>}
            </Select>
          </Label>
          {mayDate && (
            <Label>
              {t('expenses.date')}
              <Input
                type="date"
                value={spentAt}
                max={localDay()}
                onChange={(e) => setSpentAt(e.target.value)}
              />
            </Label>
          )}
          <Label style={{ gridColumn: 'span 2' }}>
            {t('stock.note')}
            <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Label>
        </Grid>
        {paidFrom === 'DRAWER' && <Muted style={{ marginTop: 6 }}>{t('stock.drawerHint')}</Muted>}
        <Btn
          $variant="primary"
          style={{ marginTop: 10 }}
          disabled={busy || !(sum > 0) || !spentAt}
          onClick={add}
        >
          <Save size={14} /> {t('common.save')}
        </Btn>
      </Card>

      <Card>
        <CardTitle>
          <span>{t('expenses.list')}</span>
          <span>
            {t('stock.total')}: <strong>{f.money(total)}</strong>
          </span>
        </CardTitle>
        <Grid $cols={4} style={{ marginBottom: 8 }}>
          <Label>
            {t('finance.from')}
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Label>
          <Label>
            {t('finance.to')}
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Label>
        </Grid>
        {rows.length === 0 ? (
          <Empty>{t('expenses.empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('expenses.date')}</th>
                <th>{t('expenses.category')}</th>
                <th>{t('stock.note')}</th>
                <th>{t('stock.paidFrom.label')}</th>
                <th className="num">{t('expenses.amount')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.voidedAt ? { opacity: 0.55 } : undefined}>
                  <td>{f.date(r.spentAt)}</td>
                  <td>{t(`expenses.categories.${r.category}`)}</td>
                  <td>{r.note || '—'}</td>
                  <td>{t(`stock.paidFrom.${r.paidFrom}`)}</td>
                  <td className="num">{f.money(r.amount)}</td>
                  <td>
                    {r.voidedAt ? (
                      <Badge $tone="bad">{t('stock.voided')}</Badge>
                    ) : (
                      isAdmin && (
                        <Btn
                          $variant="danger"
                          title={t('stock.void')}
                          aria-label={t('stock.void')}
                          onClick={() => setVoiding(r)}
                        >
                          <Trash2 size={14} />
                        </Btn>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {voiding && (
        <ConfirmDialog
          title={t('stock.void')}
          message={t('expenses.voidConfirm', { amount: f.money(voiding.amount) })}
          variant="danger"
          confirmLabel={t('stock.void')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setVoiding(null)}
          onConfirm={() =>
            run(() => window.electronAPI.expenses.void(voiding.id)).then(() => setVoiding(null))
          }
        />
      )}
    </Page>
  );
}

import { Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FinanceReportDto } from '../../../shared/stock';
import { useDataVersion } from '../../hooks/useDataVersion';
import { ipcErrorKey } from '../../store/lan-store';
import { Card, CardTitle, Empty, Grid, Input, Label, Muted, Page, Title } from '../Care/care-ui';
import { Figure, Figures, Tab, Table, Tabs, localDay, useFormat } from './stock-ui';

/**
 * Moliya hisoboti / Финансовый отчёт (v2.10), admins. One period: money taken, what the sold
 * products and the used supplies cost, stocktake losses, expenses, the profit, the money that
 * left the clinic and the stock value now. The web dashboard shows the same report (same code,
 * src/shared/stock.ts). A period longer than one day needs the plan's `reports` feature.
 */
export function FinanceReportPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const today = localDay();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [r, setR] = useState<FinanceReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useDataVersion(['finance', 'stock', 'appointments', 'shifts']);

  useEffect(() => {
    if (!from || !to || to < from) return;
    window.electronAPI.finance
      .report({ from, to })
      .then((x) => {
        setR(x);
        setError(null);
      })
      .catch((e) => {
        setR(null);
        setError(ipcErrorKey(e, 'common.error'));
      });
  }, [from, to, version]);

  const preset = (kind: 'today' | 'week' | 'month' | 'lastMonth') => {
    const d = new Date();
    if (kind === 'today') {
      setFrom(today);
      setTo(today);
    } else if (kind === 'week') {
      const s = new Date(d);
      s.setDate(d.getDate() - 6);
      setFrom(localDay(s));
      setTo(today);
    } else if (kind === 'month') {
      setFrom(localDay(new Date(d.getFullYear(), d.getMonth(), 1)));
      setTo(today);
    } else {
      setFrom(localDay(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
      setTo(localDay(new Date(d.getFullYear(), d.getMonth(), 0)));
    }
  };
  const rows = (map: Record<string, number>, label: (k: string) => string) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => (
        <tr key={k}>
          <td>{label(k)}</td>
          <td className="num">{f.money(v)}</td>
        </tr>
      ));

  return (
    <Page>
      <Title>
        <Landmark size={20} /> {t('finance.title')}
      </Title>
      <Card>
        <Tabs>
          <Tab $active={from === today && to === today} onClick={() => preset('today')}>
            {t('finance.today')}
          </Tab>
          <Tab $active={false} onClick={() => preset('week')}>
            {t('finance.week')}
          </Tab>
          <Tab $active={false} onClick={() => preset('month')}>
            {t('finance.month')}
          </Tab>
          <Tab $active={false} onClick={() => preset('lastMonth')}>
            {t('finance.lastMonth')}
          </Tab>
        </Tabs>
        <Grid $cols={4}>
          <Label>
            {t('finance.from')}
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Label>
          <Label>
            {t('finance.to')}
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Label>
        </Grid>
      </Card>

      {error && !r ? (
        <Card>
          <Empty>{t(error)}</Empty>
        </Card>
      ) : !r ? (
        <Empty>{t('common.loading')}</Empty>
      ) : (
        <>
          <Card>
            <Figures>
              <Figure label={t('finance.income')} value={f.money(r.income.total)} />
              <Figure
                label={t('finance.costs')}
                value={f.money(r.costOfSales + r.suppliesUsed.total + r.stockLoss)}
              />
              <Figure label={t('finance.expenses')} value={f.money(r.expenses.total)} />
              <Figure
                label={t('finance.profit')}
                value={f.money(r.profit)}
                tone={r.profit >= 0 ? 'good' : 'bad'}
              />
              <Figure label={t('finance.cashOut')} value={f.money(r.cashOut.total)} />
              <Figure
                label={t('finance.netCash')}
                value={f.money(r.netCash)}
                tone={r.netCash >= 0 ? 'good' : 'bad'}
              />
              <Figure label={t('finance.debt')} value={f.money(r.income.debt)} />
              <Figure label={t('finance.stockValue')} value={f.money(r.stock.value)} />
            </Figures>
            <Muted style={{ marginTop: 8 }}>{t('finance.profitHint')}</Muted>
          </Card>

          <Grid $cols={2}>
            <Card>
              <CardTitle>{t('finance.incomeTitle')}</CardTitle>
              <Table>
                <tbody>
                  {rows(r.income.byMethod, (k) =>
                    t(`appointments.paymentMethods.${k}`, { defaultValue: k }),
                  )}
                  <tr>
                    <td>
                      <strong>{t('finance.income')}</strong>
                    </td>
                    <td className="num">
                      <strong>{f.money(r.income.total)}</strong>
                    </td>
                  </tr>
                </tbody>
              </Table>
              <CardTitle style={{ marginTop: 12 }}>{t('finance.billedByKind')}</CardTitle>
              <Table>
                <tbody>
                  {rows(r.income.byKind, (k) => t(`services.kinds.${k}`, { defaultValue: k }))}
                  <tr>
                    <td>
                      <strong>{t('finance.billed')}</strong>
                    </td>
                    <td className="num">
                      <strong>{f.money(r.income.billed)}</strong>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardTitle>{t('finance.costsTitle')}</CardTitle>
              <Table>
                <tbody>
                  <tr>
                    <td>{t('finance.costOfSales')}</td>
                    <td className="num">{f.money(r.costOfSales)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.treatment')}</td>
                    <td className="num">{f.money(r.suppliesUsed.treatment)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.household')}</td>
                    <td className="num">{f.money(r.suppliesUsed.household)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.stockLoss')}</td>
                    <td className="num">{f.money(r.stockLoss)}</td>
                  </tr>
                  {rows(r.expenses.byCategory, (k) => t(`expenses.categories.${k}`))}
                  <tr>
                    <td>
                      <strong>{t('finance.profit')}</strong>
                    </td>
                    <td className="num">
                      <strong>{f.money(r.profit)}</strong>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardTitle>{t('finance.cashOutTitle')}</CardTitle>
              <Table>
                <thead>
                  <tr>
                    <th />
                    <th className="num">{t('stock.paidFrom.DRAWER')}</th>
                    <th className="num">{t('stock.paidFrom.OUTSIDE')}</th>
                    <th className="num">{t('stock.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(['purchases', 'expenses'] as const).map((k) => (
                    <tr key={k}>
                      <td>{t(`finance.out.${k}`)}</td>
                      <td className="num">{f.money(r.cashOut[k].drawer)}</td>
                      <td className="num">{f.money(r.cashOut[k].outside)}</td>
                      <td className="num">{f.money(r.cashOut[k].total)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardTitle>{t('finance.lowStock')}</CardTitle>
              {r.stock.low.length === 0 ? (
                <Empty>{t('finance.noLowStock')}</Empty>
              ) : (
                <Table>
                  <tbody>
                    {r.stock.low.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="num">
                          {f.qty(p.qtyOnHand)} / {f.qty(p.minQty)} {p.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </Grid>
        </>
      )}
    </Page>
  );
}

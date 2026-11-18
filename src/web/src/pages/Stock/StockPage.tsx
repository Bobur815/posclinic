import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, RefreshCw } from 'lucide-react';
import { subDays } from 'date-fns';
import { PRODUCT_CATEGORIES, type ProductCategory } from '@shared/stock';
import { stockApi, type StockProduct } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime, formatMoney, localDay } from '../../lib/format';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataState,
  FilterBar,
  Grid,
  Input,
  Modal,
  Page,
  PageHeader,
  Select,
  StatCard,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

const qty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

/** The clinic's stock as the main till last synced it (read-only; changes are made on the till). */
export function StockPage() {
  const { t } = useTranslation();
  const [inactive, setInactive] = useState(false);
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<StockProduct | null>(null);
  const { data, loading, error, reload } = useAsync(() => stockApi.products(inactive), [inactive]);

  const rows = useMemo(
    () =>
      (data?.items ?? []).filter(
        (p) =>
          (!category || p.category === category) &&
          (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [data, category, search],
  );
  const value = rows.reduce((s, p) => s + Math.max(0, p.qtyOnHand) * p.avgCost, 0);
  const low = rows.filter((p) => p.minQty !== null && p.qtyOnHand <= p.minQty).length;

  return (
    <Page>
      <PageHeader
        icon={<Package />}
        title={t('stock.title')}
        subtitle={t('stock.readOnly')}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />
      <Grid $min={200}>
        <StatCard label={t('stock.value')} value={formatMoney(value)} tone="primary" />
        <StatCard label={t('stock.products')} value={String(rows.length)} tone="info" />
        <StatCard label={t('stock.low')} value={String(low)} tone={low ? 'warning' : 'success'} />
      </Grid>
      <FilterBar>
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as ProductCategory | '')}
          style={{ maxWidth: 220 }}
        >
          <option value="">{t('common.all')}</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`stock.category.${c}`)}
            </option>
          ))}
        </Select>
        <Checkbox checked={inactive} onChange={setInactive} label={t('common.showInactive')} />
      </FilterBar>
      <Card>
        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={rows.length === 0}
          emptyText={t('stock.empty')}
        >
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>{t('stock.product')}</Th>
                  <Th>{t('stock.categoryLabel')}</Th>
                  <Th $right>{t('stock.onHand')}</Th>
                  <Th $right>{t('stock.avgCost')}</Th>
                  <Th $right>{t('stock.value')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isLow = p.minQty !== null && p.qtyOnHand <= p.minQty;
                  return (
                    <Tr key={p.id} $clickable $dim={!p.active} onClick={() => setOpen(p)}>
                      <Td $title>
                        {p.name}{' '}
                        {p.qtyOnHand < 0 ? (
                          <Badge $tone="error">{t('stock.negative')}</Badge>
                        ) : (
                          isLow && <Badge $tone="warning">{t('stock.low')}</Badge>
                        )}
                      </Td>
                      <Td data-label={t('stock.categoryLabel')}>
                        {t(`stock.category.${p.category}`)}
                      </Td>
                      <Td $right $nowrap data-label={t('stock.onHand')}>
                        {qty(p.qtyOnHand)} {p.unit}
                      </Td>
                      <Td $right $nowrap data-label={t('stock.avgCost')}>
                        {formatMoney(p.avgCost)}
                      </Td>
                      <Td $right $nowrap data-label={t('stock.value')}>
                        {formatMoney(Math.max(0, p.qtyOnHand) * p.avgCost)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </DataState>
      </Card>
      {open && <History product={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}

function History({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(localDay(subDays(new Date(), 30)));
  const [to, setTo] = useState(localDay());
  const { data, loading, error, reload } = useAsync(
    () => stockApi.movements({ productId: product.id, from, to, pageSize: 100 }),
    [product.id, from, to],
  );
  return (
    <Modal wide title={`${t('stock.history')}: ${product.name}`} onClose={onClose}>
      <FilterBar>
        <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </FilterBar>
      <DataState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={!data?.items.length}
        emptyText={t('stock.noMovements')}
      >
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>{t('common.date')}</Th>
                <Th>{t('stock.movementType')}</Th>
                <Th $right>{t('stock.qty')}</Th>
                <Th $right>{t('stock.avgCost')}</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((m) => (
                <Tr key={m.id}>
                  <Td $nowrap $title>
                    {formatDateTime(m.createdAt)}
                  </Td>
                  <Td data-label={t('stock.movementType')}>
                    {t(`stock.movement.${m.type}`, { defaultValue: m.type })}
                    {m.note && m.note !== 'undo' ? ` · ${m.note}` : ''}
                  </Td>
                  <Td $right $nowrap data-label={t('stock.qty')}>
                    {m.qty > 0 ? '+' : ''}
                    {qty(m.qty)} {product.unit}
                  </Td>
                  <Td $right $nowrap data-label={t('stock.avgCost')}>
                    {formatMoney(m.unitCost)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </DataState>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        {t('stock.lastUpdated', { at: formatDateTime(product.updatedAt) })}
      </p>
    </Modal>
  );
}

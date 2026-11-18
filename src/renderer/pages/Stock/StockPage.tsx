import {
  ClipboardCheck,
  History,
  MinusCircle,
  Package,
  Pencil,
  Plus,
  Save,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceDto } from '../../../shared/clinic';
import {
  type PaidFrom,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductDto,
  type ServiceSupplyDto,
  type StockMovementDto,
  type StockReceiptDto,
} from '../../../shared/stock';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';
import {
  Actions,
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
import { Badge, Qty, Tab, Table, Tabs, parseNum, useFormat } from './stock-ui';

/**
 * Ombor / Склад (v2.10): everything the clinic buys and keeps. Products with what is on hand and
 * its average cost; deliveries (from the drawer or paid outside); write-offs; a stocktake; and
 * what each procedure uses per session. Sales and procedures take from stock by themselves
 * (main, at payment and when a session is ticked). Main enforces who may do what.
 */

type Panel =
  | { kind: 'product'; product: ProductDto | null }
  | { kind: 'receive' }
  | { kind: 'writeOff'; productId?: string }
  | { kind: 'count' }
  | { kind: 'history'; product: ProductDto }
  | null;

export function StockPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const f = useFormat();
  const role = useAuthStore((s) => s.user?.role ?? '');
  const isAdmin = role === 'CLINIC_ADMIN' || role === 'SUPER_ADMIN';
  const canReceive = isAdmin || role === 'RECEPTIONIST';
  const canWriteOff = canReceive || role === 'NURSE';

  const [tab, setTab] = useState<'products' | 'receipts' | 'supplies'>('products');
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [receipts, setReceipts] = useState<StockReceiptDto[]>([]);
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [voiding, setVoiding] = useState<StockReceiptDto | null>(null);
  const version = useDataVersion(['stock']);

  const load = useCallback(() => {
    window.electronAPI.stock
      .listProducts({ includeInactive: isAdmin })
      .then(setProducts)
      .catch(() => undefined);
    window.electronAPI.stock
      .listReceipts()
      .then(setReceipts)
      .catch(() => undefined);
  }, [isAdmin]);
  useEffect(() => {
    load();
  }, [load, version]);

  // One call at a time: a double click never saves twice.
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      toast.success(t('common.success'));
      load();
      return true;
    } catch (e) {
      const key = ipcErrorKey(e, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(
    () =>
      products.filter(
        (p) =>
          (!category || p.category === category) &&
          (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [products, category, search],
  );
  const takenServiceIds = useMemo(
    () => products.flatMap((p) => (p.serviceId ? [p.serviceId] : [])),
    [products],
  );
  const value = shown.reduce((s, p) => s + Math.max(0, p.qtyOnHand) * p.avgCost, 0);
  const stateOf = (p: ProductDto) =>
    p.qtyOnHand < 0 ? 'negative' : p.minQty !== null && p.qtyOnHand <= p.minQty ? 'low' : 'ok';

  return (
    <Page>
      <Title>
        <Package size={20} /> {t('stock.title')}
      </Title>

      <Actions style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
        {isAdmin && (
          <Btn $variant="primary" onClick={() => setPanel({ kind: 'product', product: null })}>
            <Plus size={14} /> {t('stock.newProduct')}
          </Btn>
        )}
        {canReceive && (
          <Btn onClick={() => setPanel({ kind: 'receive' })}>
            <Truck size={14} /> {t('stock.receive')}
          </Btn>
        )}
        {canWriteOff && (
          <Btn onClick={() => setPanel({ kind: 'writeOff' })}>
            <MinusCircle size={14} /> {t('stock.writeOff')}
          </Btn>
        )}
        {isAdmin && (
          <Btn onClick={() => setPanel({ kind: 'count' })}>
            <ClipboardCheck size={14} /> {t('stock.count')}
          </Btn>
        )}
      </Actions>

      {panel?.kind === 'product' && (
        <ProductForm
          product={panel.product}
          takenServiceIds={takenServiceIds}
          onClose={() => setPanel(null)}
          onSave={(id, data) =>
            run(() => window.electronAPI.stock.saveProduct(id, data)).then(
              (ok) => ok && setPanel(null),
            )
          }
        />
      )}
      {panel?.kind === 'receive' && (
        <ReceiveForm
          products={products.filter((p) => p.active)}
          canOutside={isAdmin}
          onClose={() => setPanel(null)}
          onSave={(data) =>
            run(() => window.electronAPI.stock.receive(data)).then((ok) => ok && setPanel(null))
          }
        />
      )}
      {panel?.kind === 'writeOff' && (
        <WriteOffForm
          products={products.filter((p) => p.active)}
          initial={panel.productId}
          onClose={() => setPanel(null)}
          onSave={(data) =>
            run(() => window.electronAPI.stock.writeOff(data)).then((ok) => ok && setPanel(null))
          }
        />
      )}
      {panel?.kind === 'count' && (
        <CountForm
          products={products.filter((p) => p.active)}
          onClose={() => setPanel(null)}
          onSave={(data) =>
            run(() => window.electronAPI.stock.count(data)).then((ok) => ok && setPanel(null))
          }
        />
      )}
      {panel?.kind === 'history' && (
        <HistoryPanel product={panel.product} onClose={() => setPanel(null)} />
      )}

      <Tabs>
        <Tab $active={tab === 'products'} onClick={() => setTab('products')}>
          {t('stock.tabs.products')}
        </Tab>
        <Tab $active={tab === 'receipts'} onClick={() => setTab('receipts')}>
          {t('stock.tabs.receipts')}
        </Tab>
        {isAdmin && (
          <Tab $active={tab === 'supplies'} onClick={() => setTab('supplies')}>
            {t('stock.tabs.supplies')}
          </Tab>
        )}
      </Tabs>

      {tab === 'products' && (
        <Card>
          <Grid $cols={3} style={{ marginBottom: 8 }}>
            <Input
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ProductCategory | '')}
            >
              <option value="">{t('stock.allCategories')}</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`stock.category.${c}`)}
                </option>
              ))}
            </Select>
            <Muted style={{ alignSelf: 'center' }}>
              {t('stock.stockValue')}: <strong>{f.money(value)}</strong>
            </Muted>
          </Grid>
          {shown.length === 0 ? (
            <Empty>{t('stock.noProducts')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('stock.product')}</th>
                  <th>{t('stock.categoryLabel')}</th>
                  <th className="num">{t('stock.onHand')}</th>
                  <th className="num">{t('stock.avgCost')}</th>
                  <th className="num">{t('stock.value')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const state = stateOf(p);
                  return (
                    <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                      <td>
                        <strong>{p.name}</strong>
                        {p.service && <Muted>{p.service.name}</Muted>}
                        {!p.active && <Badge>{t('common.inactive')}</Badge>}
                      </td>
                      <td>{t(`stock.category.${p.category}`)}</td>
                      <td className="num">
                        <Qty $state={state}>
                          {f.qty(p.qtyOnHand)} {p.unit}
                        </Qty>
                        {state === 'low' && <Muted>{t('stock.low')}</Muted>}
                        {state === 'negative' && <Muted>{t('stock.negative')}</Muted>}
                      </td>
                      <td className="num">{f.money(p.avgCost)}</td>
                      <td className="num">{f.money(Math.max(0, p.qtyOnHand) * p.avgCost)}</td>
                      <td>
                        <Actions>
                          <Btn
                            title={t('stock.history')}
                            aria-label={t('stock.history')}
                            onClick={() => setPanel({ kind: 'history', product: p })}
                          >
                            <History size={14} />
                          </Btn>
                          {canWriteOff && p.active && (
                            <Btn
                              title={t('stock.writeOff')}
                              aria-label={t('stock.writeOff')}
                              onClick={() => setPanel({ kind: 'writeOff', productId: p.id })}
                            >
                              <MinusCircle size={14} />
                            </Btn>
                          )}
                          {isAdmin && (
                            <Btn
                              title={t('common.edit')}
                              aria-label={t('common.edit')}
                              onClick={() => setPanel({ kind: 'product', product: p })}
                            >
                              <Pencil size={14} />
                            </Btn>
                          )}
                        </Actions>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'receipts' && (
        <Card>
          {receipts.length === 0 ? (
            <Empty>{t('stock.noReceipts')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('stock.receiptNo')}</th>
                  <th>{t('stock.date')}</th>
                  <th>{t('stock.supplier')}</th>
                  <th>{t('stock.lines')}</th>
                  <th className="num">{t('stock.total')}</th>
                  <th>{t('stock.paidFrom.label')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} style={r.voidedAt ? { opacity: 0.55 } : undefined}>
                    <td>
                      <strong>{r.number}</strong>
                      {r.docNo && <Muted>{r.docNo}</Muted>}
                    </td>
                    <td>{f.date(r.receivedAt)}</td>
                    <td>{r.supplier ?? '—'}</td>
                    <td>
                      {(r.movements ?? []).map((m) => (
                        <Muted key={m.id}>
                          {m.product?.name}: {f.qty(m.qty)} {m.product?.unit} ×{' '}
                          {f.money(m.unitCost)}
                        </Muted>
                      ))}
                    </td>
                    <td className="num">{f.money(r.total)}</td>
                    <td>{t(`stock.paidFrom.${r.paidFrom}`)}</td>
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
      )}

      {tab === 'supplies' && isAdmin && (
        <SuppliesCard products={products.filter((p) => p.active)} onRun={run} />
      )}

      {voiding && (
        <ConfirmDialog
          title={t('stock.void')}
          message={t('stock.voidConfirm', { number: voiding.number })}
          variant="danger"
          confirmLabel={t('stock.void')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setVoiding(null)}
          onConfirm={() =>
            run(() => window.electronAPI.stock.voidReceipt(voiding.id)).then(() => setVoiding(null))
          }
        />
      )}
    </Page>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────────────────

function PanelCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardTitle>
        <span>{title}</span>
        <Btn aria-label={t('common.close')} title={t('common.close')} onClick={onClose}>
          <X size={14} />
        </Btn>
      </CardTitle>
      {children}
    </Card>
  );
}

function ProductForm({
  product,
  takenServiceIds,
  onClose,
  onSave,
}: {
  product: ProductDto | null;
  /** Sale services already tied to another product. */
  takenServiceIds: string[];
  onClose: () => void;
  onSave: (
    id: string | null,
    data: Parameters<typeof window.electronAPI.stock.saveProduct>[1],
  ) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState<ProductCategory>(product?.category ?? 'HOUSEHOLD');
  const [unit, setUnit] = useState(product?.unit ?? 'dona');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [minQty, setMinQty] = useState(
    product?.minQty === null || !product ? '' : String(product.minQty),
  );
  const [active, setActive] = useState(product?.active ?? true);
  // A sold product is sold through a DIRECT_SALE service; the form only asks for its price.
  const linked = product?.service ?? null;
  const [salePrice, setSalePrice] = useState(linked ? String(linked.price) : '');
  const price = parseNum(salePrice);
  // Rare: tie it to a sale service made before the stock page (one no other product uses).
  const [linking, setLinking] = useState(false);
  const [linkId, setLinkId] = useState('');
  const [services, setServices] = useState<ServiceDto[]>([]);
  useEffect(() => {
    if (!linking || services.length) return;
    window.electronAPI.services
      .getActive()
      .then((s) =>
        setServices(s.filter((x) => x.kind === 'DIRECT_SALE' && !takenServiceIds.includes(x.id))),
      )
      .catch(() => undefined);
  }, [linking, services.length, takenServiceIds]);
  const pickService = (sid: string) => {
    setLinkId(sid);
    const s = services.find((x) => x.id === sid);
    if (s) setSalePrice(String(s.price));
  };
  const sold = category === 'SALE';
  const min = parseNum(minQty);
  const priceOk = salePrice.trim() !== '' && price >= 0;
  return (
    <PanelCard title={product ? t('stock.editProduct') : t('stock.newProduct')} onClose={onClose}>
      <Grid $cols={3}>
        <Label>
          {t('stock.productName')}
          <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </Label>
        <Label>
          {t('stock.categoryLabel')}
          <Select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`stock.category.${c}`)}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          {t('stock.unit')}
          <Input value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} />
        </Label>
        <Label>
          {t('stock.minQty')}
          <Input inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        </Label>
        <Label>
          {t('stock.barcode')}
          <Input value={barcode} maxLength={64} onChange={(e) => setBarcode(e.target.value)} />
        </Label>
        {sold && linking && (
          <Label>
            {t('stock.existingService')}
            <Select value={linkId} onChange={(e) => pickService(e.target.value)}>
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </Select>
          </Label>
        )}
        {sold && (
          <Label>
            {t('stock.salePrice')}
            <Input
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </Label>
        )}
        {product && (
          <Label>
            {t('common.active')}
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </Label>
        )}
      </Grid>
      {sold && (
        <Muted style={{ marginTop: 6 }}>
          {linked
            ? t('stock.saleLinkedHint', { name: linked.name })
            : linking
              ? t('stock.saleExistingHint')
              : t('stock.saleNewHint')}{' '}
          {!linked && (
            <Btn
              style={{ padding: '0 6px', minHeight: 0 }}
              onClick={() => {
                setLinking(!linking);
                setLinkId('');
              }}
            >
              {linking ? t('stock.saleNewInstead') : t('stock.linkExisting')}
            </Btn>
          )}
        </Muted>
      )}
      <Btn
        $variant="primary"
        style={{ marginTop: 10 }}
        disabled={
          !name.trim() ||
          (minQty.trim() !== '' && !(min >= 0)) ||
          (sold && !priceOk) ||
          (sold && linking && !linkId)
        }
        onClick={() =>
          onSave(product?.id ?? null, {
            name: name.trim(),
            category,
            unit: unit.trim() || 'dona',
            barcode: barcode.trim() || null,
            minQty: minQty.trim() === '' ? null : min,
            ...(sold ? { salePrice: price } : {}),
            ...(sold && linking && linkId ? { serviceId: linkId } : {}),
            active,
          })
        }
      >
        <Save size={14} /> {t('common.save')}
      </Btn>
    </PanelCard>
  );
}

interface Line {
  productId: string;
  qty: string;
  unitCost: string;
}

function ReceiveForm({
  products,
  canOutside,
  onClose,
  onSave,
}: {
  products: ProductDto[];
  canOutside: boolean;
  onClose: () => void;
  onSave: (data: Parameters<typeof window.electronAPI.stock.receive>[0]) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [supplier, setSupplier] = useState('');
  const [docNo, setDocNo] = useState('');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('DRAWER');
  const [lines, setLines] = useState<Line[]>([{ productId: '', qty: '', unitCost: '' }]);
  // One id per delivery being entered: a repeated submit (or a satellite retry) saves it once.
  const [clientId] = useState(() => crypto.randomUUID());
  const set = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const parsed = lines.map((l) => ({
    productId: l.productId,
    qty: parseNum(l.qty),
    unitCost: parseNum(l.unitCost),
  }));
  const valid =
    parsed.length > 0 && parsed.every((l) => l.productId && l.qty > 0 && l.unitCost >= 0);
  const total = parsed.reduce(
    (s, l) => s + (Number.isFinite(l.qty * l.unitCost) ? l.qty * l.unitCost : 0),
    0,
  );
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? '';
  return (
    <PanelCard title={t('stock.receive')} onClose={onClose}>
      <Grid $cols={3}>
        <Label>
          {t('stock.supplier')}
          <Input value={supplier} maxLength={200} onChange={(e) => setSupplier(e.target.value)} />
        </Label>
        <Label>
          {t('stock.docNo')}
          <Input value={docNo} maxLength={100} onChange={(e) => setDocNo(e.target.value)} />
        </Label>
        <Label>
          {t('stock.paidFrom.label')}
          <Select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as PaidFrom)}>
            <option value="DRAWER">{t('stock.paidFrom.DRAWER')}</option>
            {canOutside && <option value="OUTSIDE">{t('stock.paidFrom.OUTSIDE')}</option>}
          </Select>
        </Label>
      </Grid>
      <Table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>{t('stock.product')}</th>
            <th>{t('stock.qty')}</th>
            <th>{t('stock.unitCost')}</th>
            <th className="num">{t('stock.total')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const p = parsed[i];
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved
              <tr key={i}>
                <td>
                  <Select
                    value={l.productId}
                    onChange={(e) => set(i, { productId: e.target.value })}
                  >
                    <option value="">—</option>
                    {products.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Input
                    inputMode="decimal"
                    value={l.qty}
                    placeholder={unitOf(l.productId)}
                    onChange={(e) => set(i, { qty: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    inputMode="decimal"
                    value={l.unitCost}
                    onChange={(e) => set(i, { unitCost: e.target.value })}
                  />
                </td>
                <td className="num">
                  {Number.isFinite(p.qty * p.unitCost) ? f.money(p.qty * p.unitCost) : '—'}
                </td>
                <td>
                  {lines.length > 1 && (
                    <Btn
                      aria-label={t('common.delete')}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <X size={14} />
                    </Btn>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Actions style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <Btn onClick={() => setLines([...lines, { productId: '', qty: '', unitCost: '' }])}>
          <Plus size={14} /> {t('stock.addLine')}
        </Btn>
        <span>
          {t('stock.total')}: <strong>{f.money(total)}</strong>
        </span>
        <Btn
          $variant="primary"
          disabled={!valid}
          onClick={() =>
            onSave({
              id: clientId,
              supplier: supplier.trim() || null,
              docNo: docNo.trim() || null,
              paidFrom,
              lines: parsed,
            })
          }
        >
          <Save size={14} /> {t('stock.saveReceipt')}
        </Btn>
      </Actions>
      {paidFrom === 'DRAWER' && <Muted>{t('stock.drawerHint')}</Muted>}
    </PanelCard>
  );
}

function WriteOffForm({
  products,
  initial,
  onClose,
  onSave,
}: {
  products: ProductDto[];
  initial?: string;
  onClose: () => void;
  onSave: (data: Parameters<typeof window.electronAPI.stock.writeOff>[0]) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [productId, setProductId] = useState(initial ?? '');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const p = products.find((x) => x.id === productId);
  const q = parseNum(qty);
  return (
    <PanelCard title={t('stock.writeOff')} onClose={onClose}>
      <Grid $cols={3}>
        <Label>
          {t('stock.product')}
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">—</option>
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          {t('stock.qty')}
          {p ? ` (${t('stock.onHand')}: ${f.qty(p.qtyOnHand)} ${p.unit})` : ''}
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Label>
        <Label>
          {t('stock.reason')}
          <Input
            value={note}
            maxLength={200}
            placeholder={t('stock.reasonPlaceholder')}
            onChange={(e) => setNote(e.target.value)}
          />
        </Label>
      </Grid>
      <Btn
        $variant="primary"
        style={{ marginTop: 10 }}
        disabled={!productId || !(q > 0)}
        onClick={() => onSave({ productId, qty: q, note: note.trim() || null })}
      >
        <Save size={14} /> {t('stock.writeOff')}
      </Btn>
    </PanelCard>
  );
}

function CountForm({
  products,
  onClose,
  onSave,
}: {
  products: ProductDto[];
  onClose: () => void;
  onSave: (data: Parameters<typeof window.electronAPI.stock.count>[0]) => void;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const changes = products
    .map((p) => ({ p, c: parseNum(counted[p.id] ?? '') }))
    .filter(({ c }) => c >= 0);
  const bad = Object.values(counted).some((v) => v.trim() !== '' && !(parseNum(v) >= 0));
  const loss = changes.reduce((s, { p, c }) => s + (p.qtyOnHand - c) * p.avgCost, 0);
  return (
    <PanelCard title={t('stock.count')} onClose={onClose}>
      <Muted>{t('stock.countHint')}</Muted>
      <Table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>{t('stock.product')}</th>
            <th className="num">{t('stock.onHand')}</th>
            <th>{t('stock.counted')}</th>
            <th className="num">{t('stock.difference')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const c = parseNum(counted[p.id] ?? '');
            const diff = c >= 0 ? c - p.qtyOnHand : null;
            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">
                  {f.qty(p.qtyOnHand)} {p.unit}
                </td>
                <td>
                  <Input
                    inputMode="decimal"
                    value={counted[p.id] ?? ''}
                    onChange={(e) => setCounted({ ...counted, [p.id]: e.target.value })}
                  />
                </td>
                <td className="num">
                  {diff === null ? (
                    ''
                  ) : (
                    <Qty $state={diff < 0 ? 'negative' : 'ok'}>
                      {diff > 0 ? '+' : ''}
                      {f.qty(diff)}
                    </Qty>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Grid $cols={2} style={{ marginTop: 10, alignItems: 'end' }}>
        <Label>
          {t('stock.note')}
          <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Label>
        <Actions>
          <span>
            {loss >= 0 ? t('stock.lossValue') : t('stock.gainValue')}:{' '}
            <strong>{f.money(Math.abs(loss))}</strong>
          </span>
          <Btn
            $variant="primary"
            disabled={changes.length === 0 || bad}
            onClick={() =>
              onSave({
                counts: changes.map(({ p, c }) => ({ productId: p.id, counted: c })),
                note: note.trim() || null,
              })
            }
          >
            <Save size={14} /> {t('stock.saveCount')}
          </Btn>
        </Actions>
      </Grid>
    </PanelCard>
  );
}

function HistoryPanel({ product, onClose }: { product: ProductDto; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [rows, setRows] = useState<StockMovementDto[] | null>(null);
  const version = useDataVersion(['stock']);
  useEffect(() => {
    window.electronAPI.stock
      .movements(product.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [product.id, version]);
  return (
    <PanelCard title={`${t('stock.history')}: ${product.name}`} onClose={onClose}>
      {rows === null ? (
        <Empty>{t('common.loading')}</Empty>
      ) : rows.length === 0 ? (
        <Empty>{t('stock.noMovements')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('stock.date')}</th>
              <th>{t('stock.movementType')}</th>
              <th className="num">{t('stock.qty')}</th>
              <th className="num">{t('stock.unitCost')}</th>
              <th>{t('stock.note')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{f.dateTime(m.createdAt)}</td>
                <td>{t(`stock.movement.${m.type}`)}</td>
                <td className="num">
                  <Qty $state={m.qty < 0 ? 'negative' : 'ok'}>
                    {m.qty > 0 ? '+' : ''}
                    {f.qty(m.qty)} {product.unit}
                  </Qty>
                </td>
                <td className="num">{f.money(m.unitCost)}</td>
                <td>{m.note === 'undo' ? t('stock.undoNote') : m.note}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </PanelCard>
  );
}

/** What one unit of a service uses (taken from stock when a session is ticked / it is done). */
function SuppliesCard({
  products,
  onRun,
}: {
  products: ProductDto[];
  onRun: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [rows, setRows] = useState<Array<{ productId: string; qty: string }>>([]);
  useEffect(() => {
    window.electronAPI.services
      .getActive()
      .then((s) => setServices(s.filter((x) => x.kind !== 'DIRECT_SALE')))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!serviceId) {
      setRows([]);
      return;
    }
    window.electronAPI.stock
      .getSupplies(serviceId)
      .then((list: ServiceSupplyDto[]) =>
        setRows(list.map((s) => ({ productId: s.productId, qty: String(s.qty) }))),
      )
      .catch(() => setRows([]));
  }, [serviceId]);
  const parsed = rows.map((r) => ({ productId: r.productId, qty: parseNum(r.qty) }));
  const valid =
    parsed.every((r) => r.productId && r.qty > 0) &&
    new Set(parsed.map((r) => r.productId)).size === parsed.length;
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? '';
  return (
    <Card>
      <CardTitle>{t('stock.suppliesTitle')}</CardTitle>
      <Muted>{t('stock.suppliesHint')}</Muted>
      <Label style={{ marginTop: 8, maxWidth: 420 }}>
        {t('stock.service')}
        <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">—</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({t(`services.kinds.${s.kind}`)})
            </option>
          ))}
        </Select>
      </Label>
      {serviceId && (
        <>
          {rows.length === 0 && <Empty>{t('stock.noSupplies')}</Empty>}
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved
            <Grid key={i} $cols={3} style={{ marginTop: 6, alignItems: 'end' }}>
              <Select
                value={r.productId}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))
                }
              >
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input
                inputMode="decimal"
                value={r.qty}
                placeholder={unitOf(r.productId)}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                }
              />
              <div>
                <Btn
                  aria-label={t('common.delete')}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </Btn>
              </div>
            </Grid>
          ))}
          <Actions style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <Btn onClick={() => setRows([...rows, { productId: '', qty: '' }])}>
              <Plus size={14} /> {t('stock.addLine')}
            </Btn>
            <Btn
              $variant="primary"
              disabled={!valid}
              onClick={() => onRun(() => window.electronAPI.stock.setSupplies(serviceId, parsed))}
            >
              <Save size={14} /> {t('common.save')}
            </Btn>
          </Actions>
        </>
      )}
    </Card>
  );
}

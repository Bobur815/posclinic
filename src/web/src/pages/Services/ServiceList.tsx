import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Plus, Pencil, RefreshCw, Search } from 'lucide-react';
import { useToast } from '@context/ToastContext';
import { servicesApi, type Service, type ServiceInput } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useClinicTypes } from '../../hooks/useClinicTypes';
import { useDebounced } from '../../hooks/useDebounced';
import { errorText } from '../../lib/errors';
import { formatMoney, formatNumber } from '../../lib/format';
import {
  ActiveBadge,
  Button,
  Checkbox,
  DataState,
  ErrorBanner,
  Field,
  FilterBar,
  FormGrid,
  Input,
  Modal,
  Page,
  PageHeader,
  Select,
  Table,
  TableWrap,
  Td,
  Textarea,
  Th,
  Tr,
} from '../../components/ui';

const EMPTY: ServiceInput = {
  code: '',
  name: '',
  description: '',
  price: 0,
  duration: 30,
  kind: 'PROCEDURE',
  isFollowUp: false,
  resultType: null,
  active: true,
};

export function ServiceList() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => servicesApi.list(), []);
  const types = useClinicTypes();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const q = useDebounced(search.trim().toLowerCase(), 150);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((s) => showInactive || s.active)
        .filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [data, q, showInactive],
  );

  return (
    <Page>
      <PageHeader
        icon={<Layers />}
        title={t('services.title')}
        subtitle={t('catalog.syncHint')}
        actions={
          <>
            <Button onClick={reload} aria-label={t('common.refresh')}>
              <RefreshCw />
            </Button>
            <Button $variant="primary" onClick={() => setEditing('new')}>
              <Plus />
              {t('services.newService')}
            </Button>
          </>
        }
      />

      <FilterBar>
        <Field label={t('common.search')}>
          <div style={{ position: 'relative' }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('services.searchPlaceholder')} style={{ paddingLeft: 32 }} />
            <Search size={16} style={{ position: 'absolute', left: 10, top: 11, opacity: 0.5 }} />
          </div>
        </Field>
        <Checkbox label={t('common.showInactive')} checked={showInactive} onChange={setShowInactive} />
      </FilterBar>

      <TableWrap>
        <DataState loading={loading && !data} error={error} onRetry={reload} empty={rows.length === 0} emptyText={t('services.noServices')}>
          <Table>
            <thead>
              <tr>
                <Th>{t('services.code')}</Th>
                <Th>{t('services.name')}</Th>
                <Th>{t('services.kind')}</Th>
                <Th $right>{t('services.price')}</Th>
                <Th $right>{t('services.duration')}</Th>
                <Th>{t('common.status')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Tr key={s.id} $dim={!s.active}>
                  <Td $muted $nowrap>{s.code}</Td>
                  <Td>
                    {s.name}
                    {s.description && <div style={{ fontSize: 12, opacity: 0.7 }}>{s.description}</div>}
                  </Td>
                  <Td $nowrap>
                    {types.serviceType(s.serviceTypeId)?.name ?? t(`services.kinds.${s.kind ?? 'PROCEDURE'}`)}
                  </Td>
                  <Td $right $nowrap>{formatMoney(s.price)}</Td>
                  <Td $right $nowrap>{formatNumber(s.duration)} {t('common.minutes')}</Td>
                  <Td><ActiveBadge active={s.active} /></Td>
                  <Td $right>
                    <Button $small $variant="ghost" onClick={() => setEditing(s)} aria-label={t('common.edit')}>
                      <Pencil />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </DataState>
      </TableWrap>

      {editing && (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Page>
  );
}

function ServiceForm({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<ServiceInput>(
    service
      ? {
          code: service.code,
          name: service.name,
          description: service.description ?? '',
          price: service.price,
          duration: service.duration,
          kind: service.kind ?? 'PROCEDURE',
          isFollowUp: service.isFollowUp ?? false,
          resultType: service.resultType ?? null,
          active: service.active,
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ServiceInput>(k: K, v: ServiceInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const valid = form.code.trim() && form.name.trim() && form.price >= 0 && form.duration > 0;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setSaving(true);
    setErr(null);
    const body: ServiceInput = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description?.trim() || null,
      price: Math.round(form.price),
      duration: Math.round(form.duration),
    };
    try {
      if (service) await servicesApi.update(service.id, body);
      else await servicesApi.create(body);
      toast.success(t('common.saved'));
      onSaved();
    } catch (ex) {
      setErr(errorText(t, ex));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={service ? t('services.editService') : t('services.newService')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button $variant="primary" disabled={!valid || saving} onClick={() => save()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={save} style={{ display: 'contents' }}>
        {err && <ErrorBanner>{err}</ErrorBanner>}
        <FormGrid>
          <Field label={t('services.code')}>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} maxLength={32} autoFocus required />
          </Field>
          <Field label={t('services.name')}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} required />
          </Field>
          <Field label={`${t('services.price')} (${t('common.currency')})`}>
            <Input type="number" min={0} step={1000} value={form.price} onChange={(e) => set('price', Number(e.target.value))} required />
          </Field>
          <Field label={t('services.durationMin')}>
            <Input type="number" min={1} step={5} value={form.duration} onChange={(e) => set('duration', Number(e.target.value))} required />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('services.kind')}>
            <Select
              value={form.kind ?? 'PROCEDURE'}
              onChange={(e) => set('kind', e.target.value as ServiceInput['kind'])}
            >
              {(['CONSULTATION', 'ANALYSIS', 'PROCEDURE', 'DIRECT_SALE'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`services.kinds.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          {form.kind === 'ANALYSIS' && (
            <Field label={t('services.resultType')}>
              <Select
                value={form.resultType ?? 'QUALITATIVE'}
                onChange={(e) => set('resultType', e.target.value as ServiceInput['resultType'])}
              >
                {(['QUALITATIVE', 'QUANTITATIVE', 'TEXT'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`services.resultTypes.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FormGrid>
        {form.kind === 'CONSULTATION' && (
          <Checkbox
            label={t('services.followUp')}
            checked={form.isFollowUp === true}
            onChange={(v) => set('isFollowUp', v)}
          />
        )}
        <Field label={t('services.description')}>
          <Textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
        </Field>
        <Checkbox label={t('common.active')} checked={form.active} onChange={(v) => set('active', v)} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

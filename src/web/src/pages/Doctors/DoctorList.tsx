import { Paged } from '../../components/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stethoscope, Plus, Pencil, RefreshCw, Search } from 'lucide-react';
import { normalizePhone } from '@shared/phone';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { useToast } from '@context/ToastContext';
import { doctorsApi, type Doctor, type DoctorInput } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { invalidateDoctors } from '../../hooks/useDoctors';
import { errorText } from '../../lib/errors';
import { showPhone } from '../../lib/format';
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
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

export function DoctorList() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => doctorsApi.list(), []);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Doctor | 'new' | null>(null);
  const q = useDebounced(search.trim().toLowerCase(), 150);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((d) => showInactive || d.active)
        .filter(
          (d) =>
            !q ||
            d.fullName.toLowerCase().includes(q) ||
            (d.specialty ?? '').toLowerCase().includes(q) ||
            (d.phone ?? '').includes(q),
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [data, q, showInactive],
  );

  return (
    <Page>
      <PageHeader
        icon={<Stethoscope />}
        title={t('doctors.title')}
        subtitle={t('catalog.syncHint')}
        actions={
          <>
            <Button onClick={reload} aria-label={t('common.refresh')}>
              <RefreshCw />
            </Button>
            <Button $variant="primary" onClick={() => setEditing('new')}>
              <Plus />
              {t('doctors.newDoctor')}
            </Button>
          </>
        }
      />

      <FilterBar>
        <Field label={t('common.search')}>
          <div style={{ position: 'relative' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('doctors.searchPlaceholder')}
              style={{ paddingLeft: 32 }}
            />
            <Search size={16} style={{ position: 'absolute', left: 10, top: 11, opacity: 0.5 }} />
          </div>
        </Field>
        <Checkbox
          label={t('common.showInactive')}
          checked={showInactive}
          onChange={setShowInactive}
        />
      </FilterBar>

      <TableWrap>
        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={rows.length === 0}
          emptyText={t('doctors.noDoctors')}
        >
          <Paged rows={rows} resetKey={`${q}|${showInactive}`}>
            {(pageRows) => (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('doctors.fullName')}</Th>
                    <Th>{t('doctors.specialty')}</Th>
                    <Th>{t('doctors.phone')}</Th>
                    <Th>{t('doctors.licenseNo')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((d) => (
                    <Tr key={d.id} $dim={!d.active}>
                      <Td $title>{d.fullName}</Td>
                      <Td data-label={t('doctors.specialty')}>{d.specialty || '—'}</Td>
                      <Td $nowrap data-label={t('doctors.phone')}>
                        {showPhone(d.phone)}
                      </Td>
                      <Td $muted data-label={t('doctors.licenseNo')}>
                        {d.licenseNo || '—'}
                      </Td>
                      <Td data-label={t('common.status')}>
                        <ActiveBadge active={d.active} />
                      </Td>
                      <Td $right $actions>
                        <Button
                          $small
                          $variant="ghost"
                          onClick={() => setEditing(d)}
                          aria-label={t('common.edit')}
                        >
                          <Pencil />
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Paged>
        </DataState>
      </TableWrap>

      {editing && (
        <DoctorForm
          doctor={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidateDoctors();
            void reload();
          }}
        />
      )}
    </Page>
  );
}

function DoctorForm({
  doctor,
  onClose,
  onSaved,
}: {
  doctor: Doctor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullName, setFullName] = useState(doctor?.fullName ?? '');
  const [phone, setPhone] = useState(doctor?.phone ?? '');
  const [specialty, setSpecialty] = useState(doctor?.specialty ?? '');
  const [licenseNo, setLicenseNo] = useState(doctor?.licenseNo ?? '');
  const [active, setActive] = useState(doctor?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const phoneNorm = phone.trim() ? normalizePhone(phone) : null;
  const phoneBad = Boolean(phone.trim()) && !phoneNorm;
  const valid = fullName.trim() && !phoneBad;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setSaving(true);
    setErr(null);
    const body: DoctorInput = {
      fullName: fullName.trim(),
      phone: phoneNorm,
      specialty: specialty.trim() || null,
      licenseNo: licenseNo.trim() || null,
      active,
    };
    try {
      if (doctor) await doctorsApi.update(doctor.id, body);
      else await doctorsApi.create(body);
      toast.success(t('common.saved'));
      onSaved();
    } catch (ex) {
      setErr(errorText(t, ex));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={doctor ? t('doctors.editDoctor') : t('doctors.newDoctor')}
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
        <Field label={t('doctors.fullName')}>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            autoFocus
            required
          />
        </Field>
        <FormGrid>
          <Field label={t('doctors.specialty')}>
            <Input
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label={t('doctors.phone')} error={phoneBad ? t('errors.invalid_phone') : null}>
            <PhoneInput value={phone} onChange={setPhone} invalid={!!phoneBad} />
          </Field>
          <Field label={t('doctors.licenseNo')}>
            <Input
              value={licenseNo}
              onChange={(e) => setLicenseNo(e.target.value)}
              maxLength={100}
            />
          </Field>
        </FormGrid>
        <Checkbox label={t('common.active')} checked={active} onChange={setActive} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

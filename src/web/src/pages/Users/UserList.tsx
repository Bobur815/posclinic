import { Paged } from '../../components/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog, Plus, Pencil, RefreshCw, KeyRound, Search } from 'lucide-react';
import { normalizePhone } from '@shared/phone';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { useToast } from '@context/ToastContext';
import { usersApi, type StaffRole, type StaffUser } from '../../api/client';
import { useAuthStore } from '../../store/auth-store';
import { useAsync } from '../../hooks/useAsync';
import { useClinicTypes } from '../../hooks/useClinicTypes';
import { useDebounced } from '../../hooks/useDebounced';
import { errorText } from '../../lib/errors';
import { showPhone } from '../../lib/format';
import {
  ActiveBadge,
  Badge,
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
  Th,
  Tr,
} from '../../components/ui';

const ROLES: StaffRole[] = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE'];
import { MIN_PASSWORD } from '../../lib/validation';

export function UserList() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const { data, loading, error, reload } = useAsync(() => usersApi.list(), []);
  const types = useClinicTypes();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null);
  const [resetting, setResetting] = useState<StaffUser | null>(null);
  const q = useDebounced(search.trim().toLowerCase(), 150);

  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((u) => showInactive || u.active)
        .filter(
          (u) =>
            !q ||
            u.fullName.toLowerCase().includes(q) ||
            u.phone.includes(q.replace(/\D/g, '') || q),
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [data, q, showInactive],
  );

  return (
    <Page>
      <PageHeader
        icon={<UserCog />}
        title={t('staff.title')}
        subtitle={t('staff.subtitle')}
        actions={
          <>
            <Button onClick={reload} aria-label={t('common.refresh')}>
              <RefreshCw />
            </Button>
            <Button $variant="primary" onClick={() => setEditing('new')}>
              <Plus />
              {t('staff.newUser')}
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
              placeholder={t('staff.searchPlaceholder')}
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
          emptyText={t('staff.noUsers')}
        >
          <Paged rows={rows} resetKey={`${q}|${showInactive}`}>
            {(pageRows) => (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('staff.fullName')}</Th>
                    <Th>{t('staff.phone')}</Th>
                    <Th>{t('staff.email')}</Th>
                    <Th>{t('staff.role')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((u) => (
                    <Tr key={u.id} $dim={!u.active}>
                      <Td $title>
                        {u.fullName}
                        {u.id === me?.id && (
                          <>
                            {' '}
                            <Badge $tone="muted">{t('staff.you')}</Badge>
                          </>
                        )}
                      </Td>
                      <Td $nowrap data-label={t('staff.phone')}>
                        {showPhone(u.phone)}
                      </Td>
                      <Td $muted data-label={t('staff.email')}>
                        {u.email || '—'}
                      </Td>
                      <Td data-label={t('staff.role')}>
                        <Badge>
                          {types.staffType(u.staffTypeId) ?? t(`roles.${u.role}`, u.role)}
                        </Badge>
                      </Td>
                      <Td data-label={t('common.status')}>
                        <ActiveBadge active={u.active} />
                      </Td>
                      <Td $right $nowrap $actions>
                        <Button
                          $small
                          $variant="ghost"
                          onClick={() => setResetting(u)}
                          title={t('staff.resetPassword')}
                          aria-label={t('staff.resetPassword')}
                        >
                          <KeyRound />
                        </Button>
                        <Button
                          $small
                          $variant="ghost"
                          onClick={() => setEditing(u)}
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
        <UserForm
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </Page>
  );
}

function UserForm({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: StaffUser | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '+998 ');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<StaffRole>(user?.role ?? 'RECEPTIONIST');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const phoneNorm = normalizePhone(phone);
  const phoneTouched = phone.replace(/\D/g, '').length > 3;
  const emailBad = Boolean(email.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordBad = !user && password.length < MIN_PASSWORD;
  const valid = fullName.trim() && phoneNorm && !emailBad && !passwordBad;
  const roleOptions = role === 'SUPER_ADMIN' ? (['SUPER_ADMIN', ...ROLES] as StaffRole[]) : ROLES;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || !phoneNorm) return;
    setSaving(true);
    setErr(null);
    const base = { fullName: fullName.trim(), phone: phoneNorm, email: email.trim() || null };
    try {
      if (user) {
        // You can't demote or deactivate yourself; never send those fields for your own row.
        await usersApi.update(user.id, isSelf ? base : { ...base, role, active });
      } else {
        await usersApi.create({ ...base, role, active, password });
      }
      toast.success(t('common.saved'));
      onSaved();
    } catch (ex) {
      setErr(errorText(t, ex));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={user ? t('staff.editUser') : t('staff.newUser')}
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
        <Field label={t('staff.fullName')}>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            autoFocus
            required
          />
        </Field>
        <FormGrid>
          <Field
            label={t('staff.phone')}
            hint={t('staff.phoneHint')}
            error={phoneTouched && !phoneNorm ? t('errors.invalid_phone') : null}
          >
            <PhoneInput
              value={phone}
              onChange={setPhone}
              invalid={phoneTouched && !phoneNorm}
              required
            />
          </Field>
          <Field
            label={`${t('staff.email')} (${t('common.optional')})`}
            error={emailBad ? t('errors.invalid_email') : null}
          >
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('staff.role')} hint={isSelf ? t('staff.selfLocked') : undefined}>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              disabled={isSelf}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          {!user && (
            <Field
              label={t('staff.password')}
              error={
                password && passwordBad
                  ? t('errors.password_too_short', { min: MIN_PASSWORD })
                  : null
              }
              hint={t('staff.passwordHint', { min: MIN_PASSWORD })}
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          )}
        </FormGrid>
        <Checkbox
          label={t('common.active')}
          checked={active}
          onChange={setActive}
          disabled={isSelf}
        />
        {role !== 'CLINIC_ADMIN' && role !== 'SUPER_ADMIN' && (
          <small style={{ opacity: 0.7 }}>{t('staff.tillOnlyHint')}</small>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tooShort = password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = !tooShort && confirm === password;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await usersApi.resetPassword(user.id, password);
      toast.success(t('staff.passwordReset'));
      onClose();
    } catch (ex) {
      setErr(errorText(t, ex));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${t('staff.resetPassword')}: ${user.fullName}`}
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
        <Field
          label={t('settings.newPassword')}
          hint={t('staff.passwordHint', { min: MIN_PASSWORD })}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
        <Field
          label={t('settings.confirmPassword')}
          error={mismatch ? t('errors.password_mismatch') : null}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <small style={{ opacity: 0.7 }}>{t('staff.resetHint')}</small>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

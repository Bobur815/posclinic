import { KeyRound, Plus, Save, UserCog, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffDto, StaffInput } from '../../../shared/clinic';
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
  Row,
  Select,
  StatusBadge,
  Title,
} from '../Care/care-ui';

/**
 * Staff logins (clinic admins): receptionists, nurses / lab and admins sign in on any till with
 * their phone and password. A doctor's login is made on the Doctors page. The plan's staff limit
 * is enforced by main (LicenseBanner shows it).
 */

const ROLES: StaffInput['role'][] = ['RECEPTIONIST', 'NURSE', 'CLINIC_ADMIN'];
const EMPTY: StaffInput = { fullName: '', phone: '', role: 'RECEPTIONIST', password: '' };

export function StaffPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const me = useAuthStore((s) => s.user?.id);
  const [users, setUsers] = useState<StaffDto[] | null>(null);
  const [form, setForm] = useState<StaffInput | null>(null);
  const [resetFor, setResetFor] = useState<StaffDto | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const version = useDataVersion(['users', 'doctors']);
  const load = useCallback(() => {
    window.electronAPI.users
      .list()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
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
      setSaving(false);
    }
  };

  return (
    <Page>
      <Title>{t('staff.title')}</Title>

      <Card>
        <CardTitle>
          <span>
            <UserCog size={15} /> {t('staff.list')}
          </span>
          <Btn $variant="primary" onClick={() => setForm(EMPTY)}>
            <Plus size={14} />
            {t('staff.add')}
          </Btn>
        </CardTitle>
        {users === null ? (
          <Empty>{t('common.loading')}</Empty>
        ) : users.length === 0 ? (
          <Empty>{t('staff.none')}</Empty>
        ) : (
          users.map((u) => {
            const isDoctor = u.role === 'DOCTOR' || !!u.doctor;
            const self = u.id === me;
            return (
              <Row key={u.id}>
                <div style={{ flex: 1 }}>
                  <strong>{u.fullName}</strong>
                  <Muted>
                    {u.phone}
                    {self ? ` · ${t('staff.you')}` : ''}
                  </Muted>
                </div>
                <div style={{ minWidth: 170 }}>
                  {isDoctor || self || u.role === 'SUPER_ADMIN' ? (
                    <Muted>
                      {t(`staff.roles.${u.role}`)}
                      {isDoctor ? ` · ${t('staff.doctorsPage')}` : ''}
                    </Muted>
                  ) : (
                    <Select
                      value={u.role}
                      disabled={saving}
                      onChange={(e) =>
                        run(() =>
                          window.electronAPI.users.update(u.id, {
                            role: e.target.value as StaffInput['role'],
                          }),
                        )
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`staff.roles.${r}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                <Actions>
                  <StatusBadge $status={u.active ? 'DONE' : 'CANCELLED'}>
                    {u.active ? t('common.active') : t('common.inactive')}
                  </StatusBadge>
                  <Btn
                    title={t('staff.resetPassword')}
                    aria-label={t('staff.resetPassword')}
                    onClick={() => {
                      setNewPassword('');
                      setResetFor(u);
                    }}
                  >
                    <KeyRound size={14} />
                  </Btn>
                  {!self && (
                    <Btn
                      disabled={saving}
                      onClick={() =>
                        run(() => window.electronAPI.users.update(u.id, { active: !u.active }))
                      }
                    >
                      {u.active ? t('staff.deactivate') : t('staff.activate')}
                    </Btn>
                  )}
                </Actions>
              </Row>
            );
          })
        )}
      </Card>

      {form && (
        <Card>
          <CardTitle>
            {t('staff.add')}
            <Btn onClick={() => setForm(null)} aria-label={t('common.cancel')}>
              <X size={14} />
            </Btn>
          </CardTitle>
          <Grid $cols={2}>
            <Label>
              {t('staff.fullName')}
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Label>
            <Label>
              {t('auth.phone')}
              <Input
                type="tel"
                placeholder="+998 90 123 45 67"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Label>
            <Label>
              {t('staff.role')}
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as StaffInput['role'] })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`staff.roles.${r}`)}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              {t('auth.password')}
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Label>
          </Grid>
          <Muted style={{ marginTop: 6 }}>{t('staff.doctorHint')}</Muted>
          <Btn
            $variant="primary"
            style={{ marginTop: 10 }}
            disabled={
              saving || !form.fullName.trim() || !form.phone.trim() || form.password.length < 6
            }
            onClick={() =>
              run(() => window.electronAPI.users.create(form)).then((ok) => ok && setForm(null))
            }
          >
            <Save size={14} />
            {t('common.save')}
          </Btn>
        </Card>
      )}

      {resetFor && (
        <Card>
          <CardTitle>
            {t('staff.resetPassword')}: {resetFor.fullName}
            <Btn onClick={() => setResetFor(null)} aria-label={t('common.cancel')}>
              <X size={14} />
            </Btn>
          </CardTitle>
          <Label>
            {t('staff.newPassword')}
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Label>
          <Btn
            $variant="primary"
            style={{ marginTop: 10 }}
            disabled={saving || newPassword.length < 6}
            onClick={() =>
              run(() => window.electronAPI.users.resetPassword(resetFor.id, newPassword)).then(
                (ok) => ok && setResetFor(null),
              )
            }
          >
            <KeyRound size={14} />
            {t('staff.resetPassword')}
          </Btn>
        </Card>
      )}
    </Page>
  );
}

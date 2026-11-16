import { KeyRound, Plus, Save, UserCog, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffDto, StaffInput, StaffTypeDto } from '../../../shared/clinic';
import { PhoneInput } from '../../components/form/PhoneInput';
import { useToast } from '../../context/ToastContext';
import { useCustomTypes, useStaffTypeLabel, useTypeName } from '../../hooks/useCustomTypes';
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
 * Staff (clinic admins): receptionists, nurses / lab and admins sign in on any till with their
 * phone and password; the clinic's own staff types (Settings → Types) carry an access level, and
 * a type without access (cleaner, guard…) is on the list but never signs in. A doctor's login is
 * made on the Doctors page. The plan's staff limit is enforced by main (LicenseBanner shows it).
 */

const ROLES = ['RECEPTIONIST', 'NURSE', 'CLINIC_ADMIN'] as const;
type BuiltIn = (typeof ROLES)[number];

/** One select for both: `role:RECEPTIONIST` or `type:<staff type id>`. */
type Choice = string;
const choiceOf = (u: Pick<StaffDto, 'role' | 'staffTypeId'>): Choice =>
  u.staffTypeId ? `type:${u.staffTypeId}` : `role:${u.role}`;
function choiceInput(choice: Choice): Pick<StaffInput, 'role' | 'staffTypeId'> {
  return choice.startsWith('type:')
    ? { staffTypeId: choice.slice(5) }
    : { role: choice.slice(5) as BuiltIn, staffTypeId: null };
}
/** Whether a choice signs in (a type with access NONE does not). */
function choiceSignsIn(choice: Choice, types: StaffTypeDto[]): boolean {
  if (!choice.startsWith('type:')) return true;
  return types.find((x) => x.id === choice.slice(5))?.access !== 'NONE';
}

interface NewStaff {
  fullName: string;
  phone: string;
  choice: Choice;
  password: string;
}
const EMPTY: NewStaff = { fullName: '', phone: '', choice: 'role:RECEPTIONIST', password: '' };

export function StaffPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const me = useAuthStore((s) => s.user?.id);
  const { staffTypes } = useCustomTypes();
  const typeName = useTypeName();
  const labelOf = useStaffTypeLabel(staffTypes);
  const [users, setUsers] = useState<StaffDto[] | null>(null);
  const [form, setForm] = useState<NewStaff | null>(null);
  const [resetFor, setResetFor] = useState<StaffDto | null>(null);
  const [newPassword, setNewPassword] = useState('');
  /** A no-login person given a type that signs in: needs a password first. */
  const [promote, setPromote] = useState<{ user: StaffDto; choice: Choice } | null>(null);
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

  const activeTypes = staffTypes.filter((x) => x.active);
  const choices = (current?: Choice) => (
    <>
      <optgroup label={t('staff.builtInRoles')}>
        {ROLES.map((r) => (
          <option key={r} value={`role:${r}`}>
            {t(`staff.roles.${r}`)}
          </option>
        ))}
      </optgroup>
      {(activeTypes.length > 0 || current?.startsWith('type:')) && (
        <optgroup label={t('staff.clinicTypes')}>
          {staffTypes
            .filter((x) => x.active || current === `type:${x.id}`)
            .map((x) => (
              <option key={x.id} value={`type:${x.id}`}>
                {typeName(x)} · {t(`types.access.${x.access}`)}
              </option>
            ))}
        </optgroup>
      )}
    </>
  );

  const changeChoice = (u: StaffDto, choice: Choice) => {
    if (u.role === 'STAFF' && choiceSignsIn(choice, staffTypes)) {
      setNewPassword('');
      setPromote({ user: u, choice });
      return;
    }
    void run(() => window.electronAPI.users.update(u.id, choiceInput(choice)));
  };

  const formSignsIn = form ? choiceSignsIn(form.choice, staffTypes) : true;

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
            const isDoctor = u.role === 'DOCTOR';
            const alsoDoctor = !isDoctor && !!u.doctor;
            const self = u.id === me;
            const noLogin = u.role === 'STAFF';
            return (
              <Row key={u.id}>
                <div style={{ flex: 1 }}>
                  <strong>{u.fullName}</strong>
                  <Muted>
                    {u.phone}
                    {self ? ` · ${t('staff.you')}` : ''}
                    {alsoDoctor ? ` · ${t('staff.alsoDoctor')}` : ''}
                    {noLogin ? ` · ${t('staff.noLogin')}` : ''}
                  </Muted>
                </div>
                <div style={{ minWidth: 200 }}>
                  {isDoctor || self || u.role === 'SUPER_ADMIN' ? (
                    <Muted>
                      {labelOf(u)}
                      {isDoctor ? ` · ${t('staff.doctorsPage')}` : ''}
                    </Muted>
                  ) : (
                    <Select
                      value={choiceOf(u)}
                      disabled={saving}
                      onChange={(e) => changeChoice(u, e.target.value)}
                    >
                      {choices(choiceOf(u))}
                    </Select>
                  )}
                </div>
                <Actions>
                  <StatusBadge $status={u.active ? 'DONE' : 'CANCELLED'}>
                    {u.active ? t('common.active') : t('common.inactive')}
                  </StatusBadge>
                  {!noLogin && (
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
                  )}
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
              <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            </Label>
            <Label>
              {t('staff.role')}
              <Select
                value={form.choice}
                onChange={(e) => setForm({ ...form, choice: e.target.value })}
              >
                {choices()}
              </Select>
            </Label>
            {formSignsIn ? (
              <Label>
                {t('auth.password')}
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Label>
            ) : (
              <Muted style={{ alignSelf: 'end' }}>{t('staff.noLoginHint')}</Muted>
            )}
          </Grid>
          <Muted style={{ marginTop: 6 }}>{t('staff.doctorHint')}</Muted>
          <Btn
            $variant="primary"
            style={{ marginTop: 10 }}
            disabled={
              saving ||
              !form.fullName.trim() ||
              !form.phone.trim() ||
              (formSignsIn && form.password.length < 6)
            }
            onClick={() =>
              run(() =>
                window.electronAPI.users.create({
                  fullName: form.fullName,
                  phone: form.phone,
                  ...choiceInput(form.choice),
                  ...(formSignsIn ? { password: form.password } : {}),
                }),
              ).then((ok) => ok && setForm(null))
            }
          >
            <Save size={14} />
            {t('common.save')}
          </Btn>
        </Card>
      )}

      {(resetFor || promote) && (
        <Card>
          <CardTitle>
            {resetFor ? t('staff.resetPassword') : t('staff.givePassword')}:{' '}
            {(resetFor ?? promote?.user)?.fullName}
            <Btn
              onClick={() => {
                setResetFor(null);
                setPromote(null);
              }}
              aria-label={t('common.cancel')}
            >
              <X size={14} />
            </Btn>
          </CardTitle>
          {promote && <Muted>{t('staff.givePasswordHint')}</Muted>}
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
              (resetFor
                ? run(() => window.electronAPI.users.resetPassword(resetFor.id, newPassword))
                : promote
                  ? run(() =>
                      window.electronAPI.users.update(promote.user.id, {
                        ...choiceInput(promote.choice),
                        password: newPassword,
                      }),
                    )
                  : Promise.resolve(false)
              ).then((ok) => {
                if (ok) {
                  setResetFor(null);
                  setPromote(null);
                }
              })
            }
          >
            <KeyRound size={14} />
            {t('common.save')}
          </Btn>
        </Card>
      )}
    </Page>
  );
}

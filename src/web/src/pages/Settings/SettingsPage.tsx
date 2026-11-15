import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Moon, Sun } from 'lucide-react';
import { useTheme } from '@theme/ThemeProvider';
import { useToast } from '@context/ToastContext';
import { authApi } from '../../api/client';
import { useAuthStore } from '../../store/auth-store';
import { setLanguage, type Language } from '../../i18n';
import { errorText } from '../../lib/errors';
import { showPhone } from '../../lib/format';
import { Button, Card, CardTitle, ErrorBanner, Field, Grid, InfoList, Input, Page, PageHeader, Row } from '../../components/ui';
import { MIN_PASSWORD } from '../../lib/validation';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { mode, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);

  return (
    <Page>
      <PageHeader icon={<Settings />} title={t('settings.title')} />

      <Grid $min={320}>
        <Card>
          <CardTitle>{t('settings.profile')}</CardTitle>
          <InfoList
            items={[
              { label: t('staff.fullName'), value: user?.fullName },
              { label: t('staff.phone'), value: showPhone(user?.phone) },
              { label: t('staff.email'), value: user?.email || '—' },
              { label: t('staff.role'), value: user ? t(`roles.${user.role}`) : '—' },
            ]}
          />
        </Card>

        <Card>
          <CardTitle>{t('settings.appearance')}</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={t('settings.language')}>
              <Row>
                {(['uz', 'ru'] as Language[]).map((l) => (
                  <Button key={l} $variant={i18n.language === l ? 'primary' : 'secondary'} onClick={() => setLanguage(l)}>
                    {l === 'uz' ? "O'zbekcha" : 'Русский'}
                  </Button>
                ))}
              </Row>
            </Field>
            <Field label={t('settings.theme')}>
              <Row>
                <Button $variant={mode === 'light' ? 'primary' : 'secondary'} onClick={() => mode !== 'light' && toggleTheme()}>
                  <Sun />
                  {t('settings.lightTheme')}
                </Button>
                <Button $variant={mode === 'dark' ? 'primary' : 'secondary'} onClick={() => mode !== 'dark' && toggleTheme()}>
                  <Moon />
                  {t('settings.darkTheme')}
                </Button>
              </Row>
            </Field>
          </div>
        </Card>

        <ChangePasswordCard />
      </Grid>
    </Page>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current && next.length >= MIN_PASSWORD && confirm === next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await authApi.changePassword(current, next);
      toast.success(t('settings.passwordChanged'));
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (ex) {
      setErr(errorText(t, ex));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle>{t('settings.changePassword')}</CardTitle>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {err && <ErrorBanner>{err}</ErrorBanner>}
        <Field label={t('settings.currentPassword')}>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field
          label={t('settings.newPassword')}
          error={tooShort ? t('errors.password_too_short', { min: MIN_PASSWORD }) : null}
          hint={t('staff.passwordHint', { min: MIN_PASSWORD })}
        >
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('settings.confirmPassword')} error={mismatch ? t('errors.password_mismatch') : null}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" $variant="primary" disabled={!valid || saving}>
          {saving ? t('common.saving') : t('settings.changePassword')}
        </Button>
        <small style={{ opacity: 0.7 }}>{t('settings.passwordSyncHint')}</small>
      </form>
    </Card>
  );
}

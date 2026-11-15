import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Eye, EyeOff, Moon, Stethoscope, Sun } from 'lucide-react';
import { useTheme } from '@theme/ThemeProvider';
import { isSignedIn, useAuthStore } from '../../store/auth-store';
import { BRAND_NAME } from '../../branding/constants';
import { setLanguage, type Language } from '../../i18n';
import { Button, ErrorBanner, Field, Input } from '../../components/ui';

const Wrap = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: ${({ theme }) => theme.colors.background};
`;

const Box = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 400px;
  box-shadow: ${({ theme }) => theme.shadows.lg};

  @media (max-width: 480px) {
    padding: ${({ theme }) => theme.spacing.lg};
  }
`;

const Head = styled.div`
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 1.6rem;
  font-weight: 700;
`;

const Tagline = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin: 4px 0 0;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const PasswordWrap = styled.div`
  position: relative;
  input {
    padding-right: 42px;
  }
`;

const Eyeball = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  padding: 4px;
`;

const Hint = styled.p`
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Prefs = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useTheme();
  const signedIn = useAuthStore(isSignedIn);
  const { login, isLoading, error, clearError } = useAuthStore();

  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => clearError, [clearError]);

  if (signedIn) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await login(phone, password)) navigate('/', { replace: true });
  };

  return (
    <Wrap>
      <Box>
        <Head>
          <Logo>
            <Stethoscope size={28} />
            {BRAND_NAME}
          </Logo>
          <Tagline>{t('auth.tagline')}</Tagline>
        </Head>

        <Form onSubmit={submit} noValidate>
          {error && <ErrorBanner role="alert">{t(`errors.${error}`, { defaultValue: t('errors.generic') })}</ErrorBanner>}

          <Field label={t('auth.phone')}>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="username"
              placeholder="+998 90 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
              required
            />
          </Field>

          <Field label={t('auth.password')}>
            <PasswordWrap>
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Eyeball
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </Eyeball>
            </PasswordWrap>
          </Field>

          <Button type="submit" $variant="primary" disabled={isLoading || !password}>
            {isLoading ? t('common.loading') : t('auth.login')}
          </Button>

          <Hint>{t('auth.forgotHint')}</Hint>
        </Form>

        <Prefs>
          {(['uz', 'ru'] as Language[]).map((l) => (
            <Button key={l} type="button" $small $variant={i18n.language === l ? 'primary' : 'secondary'} onClick={() => setLanguage(l)}>
              {l === 'uz' ? "O'zbekcha" : 'Русский'}
            </Button>
          ))}
          <Button type="button" $small onClick={toggleTheme} aria-label={t('settings.theme')}>
            {mode === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </Prefs>
      </Box>
    </Wrap>
  );
}

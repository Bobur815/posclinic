import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Stethoscope, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';
import { useTheme } from '../../theme/ThemeProvider';

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
  padding: ${({ theme }) => theme.spacing.md};
`;

const LeftPanel = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl};
  background-color: ${({ theme }) => theme.colors.surface};
`;

const RightPanel = styled.div<{ $imageUrl?: string }>`
  flex: 1;
  position: relative;
  overflow: hidden;
  background: ${({ $imageUrl }) =>
    $imageUrl
      ? `url(${JSON.stringify($imageUrl)}) center / cover no-repeat`
      : "linear-gradient(135deg, #1976d2 0%, #dc004e 100%)"};
  display: flex;
  align-items: flex-end;

  @media (max-width: 768px) {
    display: none;
  }
`;

const RightOverlay = styled.div`
  width: 100%;
  padding: 32px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
`;

const RightTitle = styled.h2`
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
`;

const RightSubtitle = styled.p`
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
`;

const Card = styled.div`
  width: 100%;
  max-width: 400px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const LogoWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const IconCircle = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const AppName = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  letter-spacing: 1px;
`;

const AppSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
  display: block;
`;

const InputWrapper = styled.div`
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  padding-right: 40px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  transition: border-color 0.15s;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const TogglePasswordBtn = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const RememberRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  user-select: none;
`;

const SubmitButton = styled.button`
  padding: 12px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ErrorMsg = styled.div`
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.error}18;
  border: 1px solid ${({ theme }) => theme.colors.error}40;
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
`;

const BottomBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.lg};
  padding-top: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const IconBtn = styled.button`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`;

const LangBtns = styled.div`
  display: flex;
  gap: 6px;
`;

const LangBtn = styled.button<{ $active: boolean }>`
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary + '18' : 'none')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
`;

/** Only the phone is remembered; a password is never stored on the till. */
const ForgotHint = styled.p`
  margin: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SAVED_KEY = 'login_saved_phone';
const LEGACY_SAVED_KEY = 'login_saved_pos'; // v1 kept email + plaintext password here

function loadSavedPhone(): string {
  try {
    localStorage.removeItem(LEGACY_SAVED_KEY);
    return localStorage.getItem(SAVED_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { mode, toggleTheme } = useTheme();
  const [savedPhone] = useState(loadSavedPhone);

  const [phone, setPhone] = useState(savedPhone);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(!!savedPhone);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await window.electronAPI.auth.login(phone, password);
      if (result.success && result.user && result.token) {
        if (rememberMe) {
          localStorage.setItem(SAVED_KEY, result.user.phone);
        } else {
          localStorage.removeItem(SAVED_KEY);
        }

        login(
          {
            id: result.user.id,
            fullName: result.user.fullName,
            phone: result.user.phone,
            email: result.user.email,
            role: result.user.role as 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST',
            clinicId: result.user.clinicId,
          },
          result.token,
        );
        navigate('/');
      } else {
        const errKey = result.error ?? 'login_failed';
        setError(t(`auth.errors.${errKey}`, t('auth.errors.login_failed')));
      }
    } catch (err) {
      console.error(err);
      setError(t('auth.errors.login_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <Page>
      <Card>
        <LogoWrapper>
          <IconCircle>
            <Stethoscope size={32} />
          </IconCircle>
          <AppName>POSCLINIC</AppName>
          <AppSubtitle>Clinic Management System</AppSubtitle>
        </LogoWrapper>

        <Form onSubmit={handleSubmit}>
          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div>
            <Label>{t('auth.phone')}</Label>
            <InputWrapper>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="username"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('auth.phonePlaceholder')}
                required
                autoFocus={!savedPhone}
              />
            </InputWrapper>
          </div>

          <div>
            <Label>{t('auth.password')}</Label>
            <InputWrapper>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus={!!savedPhone}
              />
              <TogglePasswordBtn
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </TogglePasswordBtn>
            </InputWrapper>
          </div>
          <RememberRow>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            {t('auth.rememberMe')}
          </RememberRow>
          <ForgotHint>{t('auth.forgotHint')}</ForgotHint>

          <SubmitButton type="submit" disabled={isLoading}>
            {isLoading ? t('common.loading') : t('auth.login')}
          </SubmitButton>
        </Form>

        <BottomBar>
          <LangBtns>
            <LangBtn $active={i18n.language === 'uz'} onClick={() => changeLanguage('uz')}>
              UZ
            </LangBtn>
            <LangBtn $active={i18n.language === 'ru'} onClick={() => changeLanguage('ru')}>
              RU
            </LangBtn>
          </LangBtns>
          <IconBtn onClick={toggleTheme}>
            {mode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {mode === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
          </IconBtn>
        </BottomBar>
      </Card>
    </Page>
  );
}

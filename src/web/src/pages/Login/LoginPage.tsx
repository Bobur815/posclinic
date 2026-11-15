import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';
import { useTheme } from '@theme/ThemeProvider';
import { LogoMark, Wordmark } from '../../components/brand/Logo';
import { type Language, setLanguage } from '../../i18n';
import { isSignedIn, useAuthStore } from '../../store/auth-store';

/**
 * Clinic admin login. Ported from the Claude Design export "POSCLINIC — Login" (design tokens
 * kept verbatim as CSS variables, light + dark). Split layout on desktop, a card sheet under a
 * brand header on phones. Phone = "+998" chip + 9 digits shown as "90 123 45 67".
 */

const REMEMBER_KEY = 'posclinic-web-phone';

function readRemembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Digits only, without the 998 prefix, at most 9; shown as "90 123 45 67". */
function formatLocal(value: string): string {
  let d = value.replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

type LocalError = 'phone' | 'pwd' | null;

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useTheme();
  const signedIn = useAuthStore(isSignedIn);
  const { login, isLoading, error, clearError } = useAuthStore();
  const ids = useId();

  const [phone, setPhone] = useState(() => formatLocal(readRemembered()));
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(() => readRemembered() !== '');
  const [localError, setLocalError] = useState<LocalError>(null);

  useEffect(() => clearError, [clearError]);
  if (signedIn) return <Navigate to="/" replace />;

  const dark = mode === 'dark';
  const digits = phone.replace(/\D/g, '');

  const resetErrors = () => {
    setLocalError(null);
    if (error) clearError();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (digits.length !== 9) return setLocalError('phone');
    if (!password) return setLocalError('pwd');
    setLocalError(null);
    const ok = await login(`+998${digits}`, password);
    if (!ok) return;
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, digits);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* private mode: nothing to remember */
    }
    navigate('/', { replace: true });
  };

  // Which field(s) the message is about, and its text.
  const serverError = error && !localError;
  const phoneInvalid =
    localError === 'phone' || (serverError && ['invalid_credentials', 'invalid_phone'].includes(error));
  const pwdInvalid = localError === 'pwd' || (serverError && error === 'invalid_credentials');
  const errText =
    localError === 'phone'
      ? t('login.errPhone')
      : localError === 'pwd'
        ? t('login.errPwd')
        : error
          ? t(`errors.${error}`, { defaultValue: t('errors.generic') })
          : null;
  const errId = `${ids}-err`;

  return (
    <Root $dark={dark} lang={i18n.language}>
      <FormPanel>
        <Card>
          <Brand>
            <LogoMark size={48} />
            <Wordmark size={26} dark={dark} />
          </Brand>

          <Title>{t('login.title')}</Title>
          <Sub>{t('login.subtitle')}</Sub>

          <Form onSubmit={submit} noValidate>
            <Group>
              <Label htmlFor={`${ids}-phone`}>
                {t('auth.phone')}
                <SrOnly> (+998)</SrOnly>
              </Label>
              <FieldBox $invalid={!!phoneInvalid}>
                <IconPhone />
                <Chip aria-hidden="true">+998</Chip>
                <input
                  id={`${ids}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={12}
                  placeholder="90 123 45 67"
                  value={phone}
                  onChange={(e) => {
                    setPhone(formatLocal(e.target.value));
                    resetErrors();
                  }}
                  aria-invalid={!!phoneInvalid}
                  aria-describedby={phoneInvalid && errText ? errId : undefined}
                  autoFocus={!phone}
                />
              </FieldBox>
            </Group>

            <Group>
              <Label htmlFor={`${ids}-pwd`}>{t('auth.password')}</Label>
              <FieldBox $invalid={!!pwdInvalid} $hasBtn>
                <IconLock />
                <input
                  id={`${ids}-pwd`}
                  name="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('login.pwdPh')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    resetErrors();
                  }}
                  aria-invalid={!!pwdInvalid}
                  aria-describedby={pwdInvalid && errText ? errId : undefined}
                  autoFocus={!!phone}
                />
                <IconBtn
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPwd}
                  aria-controls={`${ids}-pwd`}
                >
                  {showPwd ? <IconEyeOff /> : <IconEye />}
                </IconBtn>
              </FieldBox>
            </Group>

            <Check>
              <input
                type="checkbox"
                name="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>{t('login.remember')}</span>
            </Check>

            {errText && (
              <Note id={errId} role="alert">
                <IconAlert />
                <span>{errText}</span>
              </Note>
            )}

            <SubmitBtn type="submit" disabled={isLoading} aria-busy={isLoading}>
              {isLoading ? (
                <>
                  <Spinner aria-hidden="true" />
                  <span>{t('login.loading')}</span>
                </>
              ) : (
                <span>{t('auth.login')}</span>
              )}
            </SubmitBtn>

            <Hint>
              <strong>{t('login.hint1')}</strong> {t('login.hint2')}
            </Hint>
          </Form>
        </Card>

        <Footer>
          <Seg role="group" aria-label={t('login.langGroup')}>
            {(['uz', 'ru'] as Language[]).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={i18n.language === l}
                onClick={() => setLanguage(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </Seg>
          <ThemeBtn
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? t('login.toLight') : t('login.toDark')}
          >
            {dark ? <IconSun /> : <IconMoon />}
          </ThemeBtn>
          <Copy>© POSCLINIC · posgro.uz</Copy>
        </Footer>
      </FormPanel>

      {/* Desktop: the microscope-field visual. Phones: a short brand header above the sheet. */}
      <Visual>
        <Grid aria-hidden="true" />
        <DesktopOnly>
          <Cell $hollow style={{ width: 260, height: 260, left: -90, top: -90, borderColor: 'rgba(255,255,255,.14)' }} />
          <Cell $hollow style={{ width: 340, height: 340, right: -120, bottom: 120, borderColor: 'rgba(255,255,255,.12)' }} />
          <Cell style={{ width: 46, height: 46, right: 70, top: 64 }} />
          <Field560 aria-hidden="true">
            <Ring style={{ inset: 0, background: 'radial-gradient(circle, rgba(255,255,255,.09), rgba(255,255,255,0) 70%)' }} />
            <Ring $dash style={{ inset: 64 }} />
            <Ring style={{ inset: 168, borderColor: 'rgba(255,255,255,.16)' }} />
            <CrossH />
            <CrossV />
            <Cell style={{ width: 72, height: 72, left: 112, top: 140 }} />
            <Cell style={{ width: 44, height: 44, left: 392, top: 118 }} />
            <Cell style={{ width: 92, height: 92, left: 386, top: 330 }} />
            <Cell style={{ width: 56, height: 56, left: 132, top: 380 }} />
            <Cell style={{ width: 28, height: 28, left: 300, top: 452 }} />
            <Cell style={{ width: 22, height: 22, left: 196, top: 250 }} />
            <Cell style={{ width: 18, height: 18, left: 352, top: 222 }} />
          </Field560>
          <BigMark>
            <LogoMark size={140} label="posclinic" />
          </BigMark>
          <Value>{t('login.value')}</Value>
        </DesktopOnly>
        <MobileOnly>
          <Ring aria-hidden="true" style={{ width: 240, height: 240, right: -70, top: -96 }} />
          <Ring $dash aria-hidden="true" style={{ width: 170, height: 170, right: -35, top: -61 }} />
          <Cell aria-hidden="true" style={{ width: 34, height: 34, left: 28, top: 22 }} />
          <Cell aria-hidden="true" style={{ width: 18, height: 18, left: 76, top: 92 }} />
          <Cell aria-hidden="true" style={{ width: 26, height: 26, right: 54, top: 88 }} />
          <MobileBrand>
            <MarkTile>
              <LogoMark size={56} />
            </MarkTile>
            <Wordmark size={24} onBrand />
          </MobileBrand>
        </MobileOnly>
      </Visual>
    </Root>
  );
}

// ── Icons (Lucide paths, as in the design) ──────────────────────────────────────────────────

const Svg = ({ children, size = 20 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="pc-ic">
    {children}
  </svg>
);
const IconPhone = () => (
  <Svg>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </Svg>
);
const IconLock = () => (
  <Svg>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Svg>
);
const IconEye = () => (
  <Svg>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const IconEyeOff = () => (
  <Svg>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </Svg>
);
const IconAlert = () => (
  <Svg>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Svg>
);
const IconMoon = () => (
  <Svg>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </Svg>
);
const IconSun = () => (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Svg>
);

// ── Styles (tokens verbatim from the design) ────────────────────────────────────────────────

const MOBILE = '@media (max-width: 899px)';
const DESKTOP = '@media (min-width: 900px)';

const light = css`
  --pc-bg: #f4fafb; --pc-surface: #ffffff; --pc-surface-2: #eef6f7;
  --pc-border: #d3e3e6; --pc-border-input: #7a959c;
  --pc-text: #0f2a30; --pc-text-muted: #4a6670;
  --pc-primary: #0e7490; --pc-focus: #0e7490; --pc-focus-ring: rgba(14, 116, 144, 0.22);
  --pc-chip-bg: #e6f3f5; --pc-chip-text: #0b5f76;
  --pc-danger-bg: #fef2f2; --pc-danger-border: #fca5a5; --pc-danger-text: #b91c1c;
  --pc-shadow-card: 0 1px 2px rgba(15, 42, 48, 0.04), 0 12px 32px -8px rgba(15, 42, 48, 0.1);
  --pc-shadow-sheet: 0 -10px 30px -14px rgba(15, 42, 48, 0.25);
`;
const dark = css`
  --pc-bg: #0b1416; --pc-surface: #102024; --pc-surface-2: #16292e;
  --pc-border: #1f3a40; --pc-border-input: #5e7e86;
  --pc-text: #e3f2f4; --pc-text-muted: #9db8be;
  --pc-primary: #0e7490; --pc-focus: #22d3ee; --pc-focus-ring: rgba(34, 211, 238, 0.28);
  --pc-chip-bg: #15343a; --pc-chip-text: #a5f3fc;
  --pc-danger-bg: #2a1215; --pc-danger-border: #7f1d1d; --pc-danger-text: #fca5a5;
  --pc-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.3), 0 16px 40px -12px rgba(0, 0, 0, 0.55);
  --pc-shadow-sheet: 0 -10px 30px -14px rgba(0, 0, 0, 0.6);
`;

const Root = styled.div<{ $dark: boolean }>`
  ${({ $dark }) => ($dark ? dark : light)}
  --pc-radius-sm: 8px; --pc-radius-md: 12px; --pc-radius-lg: 18px;
  --pc-control-h: 52px; --pc-btn-h: 48px; --pc-touch: 44px;
  --pc-gradient-brand: linear-gradient(150deg, #0891b2 0%, #0e7490 55%, #0b5f76 100%);
  --pc-gradient-btn: linear-gradient(135deg, #0e7490 0%, #0b5f76 100%);
  --pc-shadow-btn: 0 6px 16px -6px rgba(14, 116, 144, 0.55);
  --pc-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --pc-dur: 150ms;

  display: flex;
  min-height: 100vh;
  background: var(--pc-bg);
  color: var(--pc-text);
  font-family: 'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  transition: background var(--pc-dur) var(--pc-ease), color var(--pc-dur) var(--pc-ease);
  *, *::before, *::after { box-sizing: border-box; }

  .pc-ic {
    flex: none; fill: none; stroke: currentColor; stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round;
  }
  button:focus-visible, input[type='checkbox']:focus-visible {
    outline: 2px solid var(--pc-focus);
    outline-offset: 2px;
  }

  ${DESKTOP} { flex-direction: row; }
  ${MOBILE} { flex-direction: column-reverse; }
`;

const FormPanel = styled.main`
  display: flex;
  flex-direction: column;
  ${DESKTOP} {
    width: 45%;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 40px 48px;
  }
  ${MOBILE} {
    flex: 1;
    position: relative;
    z-index: 1;
    margin-top: -24px;
    background: var(--pc-surface);
    border-radius: 20px 20px 0 0;
    box-shadow: var(--pc-shadow-sheet);
    padding: 28px 20px 12px;
  }
`;

const Card = styled.div`
  ${DESKTOP} {
    width: 100%;
    max-width: 448px;
    background: var(--pc-surface);
    border: 1px solid var(--pc-border);
    border-radius: var(--pc-radius-lg);
    box-shadow: var(--pc-shadow-card);
    padding: 40px;
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
  ${MOBILE} { display: none; }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.02em;
  ${MOBILE} { font-size: 28px; }
`;

const Sub = styled.p`
  margin: 6px 0 0;
  color: var(--pc-text-muted);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 28px;
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: var(--pc-text);
`;

const SrOnly = styled.span`
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
`;

const FieldBox = styled.div<{ $invalid?: boolean; $hasBtn?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--pc-control-h);
  padding: 0 ${({ $hasBtn }) => ($hasBtn ? '4px' : '14px')} 0 14px;
  border: 1.5px solid var(--pc-border-input);
  border-radius: var(--pc-radius-md);
  background: var(--pc-surface);
  color: var(--pc-text-muted);
  transition: border-color var(--pc-dur) var(--pc-ease), box-shadow var(--pc-dur) var(--pc-ease);
  &:focus-within {
    border-color: var(--pc-focus);
    box-shadow: 0 0 0 3px var(--pc-focus-ring);
    color: var(--pc-focus);
  }
  ${({ $invalid }) =>
    $invalid &&
    css`
      border-color: var(--pc-danger-text);
      color: var(--pc-danger-text);
      &:focus-within { border-color: var(--pc-danger-text); box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.22); }
    `}
  input {
    flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0;
    background: transparent; font: inherit; font-size: 16px; font-weight: 500;
    color: var(--pc-text); letter-spacing: 0.01em;
  }
  input::placeholder { color: var(--pc-text-muted); font-weight: 400; opacity: 1; }
`;

const Chip = styled.span`
  flex: none;
  padding: 3px 8px;
  border-radius: var(--pc-radius-sm);
  background: var(--pc-chip-bg);
  color: var(--pc-chip-text);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
`;

const IconBtn = styled.button`
  width: var(--pc-touch); height: var(--pc-touch); flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: 0; border-radius: 10px; background: transparent;
  color: var(--pc-text-muted); cursor: pointer;
  transition: background var(--pc-dur), color var(--pc-dur);
  &:hover { background: var(--pc-surface-2); color: var(--pc-text); }
`;

const Check = styled.label`
  display: inline-flex; align-items: center; gap: 10px; min-height: var(--pc-touch);
  align-self: flex-start; cursor: pointer; user-select: none;
  input { width: 20px; height: 20px; margin: 0; accent-color: var(--pc-primary); cursor: pointer; }
`;

const Note = styled.div`
  display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px;
  border: 1px solid var(--pc-danger-border); border-radius: var(--pc-radius-md);
  background: var(--pc-danger-bg); color: var(--pc-danger-text);
  font-size: 14px; line-height: 1.45; font-weight: 600;
  .pc-ic { margin-top: 1px; }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;
const Spinner = styled.span`
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35); border-top-color: #ffffff;
  animation: ${spin} 0.8s linear infinite;
`;

const SubmitBtn = styled.button`
  width: 100%; height: var(--pc-btn-h);
  display: flex; align-items: center; justify-content: center; gap: 10px;
  border: 0; border-radius: var(--pc-radius-md); background: var(--pc-gradient-btn);
  color: #ffffff; font: inherit; font-size: 16px; font-weight: 700; letter-spacing: 0.01em;
  cursor: pointer; box-shadow: var(--pc-shadow-btn);
  transition: filter var(--pc-dur), transform var(--pc-dur);
  &:hover:not(:disabled) { filter: brightness(1.08); }
  &:active:not(:disabled) { transform: translateY(1px); }
  &:disabled { cursor: progress; }
  &:focus-visible { outline-offset: 3px; }
`;

const Hint = styled.p`
  margin: 0; text-align: center; font-size: 14px; line-height: 1.5; color: var(--pc-text-muted);
  strong { font-weight: 600; color: var(--pc-text); }
`;

const Footer = styled.footer`
  display: flex; align-items: center; gap: 12px;
  ${DESKTOP} { width: 100%; max-width: 448px; }
  ${MOBILE} { margin-top: auto; padding-top: 16px; }
`;

const Seg = styled.div`
  display: inline-flex; border: 1px solid var(--pc-border); border-radius: var(--pc-radius-md);
  background: var(--pc-surface); overflow: hidden;
  button {
    min-width: 52px; height: var(--pc-touch); padding: 0 12px; border: 0; background: transparent;
    color: var(--pc-text-muted); font: inherit; font-size: 14px; font-weight: 700;
    letter-spacing: 0.04em; cursor: pointer;
  }
  button[aria-pressed='true'] { background: var(--pc-primary); color: #ffffff; }
  button:focus-visible { outline-offset: -3px; }
`;

const ThemeBtn = styled(IconBtn)`
  border: 1px solid var(--pc-border);
  background: var(--pc-surface);
`;

const Copy = styled.span`
  margin-left: auto; font-size: 13px; font-weight: 500; color: var(--pc-text-muted);
`;

const Visual = styled.aside`
  position: relative; overflow: hidden; background: var(--pc-gradient-brand); color: #ffffff;
  ${DESKTOP} { flex: 1; margin: 16px 16px 16px 0; border-radius: 24px; min-height: 560px; }
  ${MOBILE} { height: 160px; flex: none; }
`;

const Grid = styled.div`
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
  background-size: 32px 32px;
`;

const DesktopOnly = styled.div`
  ${MOBILE} { display: none; }
`;
const MobileOnly = styled.div`
  ${DESKTOP} { display: none; }
`;

const Ring = styled.div<{ $dash?: boolean }>`
  position: absolute; border-radius: 50%;
  border: 1px ${({ $dash }) => ($dash ? 'dashed rgba(255,255,255,.2)' : 'solid rgba(255,255,255,.3)')};
`;

const Cell = styled.div<{ $hollow?: boolean }>`
  position: absolute; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.3);
  background: ${({ $hollow }) =>
    $hollow ? 'none' : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,.24), rgba(255,255,255,.04) 65%)'};
  &::after {
    content: '';
    display: ${({ $hollow }) => ($hollow ? 'none' : 'block')};
    position: absolute; left: 38%; top: 36%; width: 24%; height: 24%;
    border-radius: 50%; background: rgba(255, 255, 255, 0.3);
  }
`;

/* The design places the 560px field at 1440x900; centring keeps it right on any width. */
const FIELD_TOP = 'max(24px, calc(50% - 380px))';
const Field560 = styled.div`
  position: absolute; left: 50%; margin-left: -280px; top: ${FIELD_TOP}; width: 560px; height: 560px;
`;
const CrossH = styled.div`
  position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(255, 255, 255, 0.14);
`;
const CrossV = styled.div`
  position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: rgba(255, 255, 255, 0.14);
`;

const BigMark = styled.div`
  position: absolute; left: 50%; top: calc(${FIELD_TOP} + 210px); width: 140px; height: 140px;
  margin-left: -70px;
  border-radius: 31px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 24px 48px -16px rgba(4, 47, 60, 0.6);
`;

const Value = styled.p`
  position: absolute; left: 56px; right: 56px; bottom: 56px; margin: 0; max-width: 540px;
  font-size: 40px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; color: #ffffff;
`;

const MobileBrand = styled.div`
  position: absolute; left: 20px; right: 20px; top: 0; height: 136px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
`;

const MarkTile = styled.span`
  display: block; width: 56px; height: 56px; border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 10px 24px -10px rgba(4, 47, 60, 0.6);
`;

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { LogoMark } from '../../components/brand/Logo';
import { tillTokens } from '../../components/brand/till-tokens';
import {
  Bar,
  BrandWord,
  Cell,
  type Conn,
  Dot,
  Grid,
  IconBtn,
  IconLock,
  IconMoon,
  IconSun,
  MarkWrap,
  PrimaryBtn,
  Ring,
  Seg,
  Spinner,
  Svg,
  ThemeBtn,
  Title,
  Version,
} from '../../components/brand/till-ui';
import { useAuthStore } from '../../store/auth-store';
import { followLan, useLanStore } from '../../store/lan-store';
import { useLicenseStore } from '../../store/license-store';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Till login, ported from the Claude Design export "POSCLINIC — Login - desktop": a brand panel
 * (clinic, till role + connection, live clock) and a large, keyboard-first form. Phone is the
 * "+998" chip + 9 digits. "Remember me" keeps the phone; the password too only when the clinic
 * allows it (Settings → Clinic → save password on the login page), encrypted on this PC by main
 * (credential-store.ts), never in localStorage.
 */

const SAVED_KEY = 'login_saved_phone';
const LEGACY_SAVED_KEY = 'login_saved_pos'; // v1 kept email + plaintext password here
/** The main till locks a desk for this long after too many wrong passwords (auth-handlers). */
const LOCK_MS = 5 * 60 * 1000;

function loadSavedPhone(): string {
  try {
    localStorage.removeItem(LEGACY_SAVED_KEY);
    return localStorage.getItem(SAVED_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Digits without the 998 prefix, at most 9, shown as "90 123 45 67". */
function formatLocal(value: string): string {
  let d = value.replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { mode, toggleTheme } = useTheme();
  const ids = useId();
  const phoneRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  const [saved] = useState(() => formatLocal(loadSavedPhone()));
  const [phone, setPhone] = useState(saved);
  const [remembered, setRemembered] = useState(saved !== '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(saved !== '');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: string; field: 'phone' | 'pwd' | 'both' | null } | null>(null);
  const [lockEnd, setLockEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [version, setVersion] = useState('');
  /** Settings → Clinic: may the password be kept with "Remember me"? */
  const [savePassword, setSavePassword] = useState(false);

  // Prefill the saved password for the remembered phone, if the clinic allows it; otherwise make
  // sure none is kept on this PC (the setting may have been switched off since).
  useEffect(() => {
    let alive = true;
    window.electronAPI.clinic
      .getSettings()
      .then(async (s) => {
        if (!alive) return;
        setSavePassword(s.savePasswordOnLogin);
        if (!s.savePasswordOnLogin) {
          await window.electronAPI.credentials.clear();
          return;
        }
        const digits = saved.replace(/\D/g, '');
        if (digits.length !== 9) return;
        const pwd = await window.electronAPI.credentials.get(`+998${digits}`);
        if (alive && pwd) setPassword(pwd);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [saved]);
  const [mainOnline, setMainOnline] = useState(true);

  const license = useLicenseStore((s) => s.status);
  const refreshLicense = useLicenseStore((s) => s.refresh);
  const link = useLanStore((s) => s.link);

  useEffect(() => {
    followLan();
    void refreshLicense();
    void window.electronAPI.app.getVersion().then(setVersion);
    const off = window.electronAPI.license.onChanged(() => void refreshLicense());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      off();
      clearInterval(tick);
    };
  }, [refreshLicense]);

  // The main till's own connection (internet), refreshed every 30 s; a satellite shows its link.
  useEffect(() => {
    let alive = true;
    const check = () =>
      void window.electronAPI.app
        .isOnline()
        .then((on) => alive && setMainOnline(on))
        .catch(() => undefined);
    check();
    const iv = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const lockLeft = lockEnd ? Math.max(0, Math.ceil((lockEnd - now) / 1000)) : 0;
  const locked = lockLeft > 0;
  useEffect(() => {
    if (lockEnd && !locked) setLockEnd(null);
  }, [lockEnd, locked]);
  const lockClock = `${Math.floor(lockLeft / 60)}:${String(lockLeft % 60).padStart(2, '0')}`;

  const dark = mode === 'dark';
  const satellite = link?.role === 'satellite';
  const conn: Conn = satellite
    ? link?.state === 'online'
      ? 'online'
      : link?.state === 'connecting'
        ? 'connecting'
        : 'offline'
    : mainOnline
      ? 'online'
      : 'offline';
  const clinicName = license?.storeName ?? link?.clinicName ?? '';

  const strip: { tone: 'warn' | 'ro'; text: string } | null = !license
    ? null
    : license.mode === 'readonly'
      ? {
          tone: 'ro',
          text: t('license.banner.readonly', { reason: t(`license.reasons.${license.reason}`) }),
        }
      : license.reason === 'warning' || license.reason === 'grace'
        ? { tone: 'warn', text: t(`license.banner.${license.reason}`, { count: license.daysLeft ?? 0 }) }
        : null;

  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const days = t('login.days', { returnObjects: true }) as string[];
  const months = t('login.months', { returnObjects: true }) as string[];
  const dateText = t('login.date', { wd: days[d.getDay()], d: d.getDate(), m: months[d.getMonth()] });

  const clearErr = () => setError(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || locked) return;
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 9) return setError({ key: 'login.errPhone', field: 'phone' });
    if (!password) return setError({ key: 'login.errPwd', field: 'pwd' });
    setError(null);
    setLoading(true);
    try {
      const result = await window.electronAPI.auth.login(`+998${digits}`, password);
      if (result.success && result.user && result.token) {
        try {
          if (remember) localStorage.setItem(SAVED_KEY, result.user.phone);
          else localStorage.removeItem(SAVED_KEY);
        } catch {
          /* nothing to remember */
        }
        // The password only with "Remember me" AND the clinic's permission; else none is kept.
        if (remember && savePassword) {
          void window.electronAPI.credentials.save(result.user.phone, password).catch(() => false);
        } else {
          void window.electronAPI.credentials.clear().catch(() => undefined);
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
        return;
      }
      const code = result.error ?? 'login_failed';
      if (code === 'too_many_attempts') {
        setLockEnd(Date.now() + LOCK_MS);
        setPassword('');
        return;
      }
      setError({
        key: `auth.errors.${code}`,
        field: code === 'invalid_credentials' ? 'both' : code === 'invalid_phone' ? 'phone' : null,
      });
    } catch {
      setError({ key: 'auth.errors.login_failed', field: null });
    } finally {
      setLoading(false);
    }
  };

  const otherStaff = () => {
    setPhone('');
    setPassword('');
    setRemembered(false);
    clearErr();
    setTimeout(() => phoneRef.current?.focus(), 0);
  };

  const phoneInvalid = !locked && (error?.field === 'phone' || error?.field === 'both');
  const pwdInvalid = !locked && (error?.field === 'pwd' || error?.field === 'both');
  const errId = `${ids}-err`;
  const errDesc = error || locked ? errId : undefined;

  return (
    <Root $dark={dark} lang={i18n.language}>
      {strip && (
        <Strip $tone={strip.tone} role="status">
          {strip.tone === 'warn' ? <IconWarn /> : <IconBan />}
          <span>{strip.text}</span>
        </Strip>
      )}
      <Body>
        <Visual aria-label={clinicName || 'posclinic'}>
          <Grid aria-hidden="true" />
          <Ring aria-hidden="true" style={{ width: 620, height: 620, right: -230, bottom: -250, background: 'radial-gradient(circle, rgba(255,255,255,.08), rgba(255,255,255,0) 70%)' }} />
          <Ring $dash aria-hidden="true" style={{ width: 460, height: 460, right: -150, bottom: -170 }} />
          <Ring aria-hidden="true" style={{ width: 260, height: 260, right: -50, bottom: -70, borderColor: 'rgba(255,255,255,.16)' }} />
          <Cell aria-hidden="true" style={{ width: 64, height: 64, right: 210, bottom: 250 }} />
          <Cell aria-hidden="true" style={{ width: 34, height: 34, right: 120, bottom: 330 }} />
          <Cell aria-hidden="true" style={{ width: 22, height: 22, right: 300, bottom: 150 }} />
          <Cell aria-hidden="true" style={{ width: 46, height: 46, right: 64, top: 56 }} />

          <BrandRow>
            <MarkWrap>
              <LogoMark size={56} />
            </MarkWrap>
            <BrandWord>posclinic</BrandWord>
          </BrandRow>

          <Mid>
            {clinicName && <Name>{clinicName}</Name>}
            <Badge>
              <Dot $conn={conn} aria-hidden="true" />
              <span>{satellite ? t('login.roleSat') : t('login.roleMain')}</span>
              <span aria-hidden="true" style={{ opacity: 0.6 }}>
                ·
              </span>
              <span style={{ fontWeight: 600 }}>{t(`login.${conn}`)}</span>
            </Badge>
          </Mid>

          <div style={{ position: 'relative' }}>
            <Clock>
              <time dateTime={`${d.toISOString().slice(0, 10)}T${hh}:${mm}`}>
                {hh}:{mm}
              </time>
            </Clock>
            <DateLine>{dateText}</DateLine>
          </div>
        </Visual>

        <FormSide>
          <FormMain>
            <FormBox>
              <Title>{t('login.title')}</Title>
              <Sub>{t('login.subtitle')}</Sub>
              <Form onSubmit={submit} noValidate>
                <Group>
                  <LabelRow>
                    <Label htmlFor={`${ids}-phone`}>
                      {t('auth.phone')}
                      <SrOnly> (+998)</SrOnly>
                    </Label>
                    {remembered && phone && (
                      <LinkBtn type="button" onClick={otherStaff} disabled={loading || locked}>
                        {t('login.other')}
                      </LinkBtn>
                    )}
                  </LabelRow>
                  <FieldBox $invalid={phoneInvalid} $disabled={locked}>
                    <IconPhone />
                    <Chip aria-hidden="true">+998</Chip>
                    <input
                      ref={phoneRef}
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
                        setRemembered(false);
                        clearErr();
                      }}
                      disabled={locked}
                      aria-invalid={phoneInvalid}
                      aria-describedby={errDesc}
                      autoFocus={!phone}
                    />
                  </FieldBox>
                </Group>

                <Group>
                  <LabelRow>
                    <Label htmlFor={`${ids}-pwd`}>{t('auth.password')}</Label>
                  </LabelRow>
                  <FieldBox $invalid={pwdInvalid} $disabled={locked} $hasBtn>
                    <IconLock />
                    <input
                      ref={pwdRef}
                      id={`${ids}-pwd`}
                      name="password"
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder={t('login.pwdPh')}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearErr();
                      }}
                      disabled={locked}
                      aria-invalid={pwdInvalid}
                      aria-describedby={errDesc}
                      autoFocus={!!phone}
                    />
                    <IconBtn
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? t('auth.hidePassword') : t('auth.showPassword')}
                      aria-pressed={showPwd}
                      aria-controls={`${ids}-pwd`}
                      disabled={locked}
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
                    disabled={locked}
                    aria-describedby={`${ids}-rem`}
                  />
                  <span>
                    {t('auth.rememberMe')}{' '}
                    <CheckNote id={`${ids}-rem`}>
                      · {savePassword ? t('login.rememberNoteWithPassword') : t('login.rememberNote')}
                    </CheckNote>
                  </span>
                </Check>

                {error && !locked && (
                  <Note id={errId} role="alert">
                    <IconAlert />
                    <span>{t(error.key)}</span>
                  </Note>
                )}
                {locked && (
                  <Note id={errId} role="alert" style={{ alignItems: 'center' }}>
                    <IconLock />
                    <span>{t('auth.errors.too_many_attempts')}</span>
                    <Countdown aria-hidden="true">{lockClock}</Countdown>
                  </Note>
                )}

                <PrimaryBtn type="submit" disabled={loading || locked} aria-busy={loading} $locked={locked}>
                  {loading ? (
                    <>
                      <Spinner aria-hidden="true" />
                      <span>{t('login.loading')}</span>
                    </>
                  ) : locked ? (
                    <>
                      <IconLock />
                      <span>
                        {t('login.lockedBtn')} {lockClock}
                      </span>
                    </>
                  ) : (
                    <span>{t('auth.login')}</span>
                  )}
                </PrimaryBtn>

                <Hint>
                  <strong>{t('login.hint1')}</strong> {t('login.hint2')}
                </Hint>
              </Form>
            </FormBox>
          </FormMain>

          <Bar>
            <Seg role="group" aria-label={t('login.langGroup')}>
              {(['uz', 'ru'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  aria-pressed={i18n.language === l}
                  onClick={() => {
                    void i18n.changeLanguage(l);
                    try {
                      localStorage.setItem('language', l);
                    } catch {
                      /* not remembered */
                    }
                  }}
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
            <Version>{version ? `v${version}` : ''}</Version>
          </Bar>
        </FormSide>
      </Body>
    </Root>
  );
}

// ── Icons (Lucide paths, as in the design) ──────────────────────────────────────────────────

const IconPhone = () => (
  <Svg>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
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
const IconWarn = () => (
  <Svg size={20}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);
const IconBan = () => (
  <Svg size={20}>
    <circle cx="12" cy="12" r="10" />
    <path d="M4.93 4.93l14.14 14.14" />
  </Svg>
);

// ── Styles (tokens: components/brand/till-tokens.ts) ────────────────────────────────────────

const Root = styled.div<{ $dark: boolean }>`
  ${({ $dark }) => tillTokens($dark)}
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  height: 100vh;
  background: var(--pc-surface);
  color: var(--pc-text);
  font-size: var(--tl-fs-body);
  line-height: 1.5;
`;

const Strip = styled.div<{ $tone: 'warn' | 'ro' }>`
  flex: none; display: flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 44px; padding: 10px 24px; font-size: 15px; font-weight: 700; line-height: 1.3;
  background: ${({ $tone }) => ($tone === 'warn' ? 'var(--pc-strip-warn-bg)' : 'var(--pc-strip-ro-bg)')};
  color: ${({ $tone }) => ($tone === 'warn' ? 'var(--pc-strip-warn-text)' : 'var(--pc-strip-ro-text)')};
`;

const Body = styled.div`
  flex: 1; min-height: 0; display: flex;
`;

const Visual = styled.section`
  width: 55%; flex: none; position: relative; overflow: hidden;
  background: var(--pc-gradient-brand); color: #ffffff;
  display: flex; flex-direction: column; justify-content: space-between;
  padding: var(--tl-pad);
`;

const BrandRow = styled.div`
  position: relative; display: flex; align-items: center; gap: 14px;
`;

const Mid = styled.div`
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 20px;
`;
const Name = styled.h2`
  margin: 0; max-width: 620px; font-size: var(--tl-fs-name); line-height: 1.08;
  font-weight: 800; letter-spacing: -0.025em;
`;
const Badge = styled.div`
  display: inline-flex; align-items: center; gap: 10px; min-height: 40px;
  padding: 6px 16px 6px 14px; border-radius: var(--pc-radius-pill);
  background: rgba(4, 47, 60, 0.38); border: 1px solid rgba(255, 255, 255, 0.28);
  font-size: 15px; font-weight: 700; color: #ffffff;
`;
const Clock = styled.p`
  margin: 0; font-size: var(--tl-fs-clock); line-height: 1; font-weight: 700;
  letter-spacing: -0.03em; font-variant-numeric: tabular-nums;
`;
const DateLine = styled.p`
  margin: 10px 0 0; font-size: 20px; font-weight: 600;
`;

const FormSide = styled.main`
  flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--pc-surface);
`;
const FormMain = styled.div`
  flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
  padding: 20px 48px; overflow-y: auto;
`;
const FormBox = styled.div`
  width: 100%; max-width: var(--tl-form-w);
`;
const Sub = styled.p`
  margin: 6px 0 0; font-size: var(--tl-fs-body); color: var(--pc-text-muted);
`;
const Form = styled.form`
  display: flex; flex-direction: column; gap: 14px; margin-top: 26px;
`;
const Group = styled.div`
  display: flex; flex-direction: column; gap: 8px;
`;
const LabelRow = styled.div`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 24px;
`;
const Label = styled.label`
  font-size: var(--tl-fs-label); font-weight: 700; color: var(--pc-text);
`;
const SrOnly = styled.span`
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
`;
const LinkBtn = styled.button`
  min-height: 44px; margin: -10px -6px; padding: 0 6px; border: 0; border-radius: 8px;
  background: none; color: var(--pc-link); font: inherit; font-size: var(--tl-fs-label);
  font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
  &:disabled { cursor: not-allowed; opacity: 0.6; }
`;

const FieldBox = styled.div<{ $invalid?: boolean; $disabled?: boolean; $hasBtn?: boolean }>`
  display: flex; align-items: center; gap: 10px; height: var(--pc-control-h);
  padding: 0 ${({ $hasBtn }) => ($hasBtn ? '4px' : '16px')} 0 16px;
  border: 1.5px solid var(--pc-border-input); border-radius: var(--pc-radius-md);
  background: var(--pc-surface); color: var(--pc-text-muted);
  &:focus-within {
    border: 2px solid var(--pc-focus);
    padding-left: 15.5px;
    ${({ $hasBtn }) => $hasBtn && 'padding-right: 3.5px;'}
    box-shadow: 0 0 0 4px var(--pc-focus-ring);
    color: var(--pc-focus);
  }
  ${({ $invalid }) =>
    $invalid &&
    css`
      border-color: var(--pc-danger-text);
      color: var(--pc-danger-text);
      &:focus-within { border-color: var(--pc-danger-text); color: var(--pc-danger-text); }
    `}
  ${({ $disabled }) =>
    $disabled &&
    css`
      background: var(--pc-disabled-bg);
      border-style: dashed;
    `}
  input {
    flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent;
    font: inherit; font-size: var(--tl-fs-input); font-weight: 600; color: var(--pc-text);
    letter-spacing: 0.01em;
  }
  input::placeholder { color: var(--pc-text-muted); font-weight: 400; opacity: 1; }
  input:disabled { cursor: not-allowed; color: var(--pc-text-muted); }
`;
const Chip = styled.span`
  flex: none; padding: 4px 9px; border-radius: var(--pc-radius-sm);
  background: var(--pc-chip-bg); color: var(--pc-chip-text); font-size: 15px; font-weight: 700;
`;
const Check = styled.label`
  display: inline-flex; align-items: center; gap: 12px; min-height: var(--pc-touch);
  align-self: flex-start; cursor: pointer; font-size: var(--tl-fs-body); font-weight: 600;
  user-select: none;
  input { width: 22px; height: 22px; margin: 0; accent-color: var(--pc-primary); cursor: pointer; }
`;
const CheckNote = styled.span`
  font-weight: 500; color: var(--pc-text-muted); font-size: var(--tl-fs-small);
`;
const Note = styled.div`
  display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px;
  border: 1px solid var(--pc-danger-border); border-radius: var(--pc-radius-md);
  background: var(--pc-danger-bg); color: var(--pc-danger-text);
  font-size: 15px; line-height: 1.4; font-weight: 600;
  .tl-ic { margin-top: -1px; }
`;
const Countdown = styled.span`
  margin-left: auto; font-family: var(--pc-mono); font-size: 22px; font-weight: 600;
  font-variant-numeric: tabular-nums; line-height: 1.1;
`;
const Hint = styled.p`
  margin: 0; text-align: center; font-size: var(--tl-fs-small); line-height: 1.5;
  color: var(--pc-text-muted);
  strong { font-weight: 700; color: var(--pc-text); }
`;


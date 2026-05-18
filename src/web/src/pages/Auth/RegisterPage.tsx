import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import {
  Stethoscope, Mail, KeyRound, Lock, Building2,
  CheckCircle, Copy, Eye, EyeOff, ArrowLeft, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';
import { BRAND_NAME } from '../../branding/constants';

// ─── Shared layout ────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
  padding: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 460px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const CardHeader = styled.div`
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const StepTitle = styled.h2`
  font-size: 1.1rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 4px;
`;

const StepSubtitle = styled.p`
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

// ─── Step indicator ───────────────────────────────────────────────────────────

const StepBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const StepDot = styled.div<{ $active: boolean; $done: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
  transition: all 0.2s;
  background: ${({ $active, $done, theme }) =>
    $done ? theme.colors.primary : $active ? theme.colors.primary : theme.colors.border};
  color: ${({ $active, $done, theme }) =>
    $done || $active ? '#fff' : theme.colors.textSecondary};
`;

const StepLine = styled.div<{ $done: boolean }>`
  flex: 1;
  height: 2px;
  max-width: 48px;
  background: ${({ $done, theme }) => ($done ? theme.colors.primary : theme.colors.border)};
  transition: background 0.3s;
`;

// ─── Form elements ────────────────────────────────────────────────────────────

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.label`
  font-size: 0.85rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const InputWrapper = styled.div`
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9rem;
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary}30;
  }
`;

const PasswordInput = styled(Input)`
  padding-right: 44px;
`;

const EyeBtn = styled.button`
  position: absolute;
  right: ${({ theme }) => theme.spacing.sm};
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  padding: 4px;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PrimaryBtn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: ${({ theme }) => theme.spacing.xs};
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

const GhostBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.85rem;
  padding: 0;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const ErrorMsg = styled.p`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.85rem;
  background: ${({ theme }) => theme.colors.error}15;
  border-left: 3px solid ${({ theme }) => theme.colors.error};
  padding: 8px 12px;
  border-radius: 0 ${({ theme }) => theme.borderRadius} ${({ theme }) => theme.borderRadius} 0;
  margin: 0;
`;

const LoginLink = styled.p`
  text-align: center;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.md};
  a { color: ${({ theme }) => theme.colors.primary}; text-decoration: none; &:hover { text-decoration: underline; } }
`;

const SectionLabel = styled.p`
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

// ─── OTP input ────────────────────────────────────────────────────────────────

const OtpRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: center;
`;

const OtpBox = styled.input`
  width: 48px;
  height: 56px;
  text-align: center;
  font-size: 1.4rem;
  font-weight: 700;
  border: 2px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary}30;
  }
`;

const EmailHint = styled.p`
  text-align: center;
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  span { font-weight: 600; color: ${({ theme }) => theme.colors.text}; }
`;

const ResendRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
`;

const CountdownText = styled.span`
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// ─── Success screen ───────────────────────────────────────────────────────────

const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const SuccessIcon = styled.div`
  color: ${({ theme }) => theme.colors.primary};
  display: flex;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  animation: ${pulse} 0.6s ease;
`;

const SuccessBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  text-align: center;
`;

const CodeBox = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.background};
  border: 2px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
`;

const Code = styled.span`
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: ${({ theme }) => theme.colors.primary};
  font-family: monospace;
`;

const CopyBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px;
  display: flex;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const WarningNote = styled.p`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.primary}12;
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: 0 ${({ theme }) => theme.borderRadius} ${({ theme }) => theme.borderRadius} 0;
  text-align: left;
  margin: 0;
  line-height: 1.5;
`;

// ─── Step indicator component ─────────────────────────────────────────────────

const STEPS = ['Email', 'OTP', 'Parol', 'Klinika'];

function StepIndicator({ current }: { current: number }) {
  return (
    <StepBar>
      {STEPS.map((_, i) => (
        <>
          <StepDot key={`dot-${i}`} $active={i === current} $done={i < current}>
            {i < current ? '✓' : i + 1}
          </StepDot>
          {i < STEPS.length - 1 && <StepLine key={`line-${i}`} $done={i < current} />}
        </>
      ))}
    </StepBar>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Step = 'email' | 'otp' | 'password' | 'clinic' | 'done';

export function RegisterPage() {
  const navigate = useNavigate();
  const { requestOtp, verifyOtp, setPassword: doSetPassword, createClinic, isLoading, error, clearError } = useAuthStore();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [registrationToken, setRegistrationToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [clinicCode, setClinicCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [clinic, setClinic] = useState({
    organizationName: '',
    organizationNameUz: '',
    organizationNameRu: '',
    contactPhone: '',
    address: '',
    city: '',
    region: '',
  });

  // OTP resend countdown
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const stepIndex: Record<Step, number> = { email: 0, otp: 1, password: 2, clinic: 3, done: 4 };

  function startCountdown(seconds = 120) {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // ── Step 1: request OTP ────────────────────────────────────────────────────
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok = await requestOtp(email);
    if (ok) { setStep('otp'); startCountdown(); }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    clearError();
    const ok = await requestOtp(email);
    if (ok) startCountdown();
  };

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const code = otp.join('');
    if (code.length < 6) return;
    const result = await verifyOtp(email, code);
    if (result.registrationToken) {
      setRegistrationToken(result.registrationToken);
      setStep('password');
    }
  };

  // ── Step 3: set password ───────────────────────────────────────────────────
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (password.length < 8) return;
    const token = await doSetPassword(registrationToken, password, firstName, lastName);
    if (token) { setSetupToken(token); setStep('clinic'); }
  };

  // ── Step 4: create clinic ──────────────────────────────────────────────────
  const handleCreateClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const result = await createClinic(setupToken, {
      organizationName: clinic.organizationName,
      organizationNameUz: clinic.organizationNameUz || undefined,
      organizationNameRu: clinic.organizationNameRu || undefined,
      contactPhone: clinic.contactPhone || undefined,
      address: clinic.address || undefined,
      city: clinic.city || undefined,
      region: clinic.region || undefined,
    });
    if (result.success && result.clinicCode) {
      setClinicCode(result.clinicCode);
      setStep('done');
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(clinicCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ─────────────────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <Page>
        <Card>
          <CardHeader>
            <Logo><Stethoscope size={26} />{BRAND_NAME}</Logo>
          </CardHeader>
          <SuccessBox>
            <SuccessIcon><CheckCircle size={56} /></SuccessIcon>
            <div>
              <StepTitle>Muvaffaqiyatli ro'yxatdan o'tdingiz!</StepTitle>
              <StepSubtitle style={{ marginTop: 4 }}>Klinikangiz tizimda yaratildi</StepSubtitle>
            </div>
            <div>
              <p style={{ margin: '0 0 8px', fontWeight: 500, fontSize: '0.9rem' }}>Klinika kodingiz:</p>
              <CodeBox>
                <Code>{clinicCode}</Code>
                <CopyBtn onClick={copyCode} title="Nusxa olish">
                  <Copy size={18} />
                </CopyBtn>
              </CodeBox>
              {copied && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'green', textAlign: 'center' }}>Nusxa olindi!</p>}
            </div>
            <WarningNote>
              Bu kodni saqlang — Electron (desktop) ilovani sozlashda kerak bo'ladi. Kod qayta ko'rsatilmaydi.
            </WarningNote>
            <PrimaryBtn type="button" onClick={() => navigate('/')} style={{ width: '100%' }}>
              Boshqaruv paneliga o'tish
            </PrimaryBtn>
          </SuccessBox>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        <CardHeader>
          <Logo><Stethoscope size={24} />{BRAND_NAME}</Logo>
        </CardHeader>

        <StepIndicator current={stepIndex[step]} />

        {/* ── Step 1: Email ── */}
        {step === 'email' && (
          <>
            <CardHeader style={{ marginBottom: 0, marginTop: -16 }}>
              <StepTitle><Mail size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Email manzilni kiriting</StepTitle>
              <StepSubtitle>Tasdiqlash kodi ushbu emailga yuboriladi</StepSubtitle>
            </CardHeader>
            <Form onSubmit={handleRequestOtp} style={{ marginTop: 20 }}>
              <Field>
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="owner@clinic.uz"
                  value={email}
                  onChange={(e) => { clearError(); setEmail(e.target.value); }}
                  required
                  autoFocus
                />
              </Field>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn type="submit" disabled={isLoading}>
                {isLoading ? 'Yuborilmoqda...' : 'Tasdiqlash kodi yuborish →'}
              </PrimaryBtn>
            </Form>
            <LoginLink>Hisobingiz bormi? <Link to="/login">Kirish</Link></LoginLink>
          </>
        )}

        {/* ── Step 2: OTP ── */}
        {step === 'otp' && (
          <>
            <CardHeader style={{ marginBottom: 0, marginTop: -16 }}>
              <StepTitle><KeyRound size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Tasdiqlash kodini kiriting</StepTitle>
            </CardHeader>
            <Form onSubmit={handleVerifyOtp} style={{ marginTop: 20 }}>
              <EmailHint>Kod <span>{email}</span> manziliga yuborildi</EmailHint>
              <OtpRow onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <OtpBox
                    key={i}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    autoFocus={i === 0}
                  />
                ))}
              </OtpRow>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn type="submit" disabled={isLoading || otp.join('').length < 6}>
                {isLoading ? 'Tekshirilmoqda...' : 'Tasdiqlash →'}
              </PrimaryBtn>
              <ResendRow>
                {countdown > 0 ? (
                  <CountdownText>Qayta yuborish: {fmtCountdown(countdown)}</CountdownText>
                ) : (
                  <GhostBtn type="button" onClick={handleResend} disabled={isLoading}>
                    <RefreshCw size={14} /> Kodni qayta yuborish
                  </GhostBtn>
                )}
              </ResendRow>
              <GhostBtn type="button" onClick={() => { setStep('email'); clearError(); }}>
                <ArrowLeft size={14} /> Emailni o'zgartirish
              </GhostBtn>
            </Form>
          </>
        )}

        {/* ── Step 3: Password + Name ── */}
        {step === 'password' && (
          <>
            <CardHeader style={{ marginBottom: 0, marginTop: -16 }}>
              <StepTitle><Lock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Parol va ismingizni kiriting</StepTitle>
              <StepSubtitle>Hisobingiz ma'lumotlari</StepSubtitle>
            </CardHeader>
            <Form onSubmit={handleSetPassword} style={{ marginTop: 20 }}>
              <Row>
                <Field>
                  <Label>Ism *</Label>
                  <Input
                    type="text"
                    placeholder="Aziza"
                    value={firstName}
                    onChange={(e) => { clearError(); setFirstName(e.target.value); }}
                    required
                    autoFocus
                  />
                </Field>
                <Field>
                  <Label>Familiya *</Label>
                  <Input
                    type="text"
                    placeholder="Karimova"
                    value={lastName}
                    onChange={(e) => { clearError(); setLastName(e.target.value); }}
                    required
                  />
                </Field>
              </Row>
              <Field>
                <Label>Parol * (kamida 8 belgi)</Label>
                <InputWrapper>
                  <PasswordInput
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Kuchli parol kiriting"
                    value={password}
                    onChange={(e) => { clearError(); setPassword(e.target.value); }}
                    required
                    minLength={8}
                  />
                  <EyeBtn type="button" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </EyeBtn>
                </InputWrapper>
              </Field>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn type="submit" disabled={isLoading || password.length < 8}>
                {isLoading ? 'Saqlanmoqda...' : 'Davom etish →'}
              </PrimaryBtn>
            </Form>
          </>
        )}

        {/* ── Step 4: Clinic info ── */}
        {step === 'clinic' && (
          <>
            <CardHeader style={{ marginBottom: 0, marginTop: -16 }}>
              <StepTitle><Building2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Klinika ma'lumotlari</StepTitle>
              <StepSubtitle>Tashkilotingiz haqida ma'lumot kiriting</StepSubtitle>
            </CardHeader>
            <Form onSubmit={handleCreateClinic} style={{ marginTop: 20 }}>
              <SectionLabel>Klinika nomi</SectionLabel>
              <Field>
                <Label>Asosiy nom *</Label>
                <Input
                  type="text"
                  placeholder="Najot Shifo Klinikasi"
                  value={clinic.organizationName}
                  onChange={(e) => { clearError(); setClinic((c) => ({ ...c, organizationName: e.target.value })); }}
                  required
                  autoFocus
                />
              </Field>
              <Row>
                <Field>
                  <Label>O'zbekcha nom</Label>
                  <Input
                    type="text"
                    placeholder="Najot Shifo"
                    value={clinic.organizationNameUz}
                    onChange={(e) => setClinic((c) => ({ ...c, organizationNameUz: e.target.value }))}
                  />
                </Field>
                <Field>
                  <Label>Ruscha nom</Label>
                  <Input
                    type="text"
                    placeholder="Наджот Шифо"
                    value={clinic.organizationNameRu}
                    onChange={(e) => setClinic((c) => ({ ...c, organizationNameRu: e.target.value }))}
                  />
                </Field>
              </Row>

              <SectionLabel>Manzil va aloqa</SectionLabel>
              <Row>
                <Field>
                  <Label>Shahar</Label>
                  <Input
                    type="text"
                    placeholder="Tashkent"
                    value={clinic.city}
                    onChange={(e) => setClinic((c) => ({ ...c, city: e.target.value }))}
                  />
                </Field>
                <Field>
                  <Label>Viloyat</Label>
                  <Input
                    type="text"
                    placeholder="Toshkent viloyati"
                    value={clinic.region}
                    onChange={(e) => setClinic((c) => ({ ...c, region: e.target.value }))}
                  />
                </Field>
              </Row>
              <Field>
                <Label>Ko'cha manzili</Label>
                <Input
                  type="text"
                  placeholder="Ko'yluk ko'chasi 12-uy"
                  value={clinic.address}
                  onChange={(e) => setClinic((c) => ({ ...c, address: e.target.value }))}
                />
              </Field>
              <Field>
                <Label>Telefon</Label>
                <Input
                  type="tel"
                  placeholder="+998901234567"
                  value={clinic.contactPhone}
                  onChange={(e) => setClinic((c) => ({ ...c, contactPhone: e.target.value }))}
                />
              </Field>

              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn type="submit" disabled={isLoading || !clinic.organizationName}>
                {isLoading ? 'Yaratilmoqda...' : "Klinikani ro'yxatdan o'tkazish →"}
              </PrimaryBtn>
            </Form>
          </>
        )}
      </Card>
    </Page>
  );
}

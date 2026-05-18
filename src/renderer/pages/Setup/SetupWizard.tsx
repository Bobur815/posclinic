import React, { useState } from 'react';
import styled from 'styled-components';
import { Stethoscope, Mail, Hash, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

// ─── Styled components ────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.background};
  padding: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const IconCircle = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin: 0 auto ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 4px;
`;

const Subtitle = styled.p`
  font-size: 13px;
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
    $done || $active ? theme.colors.primary : theme.colors.border};
  color: ${({ $active, $done, theme }) =>
    $done || $active ? '#fff' : theme.colors.textSecondary};
`;

const StepLine = styled.div<{ $done: boolean }>`
  flex: 1;
  height: 2px;
  max-width: 64px;
  background: ${({ $done, theme }) => ($done ? theme.colors.primary : theme.colors.border)};
  transition: background 0.3s;
`;

// ─── Form elements ────────────────────────────────────────────────────────────

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const StepHeading = styled.div`
  margin-bottom: 4px;
  h2 {
    font-size: 1rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text};
    margin: 0 0 4px;
  }
  p {
    font-size: 0.82rem;
    color: ${({ theme }) => theme.colors.textSecondary};
    margin: 0;
    line-height: 1.5;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const InputWrapper = styled.div`
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
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

const CodeInput = styled(Input)`
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-align: center;
  text-transform: uppercase;
  font-family: monospace;
`;

const EyeBtn = styled.button`
  position: absolute;
  right: 10px;
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

const SubmitBtn = styled.button`
  width: 100%;
  padding: 12px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

const ErrorMsg = styled.div`
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.error}18;
  border-left: 3px solid ${({ theme }) => theme.colors.error};
  border-radius: 0 ${({ theme }) => theme.borderRadius} ${({ theme }) => theme.borderRadius} 0;
  color: ${({ theme }) => theme.colors.error};
  font-size: 13px;
`;

const HintBox = styled.div`
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.primary}12;
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  border-radius: 0 ${({ theme }) => theme.borderRadius} ${({ theme }) => theme.borderRadius} 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 1.5;
`;

const SuccessBox = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.primary};
`;

// ─── Component ────────────────────────────────────────────────────────────────

const API_URL = process.env.VPS_API_URL ?? 'http://localhost:4000/api';

export function SetupWizard() {
  const toast = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDone, setIsDone] = useState(false);

  // Step 1
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2
  const [clinicCode, setClinicCode] = useState('');

  // ── Step 1: validate locally and advance ───────────────────────────────────
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Email va parolni kiriting');
      return;
    }
    setStep(2);
  };

  // ── Step 2: call VPS electron/setup, then save config ─────────────────────
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = clinicCode.trim().toUpperCase();
    if (!code) {
      setError('Klinika kodini kiriting');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/electron/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicCode: code, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.message ?? 'Xatolik yuz berdi';
        setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
        return;
      }

      const { token, tenant, user: vpsUser } = data as {
        token: string;
        tenant: { id: string; name: string; clinicCode: string };
        user: { id: string; email: string; firstName: string; lastName: string; role: string };
      };

      const terminalId = `${code}-T1`;

      const result = await window.electronAPI.setup.complete({
        clinicId: tenant.id,
        clinicName: tenant.name,
        terminalId,
        apiUrl: API_URL,
        token,
        email,
        password,
        user: vpsUser,
      });

      if (!result.success) {
        setError(result.error ?? 'Konfiguratsiya saqlashda xatolik');
        return;
      }

      setIsDone(true);
      toast.success("Sozlash muvaffaqiyatli yakunlandi!");

      setTimeout(() => {
        window.electronAPI.setup.launchApp();
      }, 1500);

    } catch {
      setError("Server bilan bog'lanib bo'lmadi. Internet aloqasini tekshiring.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (isDone) {
    return (
      <Page>
        <Card>
          <SuccessBox>
            <CheckCircle size={56} />
            <div>
              <Title>Tayyor!</Title>
              <Subtitle>Ilova ishga tushirilmoqda...</Subtitle>
            </div>
          </SuccessBox>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        <Header>
          <IconCircle>
            <Stethoscope size={28} />
          </IconCircle>
          <Title>POSCLINIC</Title>
          <Subtitle>Terminal sozlash</Subtitle>
        </Header>

        {/* Step indicator */}
        <StepBar>
          <StepDot $active={step === 1} $done={step > 1}>{step > 1 ? '✓' : '1'}</StepDot>
          <StepLine $done={step > 1} />
          <StepDot $active={step === 2} $done={false}>2</StepDot>
        </StepBar>

        {/* ── Step 1: Email + Password ── */}
        {step === 1 && (
          <Form onSubmit={handleStep1}>
            <StepHeading>
              <h2><Mail size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Admin hisobi</h2>
              <p>Web versiyada ro'yxatdan o'tgan email va parolni kiriting</p>
            </StepHeading>

            <FormGroup>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="owner@clinic.uz"
                value={email}
                onChange={(e) => { setError(''); setEmail(e.target.value); }}
                required
                autoFocus
              />
            </FormGroup>

            <FormGroup>
              <Label>Parol</Label>
              <InputWrapper>
                <PasswordInput
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Parolni kiriting"
                  value={password}
                  onChange={(e) => { setError(''); setPassword(e.target.value); }}
                  required
                />
                <EyeBtn type="button" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </EyeBtn>
              </InputWrapper>
            </FormGroup>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn type="submit">Davom etish →</SubmitBtn>
          </Form>
        )}

        {/* ── Step 2: Clinic Code ── */}
        {step === 2 && (
          <Form onSubmit={handleStep2}>
            <StepHeading>
              <h2><Hash size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Klinika kodi</h2>
              <p>Web versiyada ro'yxatdan o'tgandan so'ng ko'rsatilgan kodni kiriting</p>
            </StepHeading>

            <FormGroup>
              <Label>Klinika kodi</Label>
              <CodeInput
                type="text"
                placeholder="PC-XXXXXX"
                value={clinicCode}
                onChange={(e) => { setError(''); setClinicCode(e.target.value.toUpperCase()); }}
                maxLength={9}
                required
                autoFocus
              />
            </FormGroup>

            <HintBox>
              Kod <strong>PC-</strong> bilan boshlanadi va 9 belgidan iborat (masalan: <strong>PC-BTKIAS</strong>).
              Uni web versiyaning ro'yxatdan o'tish jarayoni oxirida ko'rasiz.
            </HintBox>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn type="submit" disabled={isLoading || clinicCode.length < 9}>
              {isLoading ? 'Tekshirilmoqda...' : 'Sozlashni yakunlash →'}
            </SubmitBtn>
          </Form>
        )}
      </Card>
    </Page>
  );
}

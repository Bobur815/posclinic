import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  Stethoscope,
  KeyRound,
  UserPlus,
  Eye,
  EyeOff,
  CheckCircle,
  Server,
  MonitorSmartphone,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ipcErrorKey } from '../../store/lan-store';

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
  color: ${({ $active, $done, theme }) => ($done || $active ? '#fff' : theme.colors.textSecondary)};
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

// ─── Role choice ──────────────────────────────────────────────────────────────

const Choices = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Choice = styled.button`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  svg {
    color: ${({ theme }) => theme.colors.primary};
    flex-shrink: 0;
    margin-top: 2px;
  }
  strong {
    display: block;
    font-size: 14px;
    margin-bottom: 2px;
  }
  span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
    line-height: 1.4;
  }
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const LinkBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  cursor: pointer;
  padding: 4px;
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

const LangRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
`;

const LangBtn = styled.button<{ $active: boolean }>`
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: none;
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
`;

/**
 * First run. Step 0: is this the clinic's MAIN till or an extra (satellite) till? A satellite
 * only joins its main till (address + 6-digit code from the main's Settings) and restarts.
 * A main till then has two steps:
 * 1. Link the till to the clinic the posgro super admin created: owner phone + one-time
 *    activation code. Main calls posgro and stores the signed licence.
 * 2. Create the clinic's first admin (phone login), which also seeds parasitology services.
 * A till already linked but without an admin (closed mid-setup) resumes at step 2, because the
 * activation code is spent.
 */
export function SetupWizard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'choose' | 'main' | 'join'>('choose');
  const [mainAddress, setMainAddress] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [clinicName, setClinicName] = useState('');

  // Step 1
  const [ownerPhone, setOwnerPhone] = useState('');
  const [code, setCode] = useState('');

  // Step 2
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    window.electronAPI.license.status().then((s) => {
      if (s.linked) {
        setClinicName(s.storeName ?? '');
        setMode('main');
        setStep(2);
      }
    });
  }, []);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await window.electronAPI.license.activate(ownerPhone, code);
      if (!result.ok) {
        setError(t(result.error, t('license.errors.unknown')));
        return;
      }
      setClinicName(result.storeName);
      if (result.recovered) {
        setIsDone(true);
        setTimeout(() => void window.electronAPI.setup.launchApp(), 1500);
        return;
      }
      if (result.ownerName && !fullName) setFullName(result.ownerName);
      if (!phone) setPhone(ownerPhone);
      toast.success(t('setup.link.linked', { name: result.storeName }));
      setStep(2);
    } catch {
      setError(t('license.errors.offline'));
    } finally {
      setIsLoading(false);
    }
  };

  /** The owner who also sees patients: a doctor profile on this same login. */
  const [isDoctor, setIsDoctor] = useState(false);

  const handleAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await window.electronAPI.setup.createAdmin({
        fullName,
        phone,
        email: email || undefined,
        password,
        lang: i18n.language === 'ru' ? 'ru' : 'uz',
        isDoctor,
      });
      if (!result.success) {
        setError(t(result.error ?? 'setup.errors.failed', t('setup.errors.failed')));
        return;
      }
      setIsDone(true);
      setTimeout(() => void window.electronAPI.setup.launchApp(), 1500);
    } catch {
      setError(t('setup.errors.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await window.electronAPI.lan.join({ mainAddress, code: joinCode });
      // The app restarts as a satellite of that main till.
      setJoined(true);
    } catch (err) {
      setError(t(ipcErrorKey(err, 'lan.errors.joinFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  const backToChoice = () => {
    setError('');
    setMode('choose');
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  if (joined) {
    return (
      <Page>
        <Card>
          <SuccessBox>
            <CheckCircle size={56} />
            <Subtitle>{t('setup.join.done')}</Subtitle>
          </SuccessBox>
        </Card>
      </Page>
    );
  }

  if (isDone) {
    return (
      <Page>
        <Card>
          <SuccessBox>
            <CheckCircle size={56} />
            <div>
              <Title>{t('setup.done.title')}</Title>
              <Subtitle>{t('setup.done.subtitle')}</Subtitle>
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
          <Subtitle>{clinicName || t('setup.subtitle')}</Subtitle>
          <LangRow>
            <LangBtn
              type="button"
              $active={i18n.language === 'uz'}
              onClick={() => changeLanguage('uz')}
            >
              UZ
            </LangBtn>
            <LangBtn
              type="button"
              $active={i18n.language === 'ru'}
              onClick={() => changeLanguage('ru')}
            >
              RU
            </LangBtn>
          </LangRow>
        </Header>

        {mode === 'choose' && (
          <Form as="div">
            <StepHeading>
              <h2>{t('setup.role.title')}</h2>
              <p>{t('setup.role.subtitle')}</p>
            </StepHeading>
            <Choices>
              <Choice type="button" onClick={() => setMode('main')}>
                <Server size={22} />
                <div>
                  <strong>{t('setup.role.main')}</strong>
                  <span>{t('setup.role.mainDesc')}</span>
                </div>
              </Choice>
              <Choice type="button" onClick={() => setMode('join')}>
                <MonitorSmartphone size={22} />
                <div>
                  <strong>{t('setup.role.satellite')}</strong>
                  <span>{t('setup.role.satelliteDesc')}</span>
                </div>
              </Choice>
            </Choices>
          </Form>
        )}

        {mode === 'join' && (
          <Form onSubmit={handleJoin}>
            <StepHeading>
              <h2>
                <MonitorSmartphone size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {t('setup.join.title')}
              </h2>
              <p>{t('setup.join.subtitle')}</p>
            </StepHeading>

            <FormGroup>
              <Label>{t('setup.join.address')}</Label>
              <Input
                placeholder="192.168.1.10"
                value={mainAddress}
                onChange={(e) => {
                  setError('');
                  setMainAddress(e.target.value);
                }}
                required
                autoFocus
              />
            </FormGroup>

            <FormGroup>
              <Label>{t('setup.join.code')}</Label>
              <CodeInput
                inputMode="numeric"
                placeholder="000000"
                value={joinCode}
                onChange={(e) => {
                  setError('');
                  setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                required
              />
            </FormGroup>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn
              type="submit"
              disabled={isLoading || joinCode.length !== 6 || !mainAddress.trim()}
            >
              {isLoading ? t('setup.join.joining') : `${t('setup.join.submit')} →`}
            </SubmitBtn>
            <LinkBtn type="button" onClick={backToChoice}>
              ← {t('setup.join.back')}
            </LinkBtn>
          </Form>
        )}

        {mode === 'main' && (
          <StepBar>
            <StepDot $active={step === 1} $done={step > 1}>
              {step > 1 ? '✓' : '1'}
            </StepDot>
            <StepLine $done={step > 1} />
            <StepDot $active={step === 2} $done={false}>
              2
            </StepDot>
          </StepBar>
        )}

        {mode === 'main' && step === 1 && (
          <Form onSubmit={handleLink}>
            <StepHeading>
              <h2>
                <KeyRound size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {t('setup.link.title')}
              </h2>
              <p>{t('setup.link.subtitle')}</p>
            </StepHeading>

            <FormGroup>
              <Label>{t('setup.link.phone')}</Label>
              <Input
                type="tel"
                inputMode="tel"
                placeholder={t('auth.phonePlaceholder')}
                value={ownerPhone}
                onChange={(e) => {
                  setError('');
                  setOwnerPhone(e.target.value);
                }}
                required
                autoFocus
              />
            </FormGroup>

            <FormGroup>
              <Label>{t('setup.link.code')}</Label>
              <CodeInput
                type="text"
                placeholder="XXXX-XXXX"
                value={code}
                onChange={(e) => {
                  setError('');
                  setCode(e.target.value.toUpperCase());
                }}
                maxLength={9}
                required
              />
            </FormGroup>

            <HintBox>{t('setup.link.codeHint')}</HintBox>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn
              type="submit"
              disabled={isLoading || code.replace(/[\s-]/g, '').length !== 8}
            >
              {isLoading ? t('setup.link.checking') : `${t('setup.link.submit')} →`}
            </SubmitBtn>
            <LinkBtn type="button" onClick={backToChoice}>
              ← {t('setup.join.back')}
            </LinkBtn>
          </Form>
        )}

        {mode === 'main' && step === 2 && (
          <Form onSubmit={handleAdmin}>
            <StepHeading>
              <h2>
                <UserPlus size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {t('setup.admin.title')}
              </h2>
              <p>{t('setup.admin.subtitle')}</p>
            </StepHeading>

            <FormGroup>
              <Label>{t('setup.admin.fullName')}</Label>
              <Input
                value={fullName}
                onChange={(e) => {
                  setError('');
                  setFullName(e.target.value);
                }}
                required
                autoFocus
              />
            </FormGroup>

            <FormGroup>
              <Label>{t('setup.admin.phone')}</Label>
              <Input
                type="tel"
                inputMode="tel"
                placeholder={t('auth.phonePlaceholder')}
                value={phone}
                onChange={(e) => {
                  setError('');
                  setPhone(e.target.value);
                }}
                required
              />
            </FormGroup>

            <FormGroup>
              <Label>{t('setup.admin.email')}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setError('');
                  setEmail(e.target.value);
                }}
              />
            </FormGroup>

            <FormGroup>
              <Label>{t('setup.admin.password')}</Label>
              <InputWrapper>
                <PasswordInput
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setError('');
                    setPassword(e.target.value);
                  }}
                  minLength={6}
                  required
                />
                <EyeBtn type="button" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </EyeBtn>
              </InputWrapper>
            </FormGroup>

            <FormGroup>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={isDoctor}
                  onChange={(e) => setIsDoctor(e.target.checked)}
                />
                {t('setup.admin.isDoctor')}
              </label>
            </FormGroup>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn type="submit" disabled={isLoading}>
              {isLoading ? t('common.loading') : `${t('setup.admin.submit')} →`}
            </SubmitBtn>
          </Form>
        )}
      </Card>
    </Page>
  );
}

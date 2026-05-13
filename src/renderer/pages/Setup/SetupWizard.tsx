import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Stethoscope, ChevronRight } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

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
  max-width: 520px;
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
`;

const Subtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 4px;
`;

const StepIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const StepDot = styled.div<{ $active: boolean; $done: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ $active, $done, theme }) =>
    $done ? theme.colors.success : $active ? theme.colors.primary : theme.colors.border};
  transition: background 0.2s;
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const Button = styled.button`
  width: 100%;
  padding: 12px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: ${({ theme }) => theme.spacing.md};
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
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const SuccessMsg = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;

export function SetupWizard() {
  const { t } = useTranslation();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [clinicId, setClinicId] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [apiUrl, setApiUrl] = useState('https://posclinic.bobur-dev.uz/api');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !clinicName || !apiUrl) {
      setError(t('setup.errors.required_fields'));
      return;
    }
    setError('');
    setStep(2);
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });

      if (!res.ok) {
        setError(t('setup.errors.invalid_credentials'));
        return;
      }

      const data = (await res.json()) as { accessToken: string };
      setToken(data.accessToken);
      setStep(3);
    } catch {
      setError(t('setup.errors.network_error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.config.updateLocalConfig({
        clinicId,
        clinicName,
        apiUrl,
        terminalId: `TERMINAL_${clinicId}_001`,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setupResult = await (window.electronAPI as any).setup?.complete?.({
        clinicId,
        terminalId: `TERMINAL_${clinicId}_001`,
        clinicName,
        apiUrl,
        token,
      });

      setIsComplete(true);
      toast.success(t('setup.complete.success'));

      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window.electronAPI as any).setup?.launchApp?.();
      }, 1500);
    } catch {
      setError(t('setup.errors.network_error'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isComplete) {
    return (
      <Page>
        <Card>
          <SuccessMsg>
            <IconCircle style={{ margin: '0 auto 16px' }}>
              <Stethoscope size={28} />
            </IconCircle>
            <Title>{t('setup.complete.success')}</Title>
          </SuccessMsg>
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
          <Title>{t('setup.title')}</Title>
          <Subtitle>{t('setup.subtitle')}</Subtitle>
        </Header>

        <StepIndicator>
          {[1, 2, 3].map((s) => (
            <StepDot key={s} $active={step === s} $done={step > s} />
          ))}
        </StepIndicator>

        {step === 1 && (
          <form onSubmit={handleStep1}>
            <FormGroup>
              <Label>{t('setup.clinicInfo.clinicId')}</Label>
              <Input value={clinicId} onChange={(e) => setClinicId(e.target.value)} required />
            </FormGroup>
            <FormGroup>
              <Label>{t('setup.clinicInfo.clinicName')}</Label>
              <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} required />
            </FormGroup>
            <FormGroup>
              <Label>{t('setup.clinicInfo.apiUrl')}</Label>
              <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} required />
            </FormGroup>
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <Button type="submit">{t('setup.clinicInfo.next')}</Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2}>
            <FormGroup>
              <Label>{t('setup.login.phone')}</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </FormGroup>
            <FormGroup>
              <Label>{t('setup.login.password')}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </FormGroup>
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('common.loading') : t('setup.login.submit')}
            </Button>
          </form>
        )}

        {step === 3 && (
          <div>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              {t('setup.complete.loading')}
            </p>
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <Button onClick={handleComplete} disabled={isLoading}>
              {isLoading ? t('common.processing') : t('common.finish')}
            </Button>
          </div>
        )}
      </Card>
    </Page>
  );
}

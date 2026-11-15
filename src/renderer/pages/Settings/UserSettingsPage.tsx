import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { formatPhone } from '../../../shared/phone';
import { Save, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuthStore } from '../../store/auth-store';

const Page = styled.div`
  max-width: 480px;
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SectionTitle = styled.h2`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
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

const InputWrapper = styled.div`
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: 9px 40px 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const ToggleBtn = styled.button`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  padding: 0;
`;

const SaveBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-top: ${({ theme }) => theme.spacing.lg};
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const ProfileCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ProfileRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child { border-bottom: none; }
`;

const ProfileLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ProfileValue = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

export function UserSettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      toast.error(t('users.passwordMismatch'));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t('users.passwordTooShort'));
      return;
    }
    setIsSaving(true);
    try {
      await window.electronAPI.auth.changePassword(currentPassword, newPassword);
      toast.success(t('common.success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error(t('users.wrongPassword'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page>
      <Title>{t('settings.userSettings')}</Title>

      {user && (
        <ProfileCard>
          <ProfileRow>
            <ProfileLabel>{t('users.fullName')}</ProfileLabel>
            <ProfileValue>{user.fullName}</ProfileValue>
          </ProfileRow>
          <ProfileRow>
            <ProfileLabel>{t('auth.phone')}</ProfileLabel>
            <ProfileValue>{formatPhone(user.phone)}</ProfileValue>
          </ProfileRow>
          {user.email && (
            <ProfileRow>
              <ProfileLabel>{t('auth.email')}</ProfileLabel>
              <ProfileValue>{user.email}</ProfileValue>
            </ProfileRow>
          )}
          <ProfileRow>
            <ProfileLabel>{t('users.role')}</ProfileLabel>
            <ProfileValue>{t(`users.roles.${user.role}`, user.role)}</ProfileValue>
          </ProfileRow>
        </ProfileCard>
      )}

      <Card>
        <SectionTitle>{t('users.changePassword')}</SectionTitle>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <Label>{t('users.currentPassword')}</Label>
            <InputWrapper>
              <Input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <ToggleBtn type="button" onClick={() => setShowCurrent((p) => !p)}>
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </ToggleBtn>
            </InputWrapper>
          </FormGroup>
          <FormGroup>
            <Label>{t('users.newPassword')}</Label>
            <InputWrapper>
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <ToggleBtn type="button" onClick={() => setShowNew((p) => !p)}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </ToggleBtn>
            </InputWrapper>
          </FormGroup>
          <FormGroup>
            <Label>{t('users.confirmPassword')}</Label>
            <InputWrapper>
              <Input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <ToggleBtn type="button" onClick={() => setShowConfirm((p) => !p)}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </ToggleBtn>
            </InputWrapper>
          </FormGroup>
          <SaveBtn type="submit" disabled={isSaving}>
            <Save size={15} />
            {isSaving ? t('common.processing') : t('users.changePassword')}
          </SaveBtn>
        </form>
      </Card>
    </Page>
  );
}

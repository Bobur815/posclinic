import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Sun, Moon, Globe, Monitor, RefreshCw, Info } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../context/ToastContext';

interface LocalConfig {
  clinicId: string;
  clinicName: string;
  terminalId: string;
  apiUrl: string;
  lastSync: string | null;
}

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastError: string | null;
}

const Page = styled.div`
  max-width: 720px;
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SettingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child { border-bottom: none; }
`;

const SettingInfo = styled.div``;

const SettingLabel = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 2px;
`;

const SettingDesc = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ToggleGroup = styled.div`
  display: flex;
  gap: 4px;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active }) => ($active ? 'white' : 'inherit')};
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child { border-bottom: none; }
`;

const InfoLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const InfoValue = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 500;
`;

const SyncBtn = styled.button<{ $syncing?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Input = styled.input`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  width: 280px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { mode, toggleTheme } = useTheme();

  const setMode = (newMode: 'light' | 'dark') => {
    if (newMode !== mode) toggleTheme();
  };
  const [localConfig, setLocalConfig] = useState<LocalConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    window.electronAPI.config.getLocalConfig().then((cfg) => setLocalConfig(cfg as LocalConfig));
    window.electronAPI.sync.getStatus().then((s) => setSyncStatus(s as SyncStatus));
  }, []);

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await window.electronAPI.sync.trigger();
      const s = await window.electronAPI.sync.getStatus();
      setSyncStatus(s as SyncStatus);
      toast.success(t('sync.syncCompleted'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const appVersion = '1.0.0';

  return (
    <Page>
      <Title>{t('settings.title')}</Title>

      {/* Appearance */}
      <Section>
        <SectionTitle><Monitor size={15} />{t('settings.appearance')}</SectionTitle>
        <Card>
          <SettingRow>
            <SettingInfo>
              <SettingLabel>{t('settings.theme')}</SettingLabel>
              <SettingDesc>{t('settings.themeDesc')}</SettingDesc>
            </SettingInfo>
            <ToggleGroup>
              <ToggleBtn $active={mode === 'light'} onClick={() => setMode('light')}>
                <Sun size={14} />{t('settings.light')}
              </ToggleBtn>
              <ToggleBtn $active={mode === 'dark'} onClick={() => setMode('dark')}>
                <Moon size={14} />{t('settings.dark')}
              </ToggleBtn>
            </ToggleGroup>
          </SettingRow>
          <SettingRow>
            <SettingInfo>
              <SettingLabel>{t('settings.language')}</SettingLabel>
              <SettingDesc>{t('settings.languageDesc')}</SettingDesc>
            </SettingInfo>
            <ToggleGroup>
              <ToggleBtn $active={i18n.language === 'uz'} onClick={() => handleLangChange('uz')}>
                <Globe size={14} />UZ
              </ToggleBtn>
              <ToggleBtn $active={i18n.language === 'ru'} onClick={() => handleLangChange('ru')}>
                <Globe size={14} />RU
              </ToggleBtn>
            </ToggleGroup>
          </SettingRow>
        </Card>
      </Section>

      {/* Clinic Info */}
      {localConfig && (
        <Section>
          <SectionTitle><Info size={15} />{t('settings.clinicInfo')}</SectionTitle>
          <Card>
            <InfoItem>
              <InfoLabel>{t('settings.clinicName')}</InfoLabel>
              <InfoValue>{localConfig.clinicName}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>{t('settings.clinicId')}</InfoLabel>
              <InfoValue>{localConfig.clinicId}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>{t('settings.terminalId')}</InfoLabel>
              <InfoValue>{localConfig.terminalId}</InfoValue>
            </InfoItem>
            <InfoItem>
              <InfoLabel>{t('settings.apiUrl')}</InfoLabel>
              <InfoValue style={{ fontSize: '12px' }}>{localConfig.apiUrl}</InfoValue>
            </InfoItem>
          </Card>
        </Section>
      )}

      {/* Sync */}
      <Section>
        <SectionTitle><RefreshCw size={15} />{t('settings.sync')}</SectionTitle>
        <Card>
          <SettingRow>
            <SettingInfo>
              <SettingLabel>{t('sync.status')}</SettingLabel>
              <SettingDesc>
                {syncStatus?.lastSyncTime
                  ? `${t('sync.lastSync')}: ${new Date(syncStatus.lastSyncTime).toLocaleString()}`
                  : t('sync.neverSynced')}
                {syncStatus?.lastError && (
                  <span style={{ color: '#ef4444', display: 'block' }}>{syncStatus.lastError}</span>
                )}
              </SettingDesc>
            </SettingInfo>
            <SyncBtn onClick={handleSync} disabled={isSyncing}>
              <RefreshCw size={14} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
              {isSyncing ? t('sync.syncing') : t('sync.syncNow')}
            </SyncBtn>
          </SettingRow>
        </Card>
      </Section>

      {/* About */}
      <Section>
        <SectionTitle><Info size={15} />{t('settings.about')}</SectionTitle>
        <Card>
          <InfoItem>
            <InfoLabel>{t('settings.appName')}</InfoLabel>
            <InfoValue>POSCLINIC</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t('settings.version')}</InfoLabel>
            <InfoValue>v{appVersion}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t('settings.developer')}</InfoLabel>
            <InfoValue>Bobur Ergashev</InfoValue>
          </InfoItem>
        </Card>
      </Section>
    </Page>
  );
}

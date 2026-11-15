import { Download, RefreshCw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { UpdateStatusDto } from '../../../shared/update';

const Section = styled.section`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 10px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const Muted = styled.div`
  margin-top: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorText = styled.div`
  margin-top: 8px;
  color: ${({ theme }) => theme.colors.error};
`;

const Bar = styled.div<{ $percent: number }>`
  margin-top: 10px;
  height: 6px;
  border-radius: 3px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $percent }) => $percent}%;
    background: ${({ theme }) => theme.colors.primary};
    transition: width 0.2s;
  }
`;

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 14px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

/**
 * Settings → Update (admins only: the Settings page is admin-guarded, and main refuses
 * download/install for anyone else). Installing restarts the app with the new version.
 */
export function UpdateSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatusDto | null>(null);

  useEffect(() => {
    const refresh = () => void window.electronAPI.update.status().then(setStatus);
    refresh();
    return window.electronAPI.update.onChanged(refresh);
  }, []);

  if (!status) return null;
  const { state } = status;

  return (
    <Section>
      <SectionTitle>
        <RotateCw size={15} />
        {t('update.title')}
      </SectionTitle>
      <Card>
        <div>
          {t('update.current')}: <strong>v{status.currentVersion}</strong>
        </div>

        {state === 'unsupported' && <Muted>{t('update.unsupported')}</Muted>}
        {state === 'not-available' && <Muted>{t('update.upToDate')}</Muted>}
        {(state === 'available' || state === 'downloading' || state === 'downloaded') && (
          <Muted>{t('update.available', { version: status.version })}</Muted>
        )}
        {state === 'downloading' && <Bar $percent={status.percent ?? 0} />}
        {state === 'downloaded' && <Muted>{t('update.ready')}</Muted>}
        {state === 'error' && status.message && <ErrorText>{t(status.message)}</ErrorText>}

        {(state === 'idle' || state === 'not-available' || state === 'checking') && (
          <Btn
            onClick={() => void window.electronAPI.update.check().then(setStatus)}
            disabled={state === 'checking'}
          >
            <RefreshCw size={14} />
            {state === 'checking' ? t('update.checking') : t('update.check')}
          </Btn>
        )}
        {(state === 'available' || (state === 'error' && status.version)) && (
          <Btn onClick={() => void window.electronAPI.update.download().then(setStatus)}>
            <Download size={14} />
            {t('update.download', { version: status.version })}
          </Btn>
        )}
        {state === 'error' && !status.version && (
          <Btn onClick={() => void window.electronAPI.update.check().then(setStatus)}>
            <RefreshCw size={14} />
            {t('update.check')}
          </Btn>
        )}
        {state === 'downloading' && (
          <Btn disabled>
            <Download size={14} />
            {t('update.downloading', { percent: status.percent ?? 0 })}
          </Btn>
        )}
        {state === 'downloaded' && (
          <Btn onClick={() => void window.electronAPI.update.install()}>
            <RotateCw size={14} />
            {t('update.install')}
          </Btn>
        )}
      </Card>
    </Section>
  );
}

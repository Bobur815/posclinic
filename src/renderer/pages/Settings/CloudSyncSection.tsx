import { Cloud, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { SyncStatusDto } from '../../../shared/sync';

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

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0;
`;

const Muted = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorText = styled.div`
  margin-top: 8px;
  color: ${({ theme }) => theme.colors.error};
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

/** Settings → Cloud sync: what reached the clinic's web dashboard, and when. */
export function CloudSyncSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SyncStatusDto | null>(null);

  useEffect(() => {
    const refresh = () => void window.electronAPI.sync.status().then(setStatus);
    refresh();
    return window.electronAPI.sync.onChanged(refresh);
  }, []);

  if (!status) return null;
  const syncing = status.state === 'syncing';

  return (
    <Section>
      <SectionTitle>
        <Cloud size={15} />
        {t('sync.title')}
      </SectionTitle>
      <Card>
        <Muted>{t('sync.description')}</Muted>
        <Row>
          <Muted>{t('sync.lastSync')}</Muted>
          <span>
            {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : t('sync.never')}
          </span>
        </Row>
        <Row>
          <Muted>{t('sync.pending')}</Muted>
          <span>{status.pending ?? '—'}</span>
        </Row>
        {status.state === 'disabled' && <Muted>{t('sync.disabled')}</Muted>}
        {status.state === 'error' && status.lastError && (
          <ErrorText>{t(status.lastError)}</ErrorText>
        )}
        <Btn
          onClick={() => void window.electronAPI.sync.now().then(setStatus)}
          disabled={syncing || status.state === 'disabled'}
        >
          <RefreshCw
            size={14}
            style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}
          />
          {syncing ? t('sync.syncing') : t('sync.now')}
        </Btn>
      </Card>
    </Section>
  );
}

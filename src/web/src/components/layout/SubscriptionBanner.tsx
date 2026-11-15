import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';
import { daysLeft, EXPIRY_WARN_DAYS } from '../../lib/subscription';

const Banner = styled.div<{ $expired: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  background: ${({ theme, $expired }) => ($expired ? theme.colors.error : theme.colors.warning)}20;
  color: ${({ theme, $expired }) => ($expired ? theme.colors.error : theme.colors.warning)};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  a {
    color: inherit;
    text-decoration: underline;
    font-weight: 600;
  }
`;

export function SubscriptionBanner() {
  const { t } = useTranslation();
  const expiresAt = useAuthStore((s) => s.clinic?.expiresAt);
  const days = daysLeft(expiresAt);
  if (days === null || days > EXPIRY_WARN_DAYS) return null;

  return (
    <Banner $expired={days <= 0}>
      <AlertTriangle size={16} />
      <span>{days <= 0 ? t('subscription.bannerExpired') : t('subscription.bannerSoon', { count: days })}</span>
      <Link to="/subscription">{t('subscription.details')}</Link>
    </Banner>
  );
}

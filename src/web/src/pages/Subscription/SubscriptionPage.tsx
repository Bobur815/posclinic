import { useTranslation } from 'react-i18next';
import { CreditCard, RefreshCw } from 'lucide-react';
import { clinicApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatDate } from '../../lib/format';
import { daysLeft, EXPIRY_WARN_DAYS } from '../../lib/subscription';
import { Badge, Button, Card, DataState, InfoList, Page, PageHeader } from '../../components/ui';

type Tone = 'success' | 'warning' | 'error';

export function SubscriptionPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => clinicApi.get(), []);
  const days = daysLeft(data?.expiresAt);

  let tone: Tone = 'success';
  let text = t('subscription.unlimited');
  if (days !== null && days <= 0) {
    tone = 'error';
    text = t('subscription.expired');
  } else if (days !== null) {
    tone = days <= EXPIRY_WARN_DAYS ? 'warning' : 'success';
    text = t('subscription.daysLeft', { count: days });
  }

  return (
    <Page>
      <PageHeader
        icon={<CreditCard />}
        title={t('subscription.title')}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />
      <DataState loading={loading && !data} error={error} onRetry={reload}>
        {data && (
          <Card>
            <InfoList
              items={[
                { label: t('subscription.clinic'), value: data.name },
                { label: t('subscription.clinicId'), value: <code>{data.id}</code> },
                {
                  label: t('subscription.plan'),
                  value: data.plan ? t(`subscription.plans.${data.plan}`, data.plan) : '—',
                },
                {
                  label: t('subscription.expiresAt'),
                  value: data.expiresAt ? formatDate(data.expiresAt) : t('subscription.unlimited'),
                },
                { label: t('common.status'), value: <Badge $tone={tone}>{text}</Badge> },
              ]}
            />
            <p style={{ marginTop: 16, opacity: 0.75, fontSize: 13 }}>
              {t('subscription.managedBy')}
            </p>
          </Card>
        )}
      </DataState>
    </Page>
  );
}

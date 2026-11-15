import { useTranslation } from 'react-i18next';
import { MonitorSmartphone, RefreshCw } from 'lucide-react';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ru, uz } from 'date-fns/locale';
import { clinicApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';
import {
  Badge,
  Button,
  Card,
  DataState,
  InfoList,
  Page,
  PageHeader,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

/** A till that synced within this window counts as online (the main syncs every 60 s). */
const ONLINE_MS = 10 * 60_000;

export function DevicesPage() {
  const { t, i18n } = useTranslation();
  const { data, loading, error, reload } = useAsync(() => clinicApi.get(), []);
  const locale = i18n.language === 'ru' ? ru : uz;

  const ago = (iso: string | null) =>
    iso
      ? formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, locale })
      : t('devices.never');

  const terminals = [...(data?.terminals ?? [])].sort((a, b) =>
    (b.lastSyncAt ?? '').localeCompare(a.lastSyncAt ?? ''),
  );

  return (
    <Page>
      <PageHeader
        icon={<MonitorSmartphone />}
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />

      <DataState loading={loading && !data} error={error} onRetry={reload}>
        {data && (
          <>
            <Card>
              <InfoList
                items={[
                  {
                    label: t('devices.clinicLastSync'),
                    value: data.lastSyncAt
                      ? `${formatDateTime(data.lastSyncAt)} (${ago(data.lastSyncAt)})`
                      : t('devices.never'),
                  },
                  { label: t('devices.count'), value: String(terminals.length) },
                ]}
              />
            </Card>
            <TableWrap>
              <DataState
                loading={false}
                error={null}
                empty={!terminals.length}
                emptyText={t('devices.none')}
              >
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('devices.terminalId')}</Th>
                      <Th>{t('devices.lastSync')}</Th>
                      <Th>{t('devices.version')}</Th>
                      <Th>{t('common.status')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {terminals.map((d) => {
                      const online =
                        Boolean(d.lastSyncAt) &&
                        Date.now() - new Date(d.lastSyncAt as string).getTime() < ONLINE_MS;
                      return (
                        <Tr key={d.terminalId}>
                          <Td style={{ fontFamily: 'monospace' }}>{d.terminalId}</Td>
                          <Td $nowrap>
                            {formatDateTime(d.lastSyncAt)}
                            <div style={{ fontSize: 12, opacity: 0.7 }}>{ago(d.lastSyncAt)}</div>
                          </Td>
                          <Td>{d.appVersion ?? '—'}</Td>
                          <Td>
                            <Badge $tone={online ? 'success' : 'muted'}>
                              {online ? t('devices.online') : t('devices.offline')}
                            </Badge>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </DataState>
            </TableWrap>
          </>
        )}
      </DataState>
    </Page>
  );
}

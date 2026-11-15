import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, RefreshCw } from 'lucide-react';
import { auditApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';
import {
  Badge,
  Button,
  DataState,
  Page,
  PageHeader,
  Pagination,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => auditApi.list(page, PAGE_SIZE), [page]);

  return (
    <Page>
      <PageHeader
        icon={<ScrollText />}
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />
      <TableWrap>
        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.items.length === 0}
          emptyText={t('audit.empty')}
        >
          <Table>
            <thead>
              <tr>
                <Th>{t('audit.time')}</Th>
                <Th>{t('audit.user')}</Th>
                <Th>{t('audit.action')}</Th>
                <Th>{t('audit.entity')}</Th>
                <Th>{t('audit.details')}</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((l) => (
                <Tr key={l.id}>
                  <Td $nowrap>{formatDateTime(l.createdAt)}</Td>
                  <Td>{l.user?.fullName ?? l.userName ?? '—'}</Td>
                  <Td>
                    <Badge>{t(`audit.actions.${l.action}`, l.action)}</Badge>
                  </Td>
                  <Td $nowrap>
                    {t(`audit.entities.${l.entity}`, l.entity)}
                    <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'monospace' }}>
                      {l.entityId}
                    </div>
                  </Td>
                  <Td $muted style={{ maxWidth: 420, wordBreak: 'break-word', fontSize: 12 }}>
                    {l.details ?? '—'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {data && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          )}
        </DataState>
      </TableWrap>
    </Page>
  );
}

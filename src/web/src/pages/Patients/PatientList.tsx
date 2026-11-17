import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Search, RefreshCw } from 'lucide-react';
import { patientsApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useDebounced } from '../../hooks/useDebounced';
import { formatDate, showPhone } from '../../lib/format';
import {
  Button,
  DataState,
  FilterBar,
  Field,
  Input,
  Page,
  PageHeader,
  Pagination,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

export function PatientList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const q = useDebounced(search.trim());

  useEffect(() => setPage(1), [q]);

  const { data, loading, error, reload } = useAsync(
    () => patientsApi.list({ search: q, page, pageSize }),
    [q, page, pageSize],
  );

  return (
    <Page>
      <PageHeader
        icon={<Users />}
        title={t('patients.title')}
        subtitle={data ? t('common.totalCount', { count: data.total }) : undefined}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />

      <FilterBar>
        <Field label={t('common.search')}>
          <div style={{ position: 'relative' }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('patients.searchPlaceholder')}
              style={{ paddingLeft: 32 }}
            />
            <Search size={16} style={{ position: 'absolute', left: 10, top: 11, opacity: 0.5 }} />
          </div>
        </Field>
      </FilterBar>

      <TableWrap>
        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.items.length === 0}
          emptyText={t('patients.noPatients')}
        >
          <Table>
            <thead>
              <tr>
                <Th>{t('patients.patientCode')}</Th>
                <Th>{t('patients.fullName')}</Th>
                <Th>{t('patients.phone')}</Th>
                <Th>{t('patients.birthDate')}</Th>
                <Th>{t('patients.gender')}</Th>
                <Th>{t('patients.registered')}</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((p) => (
                <Tr
                  key={p.id}
                  $clickable
                  $dim={!p.active}
                  onClick={() => navigate(`/patients/${p.id}`)}
                >
                  <Td $muted $nowrap data-label={t('patients.patientCode')}>
                    {p.patientCode}
                  </Td>
                  <Td $title>{p.fullName}</Td>
                  <Td $nowrap data-label={t('patients.phone')}>
                    {showPhone(p.phone)}
                  </Td>
                  <Td $nowrap data-label={t('patients.birthDate')}>
                    {formatDate(p.birthDate)}
                  </Td>
                  <Td data-label={t('patients.gender')}>{p.gender ? t(`patients.genders.${p.gender}`, p.gender) : '—'}</Td>
                  <Td $muted $nowrap data-label={t('patients.registered')}>
                    {formatDate(p.createdAt)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {data && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </DataState>
      </TableWrap>
    </Page>
  );
}

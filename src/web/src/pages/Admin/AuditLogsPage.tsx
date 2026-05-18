import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { auditLogs as auditLogsApi, type AuditLogEntry, type AuditLogsResponse } from '../../api/client';

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: 1.4rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Btn = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
`;

const Th = styled.th`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  text-align: left;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Pagination = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const PageBtn = styled.button<{ $active?: boolean }>`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.surface};
  color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.text};
  cursor: pointer;
  font-size: 0.8rem;
`;

export function AuditLogsPage() {
  const [response, setResponse] = useState<AuditLogsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setResponse(await auditLogsApi.getAll({ page, limit: 50 })); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const items: AuditLogEntry[] = response?.items ?? [];

  return (
    <Page>
      <Header>
        <Title><ClipboardList size={22} /> Журнал аудита</Title>
        <Btn onClick={load}><RefreshCw size={14} /></Btn>
      </Header>

      {loading ? <Empty>Загрузка...</Empty> : items.length === 0 ? <Empty>Записей нет</Empty> : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Дата</Th>
                <Th>Пользователь</Th>
                <Th>Действие</Th>
                <Th>Объект</Th>
                <Th>ID объекта</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id}>
                  <Td>{format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm')}</Td>
                  <Td>{log.user?.fullName ?? log.userId}</Td>
                  <Td>{log.action}</Td>
                  <Td>{log.entity}</Td>
                  <Td style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{log.entityId.slice(0, 8)}…</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          {response && response.pages > 1 && (
            <Pagination>
              {Array.from({ length: response.pages }, (_, i) => i + 1).map((p) => (
                <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
              ))}
            </Pagination>
          )}
        </>
      )}
    </Page>
  );
}

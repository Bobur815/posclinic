import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { UserCog, Plus, RefreshCw, Pencil } from 'lucide-react';
import { users as usersApi, type UserRecord } from '../../api/client';

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

const Actions = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.sm};`;

const Btn = styled.button<{ $variant?: 'primary' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) => $variant === 'primary' ? 'transparent' : theme.colors.border};
  background: ${({ $variant, theme }) => $variant === 'primary' ? theme.colors.primary : theme.colors.surface};
  color: ${({ $variant, theme }) => $variant === 'primary' ? '#fff' : theme.colors.text};
  &:hover { opacity: 0.85; }
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
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const RoleBadge = styled.span`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${({ theme }) => theme.colors.primary}20;
  color: ${({ theme }) => theme.colors.primary};
`;

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Платформа',
  SUPERADMIN: 'Владелец',
  ADMIN: 'Администратор',
  NURSE: 'Медработник',
  PATIENT: 'Пациент',
};

export function UserList() {
  const navigate = useNavigate();
  const [data, setData] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await usersApi.getAll()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <Header>
        <Title><UserCog size={22} /> Пользователи</Title>
        <Actions>
          <Btn onClick={load}><RefreshCw size={14} /></Btn>
          <Btn $variant="primary" onClick={() => navigate('/users/new')}><Plus size={14} /> Добавить</Btn>
        </Actions>
      </Header>

      {loading ? <Empty>Загрузка...</Empty> : data.length === 0 ? <Empty>Нет пользователей</Empty> : (
        <Table>
          <thead>
            <tr>
              <Th>Имя</Th>
              <Th>Email</Th>
              <Th>Роль</Th>
              <Th>Статус</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <Td>{u.firstName} {u.lastName}</Td>
                <Td>{u.email}</Td>
                <Td><RoleBadge>{ROLE_LABELS[u.role] ?? u.role}</RoleBadge></Td>
                <Td>{u.isActive ? 'Активен' : 'Неактивен'}</Td>
                <Td><Btn onClick={() => navigate(`/users/${u.id}/edit`)}><Pencil size={14} /></Btn></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}

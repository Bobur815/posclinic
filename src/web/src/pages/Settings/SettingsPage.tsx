import { NavLink, Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Settings } from 'lucide-react';

const Page = styled.div``;

const Title = styled.h1`
  font-size: 1.4rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Tabs = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Tab = styled(NavLink)`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  text-decoration: none;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;

  &.active {
    color: ${({ theme }) => theme.colors.primary};
    border-bottom-color: ${({ theme }) => theme.colors.primary};
    font-weight: 500;
  }
`;

export function SettingsPage() {
  return (
    <Page>
      <Title><Settings size={22} /> Настройки</Title>
      <Tabs>
        <Tab to="/settings/system">Система</Tab>
        <Tab to="/settings/user">Профиль</Tab>
        <Tab to="/settings/devices">Терминалы</Tab>
      </Tabs>
      <Outlet />
    </Page>
  );
}

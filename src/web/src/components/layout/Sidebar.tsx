import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import styled, { css } from 'styled-components';
import {
  CalendarDays,
  Users,
  Stethoscope,
  Layers,
  BarChart2,
  Settings,
  Building2,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ClipboardList,
  UserCog,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth-store';
import { BRAND_NAME } from '../../branding/constants';

const EXPANDED = 220;
const COLLAPSED = 64;

const Nav = styled.nav<{ $collapsed: boolean }>`
  width: ${({ $collapsed }) => ($collapsed ? COLLAPSED : EXPANDED)}px;
  min-width: ${({ $collapsed }) => ($collapsed ? COLLAPSED : EXPANDED)}px;
  height: 100vh;
  background: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease;
  overflow: hidden;

  @media (max-width: 768px) {
    display: none;
  }
`;

const Logo = styled.div<{ $collapsed: boolean }>`
  padding: ${({ theme }) => theme.spacing.md};
  font-weight: 700;
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
  overflow: hidden;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  height: 56px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const NavItems = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.sm} 0;
`;

const navLinkStyle = css<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  font-size: 0.875rem;
  white-space: nowrap;
  border-radius: 6px;
  margin: 2px ${({ theme }) => theme.spacing.sm};
  transition: background 0.15s, color 0.15s;
  overflow: hidden;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
  }

  &.active {
    background: ${({ theme }) => theme.colors.primary}18;
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 500;
  }

  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
  }
`;

const StyledNavLink = styled(NavLink)<{ $collapsed: boolean }>`${navLinkStyle}`;

const SectionLabel = styled.div<{ $collapsed: boolean }>`
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 0.7)};
  overflow: hidden;
  white-space: nowrap;
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const CollapseBtn = styled.button<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-end')};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: none;
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  width: 100%;

  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const UserSection = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const UserName = styled.div<{ $collapsed: boolean }>`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  white-space: nowrap;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  height: ${({ $collapsed }) => ($collapsed ? 0 : 'auto')};
  transition: opacity 0.15s;
`;

const LogoutBtn = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.error};
  cursor: pointer;
  font-size: 0.8rem;
  padding: 4px 0;

  &:hover { opacity: 0.8; }
  svg { width: 16px; height: 16px; }
`;

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isClinicAdmin = user?.role === 'CLINIC_ADMIN';
  const isAdminOrAbove = isSuperAdmin || isClinicAdmin;

  const mainItems: NavItem[] = isSuperAdmin ? [] : [
    { to: '/appointments', label: 'Приёмы', icon: <CalendarDays /> },
    { to: '/patients', label: 'Пациенты', icon: <Users /> },
  ];

  const managementItems: NavItem[] = isClinicAdmin ? [
    { to: '/doctors', label: 'Врачи', icon: <Stethoscope /> },
    { to: '/services', label: 'Услуги', icon: <Layers /> },
  ] : [];

  const reportItems: NavItem[] = isClinicAdmin ? [
    { to: '/reports/daily', label: 'Сводка', icon: <BarChart2 /> },
    { to: '/reports/monthly', label: 'Ежемесячно', icon: <FileText /> },
  ] : [];

  const adminItems: NavItem[] = isAdminOrAbove ? [
    ...(isClinicAdmin ? [{ to: '/users', label: 'Пользователи', icon: <UserCog /> }] : []),
    { to: '/settings', label: 'Настройки', icon: <Settings /> },
  ] : [];

  const superAdminItems: NavItem[] = isSuperAdmin ? [
    { to: '/admin/clinics', label: 'Клиники', icon: <Building2 /> },
    { to: '/admin/audit-logs', label: 'Аудит', icon: <ClipboardList /> },
  ] : [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <StyledNavLink key={item.to} to={item.to} $collapsed={collapsed} title={collapsed ? item.label : undefined}>
        {item.icon}
        {!collapsed && item.label}
      </StyledNavLink>
    ));

  return (
    <Nav $collapsed={collapsed}>
      <Logo $collapsed={collapsed}>
        <Stethoscope size={20} />
        {!collapsed && BRAND_NAME}
      </Logo>

      <NavItems>
        {mainItems.length > 0 && (
          <>
            <SectionLabel $collapsed={collapsed}>Клиника</SectionLabel>
            {renderItems(mainItems)}
          </>
        )}

        {managementItems.length > 0 && (
          <>
            <SectionLabel $collapsed={collapsed}>Управление</SectionLabel>
            {renderItems(managementItems)}
          </>
        )}

        {reportItems.length > 0 && (
          <>
            <SectionLabel $collapsed={collapsed}>Отчёты</SectionLabel>
            {renderItems(reportItems)}
          </>
        )}

        {adminItems.length > 0 && (
          <>
            <SectionLabel $collapsed={collapsed}>Администрирование</SectionLabel>
            {renderItems(adminItems)}
          </>
        )}

        {superAdminItems.length > 0 && (
          <>
            <SectionLabel $collapsed={collapsed}>Супер Админ</SectionLabel>
            {renderItems(superAdminItems)}
          </>
        )}
      </NavItems>

      <UserSection>
        <UserName $collapsed={collapsed}>{user?.fullName}</UserName>
        <LogoutBtn onClick={handleLogout} title="Выйти">
          <LogOut />
          {!collapsed && 'Выйти'}
        </LogoutBtn>
      </UserSection>

      <CollapseBtn $collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Развернуть' : 'Свернуть'}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </CollapseBtn>
    </Nav>
  );
}

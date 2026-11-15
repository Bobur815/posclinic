import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  Stethoscope,
  BarChart2,
  Settings,
  UserCog,
  Plus,
  RefreshCw,
  ListOrdered,
  TestTube,
  KeyRound,
} from 'lucide-react';
import { useSidebar } from '../../context/SidebarContext';
import { useAuthStore } from '../../store/auth-store';
import { useMyDoctor } from '../../hooks/useMyDoctor';
import { APP_BAR_HEIGHT } from './AppBar';

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 56;

const SidebarWrapper = styled.nav<{ $collapsed: boolean }>`
  position: fixed;
  top: ${APP_BAR_HEIGHT}px;
  left: 0;
  bottom: 0;
  width: ${({ $collapsed }) => ($collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH)}px;
  background: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  z-index: 100;
`;

const NavSection = styled.div`
  padding: 8px 0;
`;

const SectionLabel = styled.div<{ $collapsed: boolean }>`
  padding: 4px 16px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  height: ${({ $collapsed }) => ($collapsed ? '4px' : 'auto')};
  transition: opacity 0.15s;
`;

const NavItem = styled(NavLink)<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  margin: 1px 6px;
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: none;
  }

  &.active {
    background: ${({ theme }) => theme.colors.primary}18;
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 600;
  }
`;

const NavItemBtn = styled.button<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  margin: 1px 6px;
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  transition: background 0.15s, color 0.15s;
  background: none;
  border: none;
  cursor: pointer;
  width: calc(100% - 12px);
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const ItemLabel = styled.span<{ $collapsed: boolean }>`
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  transition: opacity 0.15s;
  white-space: nowrap;
`;

const BottomSection = styled.div`
  margin-top: auto;
  padding: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const VersionText = styled.div<{ $collapsed: boolean }>`
  padding: 6px 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  transition: opacity 0.15s;
`;

interface NavItemConfig {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
  roles?: string[];
}

export function Sidebar() {
  const { t } = useTranslation();
  const { isCollapsed } = useSidebar();
  const { user } = useAuthStore();
  const location = useLocation();

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_ADMIN';
  // Doctors and nurses work from their queue; registration and money are reception's.
  const isClinical = user?.role === 'DOCTOR' || user?.role === 'NURSE';

  const lab = { to: '/lab', icon: <TestTube size={18} />, label: t('nav.lab') };
  // An admin (or receptionist) who also sees patients: their own queue next to the board.
  const myDoctor = useMyDoctor();
  const myQueue = {
    to: '/queue?mine=1',
    icon: <ListOrdered size={18} />,
    label: t('nav.myQueue'),
  };
  const mainItems: NavItemConfig[] =
    user?.role === 'NURSE'
      ? [lab, { to: '/queue', icon: <ListOrdered size={18} />, label: t('nav.queue') }]
      : isClinical
        ? [{ to: '/queue', icon: <ListOrdered size={18} />, label: t('nav.myQueue') }, lab]
        : [
            { to: '/', icon: <LayoutDashboard size={18} />, label: t('nav.dashboard'), exact: true },
            ...(myDoctor ? [myQueue] : []),
            { to: '/queue', icon: <ListOrdered size={18} />, label: t('nav.queue') },
            lab,
          ];

  const clinicItems: NavItemConfig[] = isClinical
    ? [
        { to: '/patients', icon: <Users size={18} />, label: t('nav.patients') },
        { to: '/settings/user', icon: <KeyRound size={18} />, label: t('nav.myAccount') },
      ]
    : [
    { to: '/patients', icon: <Users size={18} />, label: t('nav.patients') },
    { to: '/appointments', icon: <Calendar size={18} />, label: t('nav.appointments') },
    { to: '/services', icon: <ClipboardList size={18} />, label: t('nav.services') },
    { to: '/doctors', icon: <Stethoscope size={18} />, label: t('nav.doctors') },
  ];

  const reportItems: NavItemConfig[] = [
    { to: '/reports/daily', icon: <BarChart2 size={18} />, label: t('nav.dailyReport') },
  ];

  const adminItems: NavItemConfig[] = [
    { to: '/users', icon: <UserCog size={18} />, label: t('nav.users') },
    { to: '/settings', icon: <Settings size={18} />, label: t('nav.settings') },
  ];

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const renderItem = (item: NavItemConfig) => (
    <NavItem
      key={item.to}
      to={item.to}
      end={item.exact}
      $collapsed={isCollapsed}
      title={isCollapsed ? item.label : undefined}
    >
      {item.icon}
      <ItemLabel $collapsed={isCollapsed}>{item.label}</ItemLabel>
    </NavItem>
  );

  return (
    <SidebarWrapper $collapsed={isCollapsed}>
      <NavSection>
        <SectionLabel $collapsed={isCollapsed}>{t('nav.main')}</SectionLabel>
        {mainItems.map(renderItem)}
        {!isClinical && (
        <NavItemBtn
          $collapsed={isCollapsed}
          onClick={() => window.location.hash = '#/appointments/new'}
          title={isCollapsed ? t('nav.newAppointment') : undefined}
        >
          <Plus size={18} />
          <ItemLabel $collapsed={isCollapsed}>{t('nav.newAppointment')}</ItemLabel>
        </NavItemBtn>
        )}
      </NavSection>

      <NavSection>
        <SectionLabel $collapsed={isCollapsed}>{t('nav.management')}</SectionLabel>
        {clinicItems.map(renderItem)}
      </NavSection>

      {!isClinical && (
        <NavSection>
          <SectionLabel $collapsed={isCollapsed}>{t('nav.reports')}</SectionLabel>
          {reportItems.map(renderItem)}
        </NavSection>
      )}

      {isAdmin && (
        <NavSection>
          <SectionLabel $collapsed={isCollapsed}>{t('common.actions')}</SectionLabel>
          {adminItems.map(renderItem)}
        </NavSection>
      )}

      <BottomSection>
        <VersionText $collapsed={isCollapsed}>v1.0.0</VersionText>
      </BottomSection>
    </SidebarWrapper>
  );
}

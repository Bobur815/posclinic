import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  BarChart3,
  CalendarRange,
  Layers,
  Stethoscope,
  UserCog,
  MonitorSmartphone,
  CreditCard,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Package,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { useSidebar } from '@context/SidebarContext';
import { BRAND_NAME } from '../../branding/constants';

const SIDEBAR_WIDTH = 230;
const MINI_SIDEBAR_WIDTH = 70;

interface NavEntry {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
}

interface NavGroup {
  title: string;
  items: NavEntry[];
}

const Container = styled.aside<{ $collapsed: boolean }>`
  width: ${({ $collapsed }) => ($collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH)}px;
  min-width: ${({ $collapsed }) => ($collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH)}px;
  height: 100%;
  flex-shrink: 0;
  background-color: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, min-width 0.3s ease;
  overflow: hidden;

  @media (max-width: 767px) {
    display: none;
  }
`;

const LogoSection = styled.div<{ $collapsed: boolean }>`
  padding: 0 ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'space-between')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  min-height: 60px;
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 19px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
  overflow: hidden;
`;

const ToggleButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  border-radius: 4px;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.sm};
  overflow-y: auto;
  overflow-x: hidden;
`;

const NavSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.div<{ $collapsed: boolean }>`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ $collapsed }) => ($collapsed ? '0' : '6px')};
  white-space: nowrap;
  overflow: hidden;
  opacity: ${({ $collapsed }) => ($collapsed ? 0 : 1)};
  max-height: ${({ $collapsed }) => ($collapsed ? '0' : '20px')};
  transition: opacity 0.2s ease, max-height 0.3s ease;
`;

const StyledNavLink = styled(NavLink)<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: 9px ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius};
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
  margin-bottom: 2px;
  justify-content: ${({ $collapsed }) => ($collapsed ? 'center' : 'flex-start')};
  transition: background 0.15s, color 0.15s;

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
    text-decoration: none;
  }

  &.active {
    background-color: ${({ theme }) => theme.colors.primary}20;
    color: ${({ theme }) => theme.colors.primary};
    font-weight: 500;
  }

  svg {
    width: 19px;
    height: 19px;
    flex-shrink: 0;
  }
`;

const MobileBottomNav = styled.nav`
  display: none;

  @media (max-width: 767px) {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: ${({ theme }) => theme.colors.surface};
    border-top: 1px solid ${({ theme }) => theme.colors.border};
    z-index: 100;
    padding: 6px 0;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
`;

const MobileNavItem = styled(NavLink)`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  min-width: 0;

  &.active {
    color: ${({ theme }) => theme.colors.primary};
  }
  &:hover {
    text-decoration: none;
  }

  span {
    font-size: 10px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export function useNavGroups(): NavGroup[] {
  const { t } = useTranslation();
  return [
    {
      title: t('nav.clinic'),
      items: [
        { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
        { to: '/appointments', icon: CalendarDays, label: t('nav.appointments') },
        { to: '/patients', icon: Users, label: t('nav.patients') },
      ],
    },
    {
      title: t('nav.reports'),
      items: [
        { to: '/reports/daily', icon: BarChart3, label: t('nav.dailyReport') },
        { to: '/reports/monthly', icon: CalendarRange, label: t('nav.monthlyReport') },
        { to: '/reports/finance', icon: Landmark, label: t('nav.financeReport') },
      ],
    },
    {
      title: t('nav.stockGroup'),
      items: [
        { to: '/stock', icon: Package, label: t('nav.stock') },
        { to: '/expenses', icon: Receipt, label: t('nav.expenses') },
      ],
    },
    {
      title: t('nav.management'),
      items: [
        { to: '/services', icon: Layers, label: t('nav.services') },
        { to: '/doctors', icon: Stethoscope, label: t('nav.doctors') },
        { to: '/staff', icon: UserCog, label: t('nav.staff') },
      ],
    },
    {
      title: t('nav.system'),
      items: [
        { to: '/devices', icon: MonitorSmartphone, label: t('nav.devices') },
        { to: '/subscription', icon: CreditCard, label: t('nav.subscription') },
        { to: '/audit', icon: ScrollText, label: t('nav.audit') },
        { to: '/settings', icon: Settings, label: t('nav.settings') },
      ],
    },
  ];
}

export function Sidebar() {
  const { t } = useTranslation();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const groups = useNavGroups();

  const mobile: NavEntry[] = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
    { to: '/appointments', icon: CalendarDays, label: t('nav.appointments') },
    { to: '/patients', icon: Users, label: t('nav.patients') },
    { to: '/reports/daily', icon: BarChart3, label: t('nav.reports') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <>
      <Container $collapsed={isCollapsed}>
        <LogoSection $collapsed={isCollapsed}>
          {!isCollapsed && (
            <Logo>
              <Stethoscope size={22} />
              {BRAND_NAME}
            </Logo>
          )}
          <ToggleButton
            onClick={toggleSidebar}
            title={isCollapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={isCollapsed ? t('nav.expand') : t('nav.collapse')}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </ToggleButton>
        </LogoSection>

        <Nav>
          {groups.map((g) => (
            <NavSection key={g.title}>
              <SectionTitle $collapsed={isCollapsed}>{g.title}</SectionTitle>
              {g.items.map(({ to, icon: Icon, label, end }) => (
                <StyledNavLink key={to} to={to} end={end} $collapsed={isCollapsed} title={isCollapsed ? label : undefined}>
                  <Icon />
                  {!isCollapsed && label}
                </StyledNavLink>
              ))}
            </NavSection>
          ))}
        </Nav>
      </Container>

      <MobileBottomNav>
        {mobile.map(({ to, icon: Icon, label, end }) => (
          <MobileNavItem key={to} to={to} end={end}>
            <Icon size={20} />
            <span>{label}</span>
          </MobileNavItem>
        ))}
      </MobileBottomNav>
    </>
  );
}

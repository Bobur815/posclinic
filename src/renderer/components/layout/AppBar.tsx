import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Menu, X, Sun, Moon, LogOut, User, Stethoscope } from 'lucide-react';
import { useSidebar } from '../../context/SidebarContext';
import { useAuthStore } from '../../store/auth-store';
import { useTheme } from '../../theme/ThemeProvider';
import { useNavigate } from 'react-router-dom';

export const APP_BAR_HEIGHT = 48;

const Bar = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: ${APP_BAR_HEIGHT}px;
  z-index: 200;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: none;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:active { transform: scale(0.9); }
`;

const BrandWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const BrandIcon = styled.div`
  width: 28px;
  height: 28px;
  background: ${({ theme }) => theme.colors.primary};
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const BrandName = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  white-space: nowrap;
  letter-spacing: 0.5px;
`;

const Spacer = styled.div`
  flex: 1;
`;

const LangBtn = styled.button<{ $active: boolean }>`
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary + '18' : 'none')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Divider = styled.div`
  width: 1px;
  height: 24px;
  background: ${({ theme }) => theme.colors.border};
  flex-shrink: 0;
`;

/**
 * The signed-in person; opens My account. A real button with the theme's colours: without its own
 * background and colour it took the browser's light-grey button face, unreadable in dark mode.
 */
const UserChip = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  font: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    border-color: ${({ theme }) => theme.colors.border};
    color: ${({ theme }) => theme.colors.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`;

const UserName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
`;

const RoleBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primary}20;
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
`;

export function AppBar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { user, logout } = useAuthStore();
  const { mode, toggleTheme } = useTheme();
  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <Bar>
      <IconBtn onClick={toggleSidebar} title={isCollapsed ? t('nav.expand') : t('nav.collapse')}>
        {isCollapsed ? <Menu size={20} /> : <X size={20} />}
      </IconBtn>

      <BrandWrapper>
        <BrandIcon>
          <Stethoscope size={16} />
        </BrandIcon>
        <BrandName>POSCLINIC</BrandName>
      </BrandWrapper>

      <Spacer />

      <LangBtn $active={i18n.language === 'uz'} onClick={() => changeLanguage('uz')}>UZ</LangBtn>
      <LangBtn $active={i18n.language === 'ru'} onClick={() => changeLanguage('ru')}>RU</LangBtn>

      <Divider />

      <IconBtn onClick={toggleTheme} title={mode === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}>
        {mode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </IconBtn>

      <Divider />

      {user && (
        <UserChip
          type="button"
          onClick={() => navigate('/settings/user')}
          title={t('nav.myAccount')}
        >
          <User size={15} />
          <UserName>{user.fullName}</UserName>
          <RoleBadge>{t(`staff.roles.${user.role}`, user.role)}</RoleBadge>
        </UserChip>
      )}

      <IconBtn onClick={handleLogout} title={t('auth.logout')}>
        <LogOut size={17} />
      </IconBtn>
    </Bar>
  );
}

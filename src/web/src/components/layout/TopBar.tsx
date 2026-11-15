import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Building2, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from '@theme/ThemeProvider';
import { useAuthStore } from '../../store/auth-store';
import { setLanguage, type Language } from '../../i18n';
import { useNavGroups } from './Sidebar';

const Bar = styled.header`
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  position: sticky;
  top: 0;
  z-index: 50;
`;

const ClinicName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  svg {
    color: ${({ theme }) => theme.colors.primary};
    flex-shrink: 0;
  }
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
  svg {
    width: 18px;
    height: 18px;
  }
`;

const MenuBtn = styled(IconBtn)`
  display: none;
  @media (max-width: 767px) {
    display: flex;
  }
`;

const LangSwitch = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const LangBtn = styled.button<{ $active: boolean }>`
  padding: 0 10px;
  height: 34px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.textSecondary)};
`;

const UserBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.2;
  font-size: 13px;

  small {
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: 11px;
  }

  @media (max-width: 767px) {
    display: none;
  }
`;

const Drawer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
`;

const DrawerPanel = styled.nav`
  width: 270px;
  max-width: 85vw;
  height: 100%;
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.md};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;

  h3 {
    margin: 12px 0 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: ${({ theme }) => theme.colors.textSecondary};
  }

  a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 8px;
    border-radius: ${({ theme }) => theme.borderRadius};
    color: ${({ theme }) => theme.colors.text};
    text-decoration: none;
  }
  a.active {
    background: ${({ theme }) => theme.colors.primary}20;
    color: ${({ theme }) => theme.colors.primary};
  }
  svg {
    width: 18px;
    height: 18px;
  }
`;

export function TopBar() {
  const { t, i18n } = useTranslation();
  const { mode, toggleTheme } = useTheme();
  const { user, clinic, logout } = useAuthStore();
  const navigate = useNavigate();
  const groups = useNavGroups();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <Bar>
        <Right>
          <MenuBtn onClick={() => setMenuOpen(true)} aria-label={t('nav.menu')}>
            <Menu />
          </MenuBtn>
          <ClinicName>
            <Building2 size={18} />
            <span>{clinic?.name ?? '—'}</span>
          </ClinicName>
        </Right>

        <Right>
          <LangSwitch>
            {(['uz', 'ru'] as Language[]).map((l) => (
              <LangBtn key={l} $active={i18n.language === l} onClick={() => setLanguage(l)}>
                {l.toUpperCase()}
              </LangBtn>
            ))}
          </LangSwitch>
          <IconBtn
            onClick={toggleTheme}
            title={mode === 'dark' ? t('settings.lightTheme') : t('settings.darkTheme')}
            aria-label={mode === 'dark' ? t('settings.lightTheme') : t('settings.darkTheme')}
          >
            {mode === 'dark' ? <Sun /> : <Moon />}
          </IconBtn>
          <UserBox>
            <strong>{user?.fullName}</strong>
            <small>{user ? t(`roles.${user.role}`) : ''}</small>
          </UserBox>
          <IconBtn onClick={handleLogout} title={t('auth.logout')} aria-label={t('auth.logout')}>
            <LogOut />
          </IconBtn>
        </Right>
      </Bar>

      {menuOpen && (
        <Drawer onClick={() => setMenuOpen(false)}>
          <DrawerPanel onClick={(e) => e.stopPropagation()}>
            <Right style={{ justifyContent: 'space-between' }}>
              <strong>{t('nav.menu')}</strong>
              <IconBtn onClick={() => setMenuOpen(false)} aria-label={t('common.close')}>
                <X />
              </IconBtn>
            </Right>
            {groups.map((g) => (
              <div key={g.title}>
                <h3>{g.title}</h3>
                {g.items.map(({ to, icon: Icon, label, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}>
                    <Icon />
                    {label}
                  </NavLink>
                ))}
              </div>
            ))}
          </DrawerPanel>
        </Drawer>
      )}
    </>
  );
}

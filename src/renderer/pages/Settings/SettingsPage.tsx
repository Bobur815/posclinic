import { ArrowLeft, KeyRound, UserCog } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { followLan, useIsSatellite } from '../../store/lan-store';
import { SETTINGS_SECTIONS } from './settings-sections';

/**
 * Settings, divided into sections as posgro: a grid of tiles, each opening its own page
 * (/settings/<section>, SettingsSectionPage). Staff and the signed-in person's own account keep
 * their own pages. Admins only (route-guarded in App.tsx; main enforces every change).
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSatellite = useIsSatellite();
  useEffect(() => {
    followLan();
  }, []);

  const tiles = [
    ...SETTINGS_SECTIONS.filter((s) => !(s.mainOnly && isSatellite)).map((s) => ({
      key: s.key,
      icon: s.icon,
      title: t(s.title),
      description: t(s.description),
      path: `/settings/${s.key}`,
    })),
    {
      key: 'users',
      icon: <UserCog size={30} />,
      title: t('nav.users'),
      description: t('settings.tiles.users'),
      path: '/users',
    },
    {
      key: 'account',
      icon: <KeyRound size={30} />,
      title: t('nav.myAccount'),
      description: t('settings.tiles.account'),
      path: '/settings/user',
    },
  ];

  return (
    <Page>
      <Title>{t('settings.title')}</Title>
      <Grid>
        {tiles.map((tile) => (
          <Tile key={tile.key} type="button" onClick={() => navigate(tile.path)}>
            <Icon>{tile.icon}</Icon>
            <TileTitle>{tile.title}</TileTitle>
            <TileDesc>{tile.description}</TileDesc>
          </Tile>
        ))}
      </Grid>
    </Page>
  );
}

/** One settings section on its own page, with the way back to the tiles. */
export function SettingsSectionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { section } = useParams<{ section: string }>();
  const isSatellite = useIsSatellite();
  useEffect(() => {
    followLan();
  }, []);

  const found = SETTINGS_SECTIONS.find((s) => s.key === section);
  if (!found || (found.mainOnly && isSatellite)) return <Navigate to="/settings" replace />;
  const Section = found.component;

  return (
    <SectionPage>
      <Back type="button" onClick={() => navigate('/settings')}>
        <ArrowLeft size={14} />
        {t('settings.title')}
      </Back>
      <Section />
    </SectionPage>
  );
}

const Page = styled.div`
  max-width: 1100px;
`;
const SectionPage = styled.div`
  max-width: 760px;
`;
const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;
const Tile = styled.button`
  display: grid;
  align-content: start;
  gap: 6px;
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: left;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  &:hover,
  &:focus-visible {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary};
    outline: none;
  }
`;
const Icon = styled.div`
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: 6px;
`;
const TileTitle = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;
const TileDesc = styled.span`
  font-size: 13px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const Back = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  padding: 0;
  border: 0;
  background: none;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 13px;
  cursor: pointer;
`;

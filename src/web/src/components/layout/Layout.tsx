import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { SidebarProvider } from '@context/SidebarContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SubscriptionBanner } from './SubscriptionBanner';
import { clinicApi } from '../../api/client';
import { useAuthStore } from '../../store/auth-store';

/**
 * App shell: exactly one screen tall, never scrolled itself. The sidebar fills the height and
 * the top bar keeps its size; only <Content> scrolls. (When the whole page scrolled, the sticky
 * sidebar slid away and the top bar was squeezed by its flex column.)
 */
const Container = styled.div`
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
`;

const Content = styled.main`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: ${({ theme }) => theme.spacing.lg};
  min-width: 0;

  @media (max-width: 767px) {
    padding: ${({ theme }) => theme.spacing.sm};
    padding-bottom: calc(${({ theme }) => theme.spacing.sm} + 64px + env(safe-area-inset-bottom, 0px));
  }
`;

export function Layout() {
  const setClinic = useAuthStore((s) => s.setClinic);

  // Plan and expiry change in posgro; refresh them once per visit.
  useEffect(() => {
    clinicApi
      .get()
      .then(({ id, name, plan, expiresAt }) => setClinic({ id, name, plan, expiresAt }))
      .catch(() => {
        /* keep the values from login */
      });
  }, [setClinic]);

  return (
    <SidebarProvider>
      <Container>
        <Sidebar />
        <Main>
          <TopBar />
          <SubscriptionBanner />
          <Content>
            <Outlet />
          </Content>
        </Main>
      </Container>
    </SidebarProvider>
  );
}

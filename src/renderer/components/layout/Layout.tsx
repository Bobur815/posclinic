import React from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { AppBar, APP_BAR_HEIGHT } from './AppBar';
import { LicenseBanner } from './LicenseBanner';
import { Sidebar } from './Sidebar';
import { SidebarProvider, useSidebar } from '../../context/SidebarContext';

const SIDEBAR_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 56;

const Main = styled.main<{ $collapsed: boolean }>`
  margin-top: ${APP_BAR_HEIGHT}px;
  margin-left: ${({ $collapsed }) => ($collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH)}px;
  padding: 24px;
  min-height: calc(100vh - ${APP_BAR_HEIGHT}px);
  transition: margin-left 0.2s ease;
  background: ${({ theme }) => theme.colors.background};
`;

function LayoutContent() {
  const { isCollapsed } = useSidebar();

  return (
    <>
      <AppBar />
      <Sidebar />
      <Main $collapsed={isCollapsed}>
        <LicenseBanner />
        <Outlet />
      </Main>
    </>
  );
}

export function Layout() {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
}

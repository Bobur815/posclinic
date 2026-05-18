import styled from 'styled-components';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const Wrapper = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.background};
`;

const Content = styled.main`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg};

  @media (max-width: 768px) {
    padding: ${({ theme }) => theme.spacing.md};
    padding-bottom: 80px;
  }
`;

export function Layout() {
  return (
    <Wrapper>
      <Sidebar />
      <Content>
        <Outlet />
      </Content>
    </Wrapper>
  );
}

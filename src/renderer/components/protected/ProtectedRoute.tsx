import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string[];
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, sessionRestored, restoreSession, user } = useAuthStore();
  const location = useLocation();
  const [isRestoring, setIsRestoring] = useState(!sessionRestored);

  useEffect(() => {
    const restore = async () => {
      await restoreSession();
      setIsRestoring(false);
    };
    restore();
  }, [restoreSession]);

  if (isRestoring) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user && !requiredRole.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

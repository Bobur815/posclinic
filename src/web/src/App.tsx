import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth-store';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/Login/LoginPage';
import { RegisterPage } from './pages/Auth/RegisterPage';
import { AppointmentList } from './pages/Appointments/AppointmentList';
import { PatientList } from './pages/Patients/PatientList';
import { PatientDetails } from './pages/Patients/PatientDetails';
import { DoctorList } from './pages/Doctors/DoctorList';
import { ServiceList } from './pages/Services/ServiceList';
import { DailySummary } from './pages/Reports/DailySummary';
import { MonthlyReport } from './pages/Reports/MonthlyReport';
import { UserList } from './pages/Users/UserList';
import { UserForm } from './pages/Users/UserForm';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { SystemSettings } from './pages/Settings/SystemSettings';
import { UserSettings } from './pages/Settings/UserSettings';
import { DevicesPage } from './pages/Settings/DevicesPage';
import { ClinicList } from './pages/Admin/ClinicList';
import { AuditLogsPage } from './pages/Admin/AuditLogsPage';

function PrivateRoute({
  children,
  clinicAdminOnly = false,
  superAdminOnly = false,
  excludeSuperAdmin = false,
}: {
  children: React.ReactNode;
  clinicAdminOnly?: boolean;
  superAdminOnly?: boolean;
  excludeSuperAdmin?: boolean;
}) {
  const { isAuthenticated, user, sessionRestored } = useAuthStore();

  if (!sessionRestored) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (superAdminOnly && user?.role !== 'PLATFORM_ADMIN') return <Navigate to="/" replace />;
  if (clinicAdminOnly && user?.role !== 'ADMIN' && user?.role !== 'SUPERADMIN' && user?.role !== 'PLATFORM_ADMIN')
    return <Navigate to="/" replace />;
  if (excludeSuperAdmin && user?.role === 'PLATFORM_ADMIN')
    return <Navigate to="/admin/clinics" replace />;

  return <>{children}</>;
}

function IndexRedirect() {
  const { user } = useAuthStore();
  return <Navigate to={user?.role === 'PLATFORM_ADMIN' ? '/admin/clinics' : '/appointments'} replace />;
}

export function App() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <BrowserRouter basename="/web">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<IndexRedirect />} />

          {/* Appointments (all clinic roles) */}
          <Route path="appointments" element={<PrivateRoute excludeSuperAdmin><AppointmentList /></PrivateRoute>} />

          {/* Patients (all clinic roles) */}
          <Route path="patients" element={<PrivateRoute excludeSuperAdmin><PatientList /></PrivateRoute>} />
          <Route path="patients/:id" element={<PrivateRoute excludeSuperAdmin><PatientDetails /></PrivateRoute>} />

          {/* Doctors (clinic admin only) */}
          <Route path="doctors" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><DoctorList /></PrivateRoute>} />

          {/* Services (clinic admin only) */}
          <Route path="services" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><ServiceList /></PrivateRoute>} />

          {/* Reports (clinic admin only) */}
          <Route path="reports/daily" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><DailySummary /></PrivateRoute>} />
          <Route path="reports/monthly" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><MonthlyReport /></PrivateRoute>} />

          {/* Users (clinic admin only) */}
          <Route path="users" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><UserList /></PrivateRoute>} />
          <Route path="users/new" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><UserForm /></PrivateRoute>} />
          <Route path="users/:id/edit" element={<PrivateRoute clinicAdminOnly excludeSuperAdmin><UserForm /></PrivateRoute>} />

          {/* Settings */}
          <Route path="settings" element={<PrivateRoute clinicAdminOnly><SettingsPage /></PrivateRoute>} />
          <Route path="settings/system" element={<PrivateRoute clinicAdminOnly><SystemSettings /></PrivateRoute>} />
          <Route path="settings/user" element={<UserSettings />} />
          <Route path="settings/devices" element={<DevicesPage />} />

          {/* Audit logs (clinic admin: own clinic; super admin: all) */}
          <Route path="admin/audit-logs" element={<PrivateRoute clinicAdminOnly><AuditLogsPage /></PrivateRoute>} />

          {/* Super Admin */}
          <Route path="admin/clinics" element={<PrivateRoute superAdminOnly><ClinicList /></PrivateRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isSignedIn, useAuthStore } from './store/auth-store';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/Login/LoginPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { AppointmentList } from './pages/Appointments/AppointmentList';
import { PatientList } from './pages/Patients/PatientList';
import { PatientDetails } from './pages/Patients/PatientDetails';
import { DailySummary } from './pages/Reports/DailySummary';
import { MonthlyReport } from './pages/Reports/MonthlyReport';
import { ExpensesPage } from './pages/Stock/ExpensesPage';
import { FinanceReport } from './pages/Stock/FinanceReport';
import { StockPage } from './pages/Stock/StockPage';
import { ServiceList } from './pages/Services/ServiceList';
import { DoctorList } from './pages/Doctors/DoctorList';
import { UserList } from './pages/Users/UserList';
import { DevicesPage } from './pages/Devices/DevicesPage';
import { SubscriptionPage } from './pages/Subscription/SubscriptionPage';
import { AuditLogPage } from './pages/Audit/AuditLogPage';
import { SettingsPage } from './pages/Settings/SettingsPage';

/** Only clinic admins can sign in (the server refuses other roles), so one gate is enough. */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const signedIn = useAuthStore(isSignedIn);
  const sessionRestored = useAuthStore((s) => s.sessionRestored);
  if (!sessionRestored) return null;
  if (!signedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <BrowserRouter basename="/web">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="appointments" element={<AppointmentList />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/:id" element={<PatientDetails />} />
          <Route path="reports" element={<Navigate to="/reports/daily" replace />} />
          <Route path="reports/daily" element={<DailySummary />} />
          <Route path="reports/monthly" element={<MonthlyReport />} />
          <Route path="reports/finance" element={<FinanceReport />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="services" element={<ServiceList />} />
          <Route path="doctors" element={<DoctorList />} />
          <Route path="staff" element={<UserList />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

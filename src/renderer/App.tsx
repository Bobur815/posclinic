import React, { useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/protected/ProtectedRoute';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { WaitingForMain } from './components/layout/WaitingForMain';
import { useAuthStore } from './store/auth-store';

// Pages
import { LoginPage } from './pages/Login/LoginPage';
import { SetupWizard } from './pages/Setup/SetupWizard';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { PatientList } from './pages/Patients/PatientList';
import { PatientForm } from './pages/Patients/PatientForm';
import { PatientDetails } from './pages/Patients/PatientDetails';
import { AppointmentList } from './pages/Appointments/AppointmentList';
import { RegisterVisitPage } from './pages/Appointments/RegisterVisitPage';
import { AppointmentDetails } from './pages/Appointments/AppointmentDetails';
import { CheckoutPage } from './pages/Appointments/CheckoutPage';
import { ServiceList } from './pages/Services/ServiceList';
import { DoctorList } from './pages/Doctors/DoctorList';
import { DailyReport } from './pages/Reports/DailyReport';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { UserSettingsPage } from './pages/Settings/UserSettingsPage';

function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [showExitConfirm, setShowExitConfirm] = React.useState(false);

  useEffect(() => {
    const cleanup = window.electronAPI?.app?.onCloseRequested(() => {
      setShowExitConfirm(true);
    });
    return cleanup;
  }, []);

  const handleConfirmExit = useCallback(() => {
    window.electronAPI?.app?.confirmClose();
  }, []);

  return (
    <>
      <WaitingForMain />
      {showExitConfirm && (
        <ConfirmDialog
          title={t('common.exitApp')}
          message={t('common.exitAppConfirm')}
          confirmLabel={t('common.exit')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={handleConfirmExit}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          }
        />
        <Route path="/setup" element={<SetupWizard />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/new" element={<PatientForm />} />
          <Route path="patients/:id" element={<PatientDetails />} />
          <Route path="patients/:id/edit" element={<PatientForm />} />
          <Route path="appointments" element={<AppointmentList />} />
          <Route path="appointments/new" element={<RegisterVisitPage />} />
          <Route path="appointments/:id" element={<AppointmentDetails />} />
          <Route path="appointments/:id/checkout" element={<CheckoutPage />} />
          <Route path="services" element={<ServiceList />} />
          <Route
            path="doctors"
            element={
              <ProtectedRoute requiredRole={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <DoctorList />
              </ProtectedRoute>
            }
          />
          <Route path="reports/daily" element={<DailyReport />} />
          <Route
            path="settings"
            element={
              <ProtectedRoute requiredRole={['SUPER_ADMIN', 'CLINIC_ADMIN']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="settings/user" element={<UserSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;

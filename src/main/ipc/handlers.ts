import { setupAddressHandlers } from './address-handlers';
import { setupAuthHandlers } from './auth-handlers';
import { setupCareHandlers } from './care-handlers';
import { setupClinicHandlers } from './clinic-handlers';
import { setupPatientHandlers } from './patient-handlers';
import { setupDoctorHandlers } from './doctor-handlers';
import { setupServiceHandlers } from './service-handlers';
import { setupAppointmentHandlers } from './appointment-handlers';
import { setupPrintHandlers } from './print-handlers';

export function setupIpcHandlers(): void {
  setupAuthHandlers();
  setupPatientHandlers();
  setupAddressHandlers();
  setupDoctorHandlers();
  setupServiceHandlers();
  setupAppointmentHandlers();
  setupClinicHandlers();
  setupCareHandlers();
  setupPrintHandlers();
}

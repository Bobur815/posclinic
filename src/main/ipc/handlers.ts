import { setupAddressHandlers } from './address-handlers';
import { setupAuthHandlers } from './auth-handlers';
import { setupCareHandlers } from './care-handlers';
import { setupClinicHandlers } from './clinic-handlers';
import { setupLabHandlers } from './lab-handlers';
import { setupStaffHandlers } from './staff-handlers';
import { setupTypesHandlers } from './types-handlers';
import { setupPatientHandlers } from './patient-handlers';
import { setupDoctorHandlers } from './doctor-handlers';
import { setupServiceHandlers } from './service-handlers';
import { setupAppointmentHandlers } from './appointment-handlers';
import { setupPrintHandlers } from './print-handlers';
import { setupShiftHandlers } from './shift-handlers';
import { setupFiscalHandlers } from './fiscal-handlers';

export function setupIpcHandlers(): void {
  setupAuthHandlers();
  setupPatientHandlers();
  setupAddressHandlers();
  setupDoctorHandlers();
  setupServiceHandlers();
  setupAppointmentHandlers();
  setupClinicHandlers();
  setupCareHandlers();
  setupLabHandlers();
  setupStaffHandlers();
  setupTypesHandlers();
  setupPrintHandlers();
  setupShiftHandlers();
  setupFiscalHandlers();
}

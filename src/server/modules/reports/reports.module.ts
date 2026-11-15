import { Module } from '@nestjs/common';
import { AppointmentsController } from '../appointments/appointments.controller';
import { ClinicController } from '../clinic/clinic.controller';
import { PatientsController } from '../patients/patients.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Read-only dashboard APIs: clinic, summary, patients, appointments, reports. */
@Module({
  controllers: [ClinicController, PatientsController, AppointmentsController, ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}

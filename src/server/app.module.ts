import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ServicesModule } from './modules/services/services.module';
import { SyncModule } from './modules/sync/sync.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ClinicsModule,
    PatientsModule,
    DoctorsModule,
    ServicesModule,
    AppointmentsModule,
    SyncModule,
  ],
})
export class AppModule {}

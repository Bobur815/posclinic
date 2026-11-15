import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  PatientDetailResponse,
  PatientListResponse,
  PatientMutationResponse,
} from '../../common/interfaces';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

interface ClinicRequest {
  user: { tenantId: string; clinicId: string };
}

@ApiTags('patients')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'List patients, optionally search by name / phone / code' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  findAll(
    @Request() req: ClinicRequest,
    @Query('search') search?: string,
  ): Promise<PatientListResponse> {
    return this.patientsService.findAll(req.user.clinicId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient with last 20 appointments' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  findById(@Param('id') id: string): Promise<PatientDetailResponse> {
    return this.patientsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new patient (auto-generates patient code)' })
  @ApiResponse({ status: 201, description: 'Patient created' })
  create(
    @Request() req: ClinicRequest,
    @Body() dto: CreatePatientDto,
  ): Promise<PatientMutationResponse> {
    return this.patientsService.create(req.user.clinicId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update patient record' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto): Promise<PatientMutationResponse> {
    return this.patientsService.update(id, dto);
  }
}

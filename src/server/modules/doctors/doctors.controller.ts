import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { DoctorDetailResponse, DoctorListResponse } from '../../common/interfaces';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

interface ClinicRequest {
  user: { tenantId: string; clinicId: string };
}

@ApiTags('doctors')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({ summary: 'List all doctors in the clinic' })
  findAll(@Request() req: ClinicRequest): Promise<DoctorListResponse> {
    return this.doctorsService.findAll(req.user.clinicId);
  }

  @Get('active')
  @ApiOperation({ summary: 'List only active doctors (used for appointment dropdowns)' })
  findActive(@Request() req: ClinicRequest): Promise<DoctorListResponse> {
    return this.doctorsService.findActive(req.user.clinicId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get doctor by ID' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  findById(@Param('id') id: string): Promise<DoctorDetailResponse> {
    return this.doctorsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new doctor to the clinic' })
  @ApiResponse({ status: 201, description: 'Doctor created' })
  create(
    @Request() req: ClinicRequest,
    @Body() dto: CreateDoctorDto,
  ): Promise<DoctorDetailResponse> {
    return this.doctorsService.create(req.user.clinicId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update doctor (toggle active, update specialty, etc.)' })
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto): Promise<DoctorDetailResponse> {
    return this.doctorsService.update(id, dto);
  }
}

import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { ClinicDetailResponse, ClinicListResponse } from '../../common/interfaces';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { ClinicsService } from './clinics.service';
import type { UpdateClinicDto } from './dto/update-clinic.dto';

@ApiTags('clinics')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('clinics')
export class ClinicsController {
  constructor(private clinicsService: ClinicsService) {}

  @Get()
  @ApiOperation({ summary: 'List all clinics with user/patient/appointment counts' })
  @ApiResponse({ status: 200, description: 'Clinic list' })
  findAll(): Promise<ClinicListResponse> {
    return this.clinicsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clinic by ID' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findById(@Param('id') id: string): Promise<ClinicDetailResponse> {
    return this.clinicsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update clinic details or toggle active status' })
  update(@Param('id') id: string, @Body() dto: UpdateClinicDto): Promise<ClinicDetailResponse> {
    return this.clinicsService.update(id, dto);
  }

  @Put(':id/activate')
  @ApiOperation({ summary: 'Activate clinic' })
  activate(@Param('id') id: string): Promise<ClinicDetailResponse> {
    return this.clinicsService.update(id, { active: true });
  }

  @Put(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate clinic' })
  deactivate(@Param('id') id: string): Promise<ClinicDetailResponse> {
    return this.clinicsService.update(id, { active: false });
  }
}

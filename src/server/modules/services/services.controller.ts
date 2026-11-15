import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ServiceListResponse, ServiceMutationResponse } from '../../common/interfaces';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

interface ClinicRequest {
  user: { tenantId: string; clinicId: string };
}

@ApiTags('services')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all services, or search by name / code' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  findAll(
    @Request() req: ClinicRequest,
    @Query('search') search?: string,
  ): Promise<ServiceListResponse> {
    if (search) return this.servicesService.search(req.user.clinicId, search);
    return this.servicesService.findAll(req.user.clinicId);
  }

  @Get('active')
  @ApiOperation({ summary: 'List only active services (used for appointment dropdowns)' })
  findActive(@Request() req: ClinicRequest): Promise<ServiceListResponse> {
    return this.servicesService.findActive(req.user.clinicId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new service' })
  @ApiResponse({ status: 201, description: 'Service created' })
  create(
    @Request() req: ClinicRequest,
    @Body() dto: CreateServiceDto,
  ): Promise<ServiceMutationResponse> {
    return this.servicesService.create(req.user.clinicId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update service (toggle active, update price, etc.)' })
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto): Promise<ServiceMutationResponse> {
    return this.servicesService.update(id, dto);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CatalogService } from './catalog.service';
// Values, not `import type`: Nest reads these classes at runtime for validation.
import {
  CreateDoctorDto,
  CreateServiceDto,
  CreateUserDto,
  ResetPasswordDto,
  UpdateDoctorDto,
  UpdateServiceDto,
  UpdateUserDto,
} from './dto/catalog.dto';

@ApiTags('types')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('types')
export class TypesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: "The clinic's own order and staff types (made on the till; read-only)" })
  list(@CurrentUser() user: AuthUser) {
    return this.catalog.listTypes(user.clinicId);
  }
}

@ApiTags('services')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.catalog.listServices(user.clinicId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceDto) {
    return this.catalog.createService(user, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit; deactivate with active:false' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.catalog.updateService(user, id, dto);
  }
}

@ApiTags('doctors')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.catalog.listDoctors(user.clinicId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDoctorDto) {
    return this.catalog.createDoctor(user, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit; deactivate with active:false' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.catalog.updateDoctor(user, id, dto);
  }
}

@ApiTags('users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.catalog.listUsers(user.clinicId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.catalog.createUser(user, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edit; an admin cannot deactivate or demote themself' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.catalog.updateUser(user, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.catalog.resetPassword(user, id, dto.newPassword);
  }
}

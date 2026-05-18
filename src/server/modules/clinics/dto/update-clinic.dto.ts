import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateClinicDto } from '@server/modules/auth/dto/set-password.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateClinicDto extends PartialType(CreateClinicDto) {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

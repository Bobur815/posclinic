import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsISO8601, IsOptional } from 'class-validator';

/**
 * Rows are validated one by one in `sync-apply.ts` (a bad row is rejected, not the batch), so
 * only the array shape is checked here. Row shapes: `.claude/rules/server-api.md`.
 */
export class SyncPushDto {
  @ApiPropertyOptional({ type: [Object], description: 'Patient rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  patients?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Doctor rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  doctors?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Service rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  services?: Record<string, unknown>[];

  @ApiPropertyOptional({
    type: [Object],
    description: 'User rows with bcrypt passwordHash (≤ 200)',
  })
  @IsOptional()
  @IsArray()
  users?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Appointment rows with items (≤ 200)' })
  @IsOptional()
  @IsArray()
  appointments?: Record<string, unknown>[];
}

export class SyncPullQueryDto {
  @ApiPropertyOptional({ description: 'serverTime from the previous pull; empty = everything' })
  // A first pull sends `since=` (contract: "<ISO|empty>"); @IsOptional alone lets only
  // undefined/null through, so an empty value is mapped to undefined first.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsISO8601()
  since?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsISO8601, IsOptional } from 'class-validator';

/**
 * Rows are validated one by one in `sync-apply.ts` (a bad row is rejected, not the batch), so
 * only the array shape is checked here. Row shapes: `.claude/rules/server-api.md`.
 *
 * EVERY entity of `SYNC_ENTITIES` must be declared here: the global ValidationPipe runs with
 * `whitelist: true` and silently drops any undeclared array (sync.dto.test.ts checks this).
 */
export class SyncPushDto {
  @ApiPropertyOptional({ type: [Object], description: 'Custom order types (≤ 200)' })
  @IsOptional()
  @IsArray()
  serviceTypes?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Custom staff types (≤ 200)' })
  @IsOptional()
  @IsArray()
  staffTypes?: Record<string, unknown>[];

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

  @ApiPropertyOptional({ type: [Object], description: 'Case rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  cases?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Referral rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  referrals?: Record<string, unknown>[];

  @ApiPropertyOptional({
    type: [Object],
    description: 'Appointment rows with items and course sessions (≤ 200)',
  })
  @IsOptional()
  @IsArray()
  appointments?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Vitals rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  vitals?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Analysis result rows (≤ 200)' })
  @IsOptional()
  @IsArray()
  results?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Product rows (v2.10) (≤ 200)' })
  @IsOptional()
  @IsArray()
  products?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Stock delivery rows (v2.10) (≤ 200)' })
  @IsOptional()
  @IsArray()
  stockReceipts?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Stock movement rows (v2.10) (≤ 200)' })
  @IsOptional()
  @IsArray()
  stockMovements?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Expense rows (v2.10) (≤ 200)' })
  @IsOptional()
  @IsArray()
  expenses?: Record<string, unknown>[];

  @ApiPropertyOptional({ type: [Object], description: 'Payment rows (v2.10) (≤ 200)' })
  @IsOptional()
  @IsArray()
  payments?: Record<string, unknown>[];
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

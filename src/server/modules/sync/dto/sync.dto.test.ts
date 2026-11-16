import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { SYNC_ENTITIES } from '../sync-apply';
import { SyncPushDto } from './sync.dto';

/**
 * The push body through the server's real global ValidationPipe (main.ts options): with
 * `whitelist: true` an array the DTO does not declare is dropped without an error, and the till
 * then believes it was sent (2026-11-16: cases, referrals, vitals, results and the types were
 * lost this way). Every SYNC_ENTITIES array must survive.
 */
describe('SyncPushDto through the global ValidationPipe', () => {
  it('keeps every entity the sync applies', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const body = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, [{ id: `${e}-1` }]]));
    const out = (await pipe.transform(body, { type: 'body', metatype: SyncPushDto })) as Record<
      string,
      unknown[]
    >;
    for (const e of SYNC_ENTITIES) {
      assert.ok(Array.isArray(out[e]) && out[e].length === 1, `${e} was dropped by the DTO`);
    }
  });
});

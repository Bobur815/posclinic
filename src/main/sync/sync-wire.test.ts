import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toWire } from './sync-engine';

describe('toWire (v2.6)', () => {
  it('never sends a visit’s fiscal receipt state; the visit itself still goes', () => {
    const at = new Date('2026-11-17T08:00:00Z');
    const wire = toWire('appointments', {
      id: 'a1',
      appointmentNumber: 'A-1',
      totalAmount: 100,
      paidAmount: 100,
      discountAmount: 0,
      synced: false,
      syncedAt: null,
      fiscalStatus: 'FISCALIZED',
      fiscalError: null,
      fiscalAttempts: 1,
      fiscalReceiptId: 'uuid-1',
      fiscalSign: '800000000101',
      fiscalAt: at,
      createdAt: at,
      updatedAt: at,
      items: [],
    });
    assert.deepEqual(
      Object.keys(wire).filter((k) => k.startsWith('fiscal')),
      [],
    );
    assert.equal(wire.appointmentNumber, 'A-1');
    assert.equal(wire.paidAmount, 100);
  });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import type { AppEvent, LanLinkDto } from '../../shared/lan';
import { useDatabaseClient } from '../database/sqlite-client';
import { isUniqueConflict, withUniqueRetry } from '../ipc/appointment-handlers';
import { freshActor } from '../ipc/auth-handlers';
import { setupIpcHandlers } from '../ipc/handlers';
import { clearHandlers, configureHandlers, hasHandler, invokeHandler } from '../ipc/ipc-safe';
import { createTestDb, type TestDb } from '../test-utils/db';
import type { SatelliteLink } from './config';
import { revokeDevice } from './devices';
import { MainLink, pairWithMain } from './main-link';
import { PairingStore } from './pairing';
import { LanServer } from './server';

/**
 * Satellite tills end to end: a real main till (LanServer over HTTP on a temporary database,
 * running the till's real IPC handlers) and satellites (MainLink) in one process, as SavdoChef's
 * satellite.e2e.test.ts.
 */

let t: TestDb;
let server: LanServer;
let base: string;
const pairing = new PairingStore();
const mainWindowEvents: AppEvent[] = [];
let limit: number | null = null;
/** The licence gate: tests flip it to see the main till's licence rule satellite calls. */
let gate: (channel: string) => string | null = () => null;
let doctorId: string;
let serviceId: string;
let patientId: string;

const until = async (check: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

function satellite(link: SatelliteLink, version = '2.2.3') {
  const events: AppEvent[] = [];
  const states: LanLinkDto[] = [];
  const client = new MainLink({
    link,
    version,
    retryMs: [50, 100],
    onEvent: (e) => events.push(e),
    onState: (s) => states.push(s),
    log: () => undefined,
  });
  let session: string | null = null;
  const call = async (channel: string, ...args: unknown[]) => {
    const out = await client.rpc(channel, args, session);
    if (out.session !== undefined) session = out.session;
    return out.result;
  };
  return { client, events, states, call, session: () => session };
}

async function pairNew(name = 'Desk-2'): Promise<SatelliteLink> {
  const { code } = pairing.issue();
  return pairWithMain(base, code, name);
}

const hash = (p: string) => bcrypt.hash(p, 4);

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({
    gate: async (channel) => gate(channel),
    onWrite: () => undefined,
    emit: (events) => {
      mainWindowEvents.push(...events);
      server.push(events);
    },
  });

  await t.db.localConfig.create({
    data: {
      id: 'config',
      clinicId: 'clinic-1',
      clinicName: 'Demo clinic',
      terminalId: 'main-terminal',
      apiUrl: 'x',
    },
  });
  for (const [phone, role, name] of [
    ['+998901111111', 'CLINIC_ADMIN', 'Admin'],
    ['+998902222222', 'RECEPTIONIST', 'Reception'],
  ] as const) {
    await t.db.user.create({
      data: { id: randomUUID(), phone, password: await hash('secret1'), role, fullName: name },
    });
  }
  doctorId = (await t.db.doctor.create({ data: { id: randomUUID(), fullName: 'Dr. A' } })).id;
  serviceId = (
    await t.db.service.create({
      data: { id: randomUUID(), code: 'S1', name: 'Analysis', price: 50_000 },
    })
  ).id;
  patientId = (
    await t.db.patient.create({
      data: { id: randomUUID(), patientCode: 'P-0001', fullName: 'Test', phone: '+998903333333' },
    })
  ).id;

  server = new LanServer({
    getDb: () => t.db,
    version: '2.2.0',
    lineage: async () => 'lineage-A',
    clinic: async () => ({ id: 'clinic-1', name: 'Demo clinic' }),
    pairing,
    deviceLimit: () => limit,
    hasHandler,
    invoke: invokeHandler,
    freshActor,
    onPaired: () => undefined,
    log: () => undefined,
  });
  await server.start(0, '127.0.0.1');
  base = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  await server.stop();
  useDatabaseClient(null);
  await t.close();
});

const visit = () => ({
  patientId,
  doctorId,
  appointmentDate: new Date().toISOString(),
  items: [{ serviceId, serviceName: 'Analysis', quantity: 1, unitPrice: 50_000, total: 50_000 }],
});

describe('pairing', () => {
  it('refuses without an open code and with a wrong one; a code works once', async () => {
    await assert.rejects(pairWithMain(base, '123456', 'x'), /lan\.errors\.codeClosed/);
    const { code } = pairing.issue();
    const wrong = code === '000000' ? '111111' : '000000';
    await assert.rejects(pairWithMain(base, wrong, 'x'), /lan\.errors\.codeWrong/);
    const link = await pairWithMain(base, code, 'Desk-2');
    assert.equal(link.mainUrl, base);
    assert.equal(link.lineage, 'lineage-A');
    assert.equal(link.mainVersion, '2.2.0');
    assert.equal(link.clinicName, 'Demo clinic');
    assert.match(link.secret, /^[0-9a-f]{64}$/);
    await assert.rejects(pairWithMain(base, code, 'again'), /lan\.errors\.codeClosed/);
    const row = await t.db.lanDevice.findUniqueOrThrow({ where: { id: link.deviceId } });
    assert.ok(!row.secretHash.includes(link.secret));
  });

  it('respects the licence: no more satellites than terminals − 1', async () => {
    limit = await t.db.lanDevice.count({ where: { active: true } });
    await assert.rejects(pairNew('one too many'), /lan\.errors\.deviceLimit/);
    limit = null;
  });
});

describe('a satellite at work', () => {
  let a: ReturnType<typeof satellite>;
  let b: ReturnType<typeof satellite>;

  before(async () => {
    a = satellite(await pairNew('A'));
    b = satellite(await pairNew('B'));
    a.client.start();
    b.client.start();
    await until(() => a.client.status().state === 'online' && b.client.status().state === 'online');
  });
  after(() => {
    a.client.stop();
    b.client.stop();
  });

  it('nothing but signing in works before a login', async () => {
    assert.deepEqual(await a.call('patients:getAll'), {
      ok: false,
      error: 'errors.notAuthenticated',
    });
    assert.deepEqual(await a.call('auth:getProfile'), { ok: true, data: null });
  });

  it('signs in on the main till; the session belongs to that satellite only', async () => {
    const login = await a.call('auth:login', '+998902222222', 'secret1');
    assert.equal(login.ok, true);
    assert.equal((login as { data: { user: { role: string } } }).data.user.role, 'RECEPTIONIST');
    assert.match(a.session() ?? '', /^[0-9a-f]{64}$/);
    const me = await a.call('auth:getProfile');
    assert.equal((me as { data: { fullName: string } }).data.fullName, 'Reception');
    // B presenting A's session gets nobody, and is told to drop it.
    const stolen = await b.client.rpc('auth:getProfile', [], a.session());
    assert.deepEqual(stolen.result, { ok: true, data: null });
    assert.equal(stolen.session, null);
  });

  it('a forged remember-me token restores nobody; a real one does', async () => {
    const admin = await t.db.user.findUniqueOrThrow({ where: { phone: '+998901111111' } });
    const forged = Buffer.from(JSON.stringify({ id: admin.id })).toString('base64');
    assert.deepEqual(await b.call('auth:restoreSession', forged), { ok: true, data: null });
    assert.equal(b.session(), null);
    const login = (await b.call('auth:login', '+998901111111', 'secret1')) as {
      data: { token: string };
    };
    await b.call('auth:logout');
    assert.equal(b.session(), null);
    const restored = await b.call('auth:restoreSession', login.data.token);
    assert.equal((restored as { data: { role: string } }).data.role, 'CLINIC_ADMIN');
    assert.ok(b.session());
  });

  it("the main till's roles apply: a receptionist cannot edit services or doctors", async () => {
    const svc = { code: 'S2', name: 'X', price: 1 };
    assert.deepEqual(await a.call('services:create', svc), {
      ok: false,
      error: 'errors.forbidden',
    });
    assert.deepEqual(await a.call('doctors:update', doctorId, { fullName: 'Hacked' }), {
      ok: false,
      error: 'errors.forbidden',
    });
    // The admin at B may.
    const created = await b.call('services:create', svc);
    assert.equal(created.ok, true);
  });

  it('what belongs to a machine is refused over the LAN', async () => {
    for (const channel of ['print:serviceReceipt', 'print:prescription']) {
      assert.deepEqual(await a.call(channel, 'x'), { ok: false, error: 'lan.errors.mainOnly' });
    }
    // Not registered in this harness, so also refused, as an unknown channel.
    const res = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: {
        authorization: `Posclinic ${(await t.db.lanDevice.findFirstOrThrow({ where: { name: 'A' } })).id}.${'0'.repeat(64)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ channel: 'license:activate', args: [] }),
    });
    assert.equal(res.status, 401); // a wrong secret is no device
  });

  it('a visit created on a satellite lands in the main DB; everyone hears about it', async () => {
    a.events.length = 0;
    b.events.length = 0;
    mainWindowEvents.length = 0;
    const created = await a.call('appointments:create', visit());
    assert.equal(created.ok, true);
    const id = (created as { data: { id: string } }).data.id;
    const row = await t.db.appointment.findUniqueOrThrow({ where: { id } });
    const deviceA = await t.db.lanDevice.findFirstOrThrow({ where: { name: 'A' } });
    assert.equal(row.terminalId, `lan:${deviceA.id}`);
    assert.equal(Number(row.totalAmount), 50_000);
    await until(() => b.events.some((e) => e.type === 'data:changed'));
    assert.ok(mainWindowEvents.some((e) => e.entity === 'appointments'));

    // Payments add up: 30k now, then 30k cash for the remaining 20k (10k is change, not credit).
    type Paid = { ok: boolean; data: { paymentStatus: string; paidAmount: number } };
    const first = (await a.call('appointments:checkout', id, { paymentMethod: 'CASH', amount: 30_000 })) as Paid;
    assert.equal(first.data.paymentStatus, 'PARTIAL');
    assert.equal(Number(first.data.paidAmount), 30_000);
    const paid = (await a.call('appointments:checkout', id, { paymentMethod: 'CASH', amount: 30_000 })) as Paid;
    assert.equal(paid.data.paymentStatus, 'PAID');
    assert.equal(Number(paid.data.paidAmount), 50_000, 'capped at the bill');
    const again = await a.call('appointments:checkout', id, { paymentMethod: 'CASH', amount: 1_000 });
    assert.equal((again as { ok: boolean }).ok, false);
    assert.match(JSON.stringify(again), /alreadyPaid/);
    // The visit the satellite prints comes back over RPC.
    const fetched = await a.call('appointments:getById', id);
    assert.equal((fetched as { data: { id: string } }).data.id, id);
  });

  it('two desks creating visits at once get distinct numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => (i % 2 ? a : b).call('appointments:create', visit())),
    );
    assert.ok(
      results.every((r) => r.ok),
      JSON.stringify(results.filter((r) => !r.ok)),
    );
    const numbers = results.map(
      (r) => (r as { data: { appointmentNumber: string } }).data.appointmentNumber,
    );
    assert.equal(new Set(numbers).size, numbers.length);
  });

  it('two desks registering patients at once get distinct codes', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        (i % 2 ? a : b).call('patients:create', { fullName: `P${i}`, phone: `+99890444000${i}` }),
      ),
    );
    assert.ok(
      results.every((r) => r.ok),
      JSON.stringify(results.filter((r) => !r.ok)),
    );
    const codes = results.map((r) => (r as { data: { patientCode: string } }).data.patientCode);
    assert.equal(new Set(codes).size, codes.length);
  });

  it('the retry recognises a real unique conflict on the visit number', async () => {
    const taken = await t.db.appointment.findFirstOrThrow();
    const err = await t.db.appointment
      .create({
        data: {
          id: randomUUID(),
          appointmentNumber: taken.appointmentNumber,
          patientId,
          doctorId,
          appointmentDate: new Date(),
        },
      })
      .catch((e: unknown) => e);
    assert.equal(isUniqueConflict(err, ['appointment_number', 'appointmentNumber']), true);
    assert.equal(isUniqueConflict(err, ['patient_code', 'patientCode']), false);
    let tries = 0;
    const out = await withUniqueRetry(['appointmentNumber', 'appointment_number'], async () => {
      tries += 1;
      if (tries < 3) throw err;
      return 'ok';
    });
    assert.equal(out, 'ok');
    assert.equal(tries, 3);
  });

  it("the main till's licence gates satellite calls", async () => {
    gate = (channel) => (channel === 'appointments:create' ? 'license.limit.monthlyVisits' : null);
    try {
      assert.deepEqual(await a.call('appointments:create', visit()), {
        ok: false,
        error: 'LICENSE:license.limit.monthlyVisits',
      });
    } finally {
      gate = () => null;
    }
  });

  it('a deactivated user is cut off on the next call; logout ends the session', async () => {
    const reception = await t.db.user.findUniqueOrThrow({ where: { phone: '+998902222222' } });
    await t.db.user.update({ where: { id: reception.id }, data: { active: false } });
    assert.deepEqual(await a.call('patients:getAll'), {
      ok: false,
      error: 'errors.notAuthenticated',
    });
    assert.equal(a.session(), null);
    await t.db.user.update({ where: { id: reception.id }, data: { active: true } });

    await b.call('auth:logout');
    assert.equal(b.session(), null);
    assert.deepEqual(await b.call('auth:getProfile'), { ok: true, data: null });
  });

  it('a satellite guessing passwords locks itself after five tries', async () => {
    const answers = [];
    for (let i = 0; i < 6; i++) answers.push(await a.call('auth:login', '+998901111111', 'wrong!'));
    const errors = answers.map((r) => (r as { data: { error: string } }).data.error);
    assert.deepEqual(errors.slice(0, 5), Array(5).fill('invalid_credentials'));
    assert.equal(errors[5], 'too_many_attempts');
    // Even the right password waits; another satellite is not affected.
    const right = (await a.call('auth:login', '+998901111111', 'secret1')) as {
      data: { success: boolean };
    };
    assert.equal(right.data.success, false);
    const other = (await b.call('auth:login', '+998901111111', 'secret1')) as {
      data: { success: boolean };
    };
    assert.equal(other.data.success, true);
  });

  it('a revoked satellite is unpaired at once', async () => {
    const id = (await t.db.lanDevice.findFirstOrThrow({ where: { name: 'B' } })).id;
    await revokeDevice(t.db, id);
    server.dropDevice(id);
    const res = await b.call('auth:getProfile');
    assert.deepEqual(res, { ok: false, error: 'lan.errors.unpaired' });
    assert.equal(b.client.status().state, 'unpaired');
  });
});

describe('when the line is wrong', () => {
  it('refuses a main till of another version', async () => {
    const s = satellite(await pairNew('old'), '2.1.5');
    s.client.start();
    await until(() => s.client.status().state === 'version');
    assert.deepEqual(await s.call('auth:getProfile'), { ok: false, error: 'lan.errors.version' });
    s.client.stop();
  });

  it('refuses a different main till at the address (another lineage)', async () => {
    const link = await pairNew('moved');
    const s = satellite({ ...link, lineage: 'lineage-B' });
    s.client.start();
    await until(() => s.client.status().state === 'superseded');
    s.client.stop();
  });

  it('a stopped main till is unreachable; it reconnects when the main till is back', async () => {
    const s = satellite(await pairNew('last'));
    s.client.start();
    await until(() => s.client.status().state === 'online');
    const port = server.port!;
    await server.stop();
    assert.deepEqual(await s.call('auth:getProfile'), {
      ok: false,
      error: 'lan.errors.unreachable',
    });
    await until(() => s.client.status().state === 'unreachable');
    await server.start(port, '127.0.0.1');
    await until(() => s.client.status().state === 'online', 10_000);
    s.client.stop();
  });
});

describe('who may call', () => {
  it('a caller without a device credential gets nothing but /health', async () => {
    const health = await fetch(`${base}/health`).then((r) => r.json());
    assert.deepEqual(health, { app: 'posclinic', version: '2.2.0' });
    assert.equal((await fetch(`${base}/hello`)).status, 401);
    const rpc = await fetch(`${base}/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'patients:getAll', args: [] }),
    });
    assert.equal(rpc.status, 401);
    assert.equal((await fetch(`${base}/events`)).status, 401);
  });
});

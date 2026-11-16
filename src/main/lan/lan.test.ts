import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestDb, openTestShift, type TestDb } from '../test-utils/db';
import { getLink, getRole, plainCipher } from './config';
import { LanService } from './lan-service';
import { CODE_TTL_MS, hashSecret, PairingStore, secretMatches } from './pairing';
import {
  isLocalAddress,
  normaliseMainAddress,
  shouldServe,
  versionsCompatible,
} from './serve-policy';
import { runsOverLan } from './server';

/** Satellite tills: the rules (port of SavdoChef src/main/lan/lan.test.ts). */

describe('pairing codes', () => {
  it('six digits, single use, expire after ten minutes', () => {
    let now = 1_000;
    const store = new PairingStore(() => now);
    const { code } = store.issue();
    assert.match(code, /^\d{6}$/);
    assert.equal(store.redeem(code, '192.168.1.5'), 'ok');
    assert.equal(store.redeem(code, '192.168.1.5'), 'closed');
    store.issue();
    now += CODE_TTL_MS + 1;
    assert.equal(store.isOpen(), false);
  });

  it('throttles an address after five wrong codes, even for the right one', () => {
    const store = new PairingStore();
    const { code } = store.issue();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.equal(store.redeem(wrong, '10.0.0.9'), 'wrong');
    assert.equal(store.redeem(code, '10.0.0.9'), 'throttled');
    // Another address is not punished for it.
    assert.equal(store.redeem(code, '10.0.0.10'), 'ok');
  });

  it('ten wrong codes in all, from any addresses, cancel the code', () => {
    const store = new PairingStore();
    const { code } = store.issue();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 10; i++) assert.equal(store.redeem(wrong, `10.0.1.${i}`), 'wrong');
    assert.equal(store.burned, true);
    assert.equal(store.redeem(code, '10.0.2.1'), 'closed');
  });

  it('keeps only a hash of the device secret', () => {
    const h = hashSecret('a'.repeat(64));
    assert.ok(!h.includes('a'.repeat(64)));
    assert.equal(secretMatches('a'.repeat(64), h), true);
    assert.equal(secretMatches('b'.repeat(64), h), false);
  });
});

describe('serve policy, addresses, channels', () => {
  it('serves only a main till with satellites on and a satellite or an open code', () => {
    const base = { role: 'main' as const, enabled: true, activeDevices: 0, pairingOpen: false };
    assert.equal(shouldServe(base), false);
    assert.equal(shouldServe({ ...base, pairingOpen: true }), true);
    assert.equal(shouldServe({ ...base, activeDevices: 2 }), true);
    assert.equal(shouldServe({ ...base, activeDevices: 2, enabled: false }), false);
    assert.equal(shouldServe({ ...base, activeDevices: 2, role: 'satellite' }), false);
  });

  it('only the clinic network and this machine may call', () => {
    for (const a of [
      '192.168.1.20',
      '10.1.2.3',
      '172.20.0.5',
      '127.0.0.1',
      '::1',
      '::ffff:192.168.0.2',
    ])
      assert.equal(isLocalAddress(a), true, a);
    for (const a of ['8.8.8.8', '172.32.0.1', '100.64.1.1', '', undefined])
      assert.equal(isLocalAddress(a), false, String(a));
  });

  it('reads the address the way it is typed, refuses public ones', () => {
    assert.equal(normaliseMainAddress('192.168.1.10', 5180), 'http://192.168.1.10:5180');
    assert.equal(
      normaliseMainAddress(' http://192.168.1.10:6000/ ', 5180),
      'http://192.168.1.10:6000',
    );
    assert.equal(normaliseMainAddress('8.8.8.8', 5180), null);
    assert.equal(normaliseMainAddress('192.168.1.300', 5180), null);
    assert.equal(normaliseMainAddress('evil.example.com', 5180), null);
    assert.equal(normaliseMainAddress('192.168.1.10:80', 5180), null);
    assert.equal(normaliseMainAddress('127.0.0.1:5180', 5180), null);
    assert.equal(normaliseMainAddress('localhost', 5180), null);
    assert.equal(normaliseMainAddress('127.0.0.1:5180', 5180, true), 'http://127.0.0.1:5180');
  });

  it('two tills talk when major.minor match', () => {
    assert.equal(versionsCompatible('2.2.0', '2.2.7'), true);
    assert.equal(versionsCompatible('2.2.0', '2.3.0'), false);
  });

  it('what belongs to a machine never runs over the LAN', () => {
    for (const c of [
      'license:activate',
      'license:checkNow',
      'setup:createAdmin',
      'update:install',
      'lan:issueCode',
      'config:getLocalConfig',
      'sync:now',
      'app:quit',
      'print:serviceReceipt',
    ])
      assert.equal(runsOverLan(c), false, c);
    for (const c of ['license:status', 'auth:login', 'patients:create', 'appointments:checkout'])
      assert.equal(runsOverLan(c), true, c);
  });
});

describe('LanService', () => {
  let main: TestDb;
  let sat: TestDb;
  let limit: number | null = null;
  const handlers = {
    hasHandler: () => false,
    invoke: async () => null,
    freshActor: async () => null,
  };
  const make = (db: TestDb, restarts: string[], version = '2.2.0') =>
    new LanService({
      getDb: () => db.db,
      version,
      machineName: 'DESK-2',
      cipher: plainCipher,
      handlers,
      deviceLimit: () => limit,
      onLanChanged: () => undefined,
      onMainEvent: () => undefined,
      restart: () => restarts.push('restart'),
      log: () => undefined,
      allowLoopback: true,
      host: '127.0.0.1',
    });
  const freePort = () => 20_000 + Math.floor(Math.random() * 20_000);

  before(async () => {
    main = await createTestDb(); await openTestShift(main.db);
    sat = await createTestDb();
  });
  after(async () => {
    await main.close();
    await sat.close();
  });

  it('a main till listens only while it should; a satellite joins with the code and restarts', async () => {
    const m = make(main, []);
    await m.init();
    const port = freePort();
    await m.update({ port });
    assert.equal((await m.status()).serving, false); // switched off

    await assert.rejects(m.issueCode(), /lan\.errors\.notEnabled/);
    await m.update({ enabled: true });
    assert.equal((await m.status()).serving, false); // on, but nobody to serve
    const withCode = await m.issueCode();
    assert.equal(withCode.serving, true);
    assert.match(withCode.pairing?.code ?? '', /^\d{6}$/);

    const satRestarts: string[] = [];
    const s = make(sat, satRestarts);
    await s.init();
    await assert.rejects(s.join({ mainAddress: '8.8.8.8', code: '123456' }), /badAddress/);
    const joined = await s.join({ mainAddress: `127.0.0.1:${port}`, code: withCode.pairing!.code });
    assert.equal(joined.role, 'satellite');
    assert.equal(joined.mainUrl, `http://127.0.0.1:${port}`);
    assert.deepEqual(satRestarts, ['restart']);
    assert.equal(await getRole(sat.db), 'satellite');
    const link = await getLink(sat.db, plainCipher);
    assert.ok(link?.deviceId);

    // The code is spent; the paired satellite keeps the server up.
    const after1 = await m.status();
    assert.equal(after1.pairing, null);
    assert.equal(after1.devices.length, 1);
    assert.equal(after1.serving, true);

    // Revoked: nobody left to serve, the port closes.
    const revoked = await m.revoke(after1.devices[0]!.id);
    assert.equal(revoked.serving, false);
    assert.equal(revoked.devices[0]!.active, false);

    // The satellite (after its restart) leaves and is a till of its own again.
    const again = make(sat, satRestarts);
    await again.init();
    assert.equal(again.isSatellite, true);
    await assert.rejects(again.status(), /mainOnly/);
    await again.leave();
    assert.equal(await getRole(sat.db), 'main');
    assert.equal(await getLink(sat.db, plainCipher), null);
    await again.stop();
    await s.stop();
    await m.stop();
  });

  it('device limit = licence terminals − 1: no code once it is reached', async () => {
    const m = make(main, []);
    await m.init();
    await m.update({ port: freePort(), enabled: true });
    limit = 0; // a one-till plan (START): no satellites at all
    await assert.rejects(m.issueCode(), /lan\.errors\.deviceLimit/);
    limit = null;
    assert.ok((await m.issueCode()).pairing);
    await m.cancelCode();
    await m.stop();
  });

  it('a credential that cannot be read shows "unpaired", never a silent till of its own', async () => {
    const db = await createTestDb();
    try {
      await db.db.setting.create({
        data: {
          key: 'lan_link',
          value: JSON.stringify({
            mainUrl: 'http://192.168.1.50:5180',
            deviceId: '00000000-0000-4000-8000-000000000000',
            secret: { enc: 'safe', v: 'AAAA' },
            lineage: 'L',
            mainVersion: '2.2.0',
          }),
        },
      });
      await db.db.setting.create({ data: { key: 'lan_role', value: '"satellite"' } });
      const s = make(db, []); // plainCipher: cannot open a safeStorage value
      await s.init();
      assert.equal(s.isSatellite, true);
      assert.equal(s.linkStatus().state, 'unpaired');
      assert.equal(s.linkStatus().mainUrl, 'http://192.168.1.50:5180');
      assert.equal(s.mayLeaveUnattended, true);
    } finally {
      await db.close();
    }
  });

  it('a main till refuses the satellite-only actions', async () => {
    const m = make(main, []);
    await m.init();
    await assert.rejects(m.leave(), /notSatellite/);
    assert.equal(m.linkStatus().role, 'main');
    await m.stop();
  });
});

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createPackageLookup, mxikPackages, searchMxik, TasnifUnavailableError } from './tasnif';

/** tasnif lookups against a local fake answering with the shapes seen live (2026-11-16). */

let server: Server;
let baseUrl = '';
const asked: string[] = [];

const row = (code: string, name: string, cls = 'Медицинские услуги') => ({
  groupCode: code.slice(0, 3),
  groupName: 'УСЛУГИ',
  className: cls,
  mxikCode: code,
  mxikName: name,
  subPositionName: name,
  packages: null,
});

before(async () => {
  server = createServer((req, res) => {
    asked.push(req.url ?? '');
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/mxik/search/by-params') {
      if (url.searchParams.get('text') === 'broken') {
        res.statusCode = 502;
        return res.end('{}');
      }
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            content: [
              row('06812001009000001', 'Прокладка паронитовая', 'Изделия'),
              row('10902001034000000', 'Консультация паразитолога'),
              row('10902001034000000', 'Консультация паразитолога'),
              row('10902003035000000', 'Услуги паразитолога по лечению'),
              { mxikCode: 'not-a-code', mxikName: 'x' },
            ],
          },
        }),
      );
    }
    if (url.pathname === '/integration-mxik/get/history/10902001034000000') {
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            mxikCode: '10902001034000000',
            packageNames: [
              {
                code: 1321927,
                nameUz: 'хизмат (марта)',
                nameRu: 'услуга (раз)',
                nameLat: 'xizmat (marta)',
              },
            ],
          },
        }),
      );
    }
    res.end(JSON.stringify({ success: true, data: null }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((r) => server.close(() => r())));

describe('tasnif MXIK lookups', () => {
  it('searches by words: services first, one row per code, junk dropped', async () => {
    const hits = await searchMxik('паразит', 'ru', { baseUrl });
    assert.deepEqual(
      hits.map((h) => h.code),
      ['10902001034000000', '10902003035000000', '06812001009000001'],
    );
    assert.equal(hits[0]!.name, 'Консультация паразитолога');
    assert.equal(hits[0]!.className, 'Медицинские услуги');
    assert.match(asked.at(-1)!, /text=%D0%BF/);
  });

  it('looks up a full 17-digit code by code; asks nothing for one letter', async () => {
    await searchMxik('10902001034000000', 'uz_latn', { baseUrl });
    assert.match(asked.at(-1)!, /mxikCode=10902001034000000/);
    const before = asked.length;
    assert.deepEqual(await searchMxik(' a ', 'uz_latn', { baseUrl }), []);
    assert.equal(asked.length, before);
  });

  it('reports tasnif being unreachable as such', async () => {
    await assert.rejects(searchMxik('broken', 'ru', { baseUrl }), TasnifUnavailableError);
    await assert.rejects(
      searchMxik('test', 'ru', { baseUrl: 'http://127.0.0.1:1' }),
      TasnifUnavailableError,
    );
  });

  it('lists the package codes of an MXIK in the asked language', async () => {
    assert.deepEqual(await mxikPackages('10902001034000000', 'uz_latn', { baseUrl }), [
      { code: '1321927', name: 'xizmat (marta)' },
    ]);
    assert.deepEqual(await mxikPackages('10902001034000000', 'ru', { baseUrl }), [
      { code: '1321927', name: 'услуга (раз)' },
    ]);
    assert.deepEqual(await mxikPackages('10902002003000999', 'ru', { baseUrl }), []);
    assert.deepEqual(await mxikPackages('123', 'ru', { baseUrl }), []);
  });
});

describe('package lookup for the MXIK fields', () => {
  it('answers known codes locally, keeps tasnif answers, asks once for parallel fields', async () => {
    const lookup = createPackageLookup({ baseUrl }, [
      { mxik: '10902002003000999', packageCode: '1321964' },
    ]);
    const count = () => asked.filter((u) => u.includes('/integration-mxik/')).length;
    const start = count();
    assert.deepEqual(await lookup('10902002003000999', 'ru'), {
      packages: [{ code: '1321964', name: 'услуга (раз)' }],
      unavailable: false,
    });
    assert.equal(count(), start, 'a known code asks nothing');

    const [a, b] = await Promise.all([
      lookup('10902001034000000', 'uz_latn'),
      lookup('10902001034000000', 'uz_latn'),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.packages[0]!.code, '1321927');
    assert.equal(count(), start + 1, 'two fields at once: one request');
    await lookup('10902001034000000', 'uz_latn');
    assert.equal(count(), start + 1, 'kept for the session');
  });

  it('tasnif unreachable is an answer, not an error, and is not kept', async () => {
    const lookup = createPackageLookup({ baseUrl: 'http://127.0.0.1:1' });
    assert.deepEqual(await lookup('10902001034000000', 'ru'), { packages: [], unavailable: true });
    assert.deepEqual(await lookup('bad', 'ru'), { packages: [], unavailable: false });
  });
});

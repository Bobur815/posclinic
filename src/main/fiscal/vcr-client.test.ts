import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { closedVcrUrl, type FakeVcr, startFakeVcr } from '../test-utils/fake-vcr';
import {
  describeVcrError,
  isEnvironmentError,
  nothingWasSent,
  VcrClient,
  VcrError,
} from './vcr-client';

/** The REGOS:VCR client against a local fake (SavdoChef's tests, on node:test). */

let vcr: FakeVcr;
before(async () => {
  vcr = await startFakeVcr({ password: 'p' });
});
after(() => vcr.close());

const client = (over: Partial<ConstructorParameters<typeof VcrClient>[0]> = {}) =>
  new VcrClient({ url: vcr.url, login: 'cassir', password: 'p', busyRetryMs: [5, 5], ...over });

const failure = (p: Promise<unknown>) =>
  p.then(
    () => assert.fail('expected a failure'),
    (e: unknown) => e,
  );

describe('VCR client', () => {
  it('sends JSON-RPC with base64 login:password and returns the result', async () => {
    const info = await client().initialize();
    assert.equal(typeof info.TerminalID, 'string');
    const call = vcr.calls.at(-1)!;
    assert.equal(call.method, 'Sys.Initialize');
    assert.equal(call.params, null);
    assert.equal(call.auth, Buffer.from('cassir:p').toString('base64'));
  });

  it('an ok:false answer is a VcrError with VCR’s code', async () => {
    const e = (await failure(client({ password: 'bad' }).initialize())) as VcrError;
    assert.ok(e instanceof VcrError);
    assert.equal(e.code, 705000);
    assert.equal(e.method, 'Sys.Initialize');
  });

  it('busy (704042) is repeated a few times, then given up', async () => {
    vcr.failNext('Sys.GetOverflowInfo', 704042);
    assert.equal((await client().overflowInfo()).AvaialableZReportCount, 500);
    for (let i = 0; i < 3; i++) vcr.failNext('Sys.GetOverflowInfo', 704042);
    const e = (await failure(client().overflowInfo())) as VcrError;
    assert.equal(e.code, 704042);
    assert.equal(nothingWasSent(e), true);
  });

  it('nothing listening: refused, so certainly not sent', async () => {
    const e = (await failure(
      new VcrClient({ url: await closedVcrUrl(), login: 'a', password: 'b' }).initialize(),
    )) as VcrError;
    assert.ok(e instanceof VcrError);
    assert.equal(e.code, 0);
    assert.equal(e.netCause, 'refused');
    assert.equal(nothingWasSent(e), true);
    assert.equal(isEnvironmentError(e), true);
    assert.match(describeVcrError(e), /aloqa yo'q/);
  });

  it('no answer in time: a timeout, which may have been registered', async () => {
    vcr.failNext('Sys.Initialize', 'hang');
    const e = (await failure(client({ timeoutMs: 300 }).initialize())) as VcrError;
    assert.equal(e.code, 0);
    assert.equal(e.netCause, 'timeout');
    assert.equal(nothingWasSent(e), false);
  });

  it('a data refusal is not an environment error', () => {
    assert.equal(isEnvironmentError(new VcrError(705511, 'ИКПУ', 'Receipt.Sale')), false);
    assert.equal(isEnvironmentError(new VcrError(704016, 'printer', 'Receipt.Sale')), true);
    assert.match(describeVcrError(new VcrError(701003, 'Ставка НДС не найдена', 'x')), /QQS/);
  });

  it('a redirect is refused: the login and password never go to another host', async () => {
    let elsewhere = 0;
    const other = createServer((_req, res) => {
      elsewhere++;
      res.end('{}');
    });
    await new Promise<void>((r) => other.listen(0, '127.0.0.1', r));
    const otherPort = (other.address() as AddressInfo).port;
    const redirecting = createServer((_req, res) => {
      res.writeHead(307, { Location: `http://127.0.0.1:${otherPort}/` });
      res.end();
    });
    await new Promise<void>((r) => redirecting.listen(0, '127.0.0.1', r));
    const port = (redirecting.address() as AddressInfo).port;
    const e = (await failure(
      new VcrClient({
        url: `http://127.0.0.1:${port}/`,
        login: 'cassir',
        password: 'p',
      }).initialize(),
    )) as VcrError;
    assert.equal(e.code, 0);
    assert.equal(elsewhere, 0);
    await new Promise((r) => redirecting.close(r));
    await new Promise((r) => other.close(r));
  });
});

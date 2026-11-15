import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, mock } from 'node:test';
import type { UpdateStatusDto } from '../../shared/update';
import { createUpdater, type UpdaterEngine, updateErrorMessage } from './updater';

/** electron-updater's AppUpdater as far as updater.ts uses it; the test drives its events. */
class FakeEngine extends EventEmitter implements UpdaterEngine {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checkForUpdates = mock.fn(async (): Promise<unknown> => null);
  downloadUpdate = mock.fn(async (): Promise<unknown> => []);
  quitAndInstall = mock.fn((_silent: boolean, _forceRun: boolean) => {});
}

function setup(supported = true) {
  const engine = new FakeEngine();
  const changes: UpdateStatusDto[] = [];
  const order: string[] = [];
  const warnings: unknown[] = [];
  const updater = createUpdater({
    currentVersion: '2.0.0',
    supported,
    engine: () => engine,
    onChange: (s) => changes.push(s),
    beforeInstall: async () => {
      order.push('beforeInstall');
    },
    log: { info: () => undefined, warn: (_m, e) => warnings.push(e) },
    now: () => new Date('2026-11-15T10:00:00Z'),
  });
  engine.quitAndInstall.mock.mockImplementation(() => {
    order.push('quitAndInstall');
  });
  return { engine, updater, changes, order, warnings };
}

describe('updater', () => {
  it('in a dev or unpacked run it is unsupported and never builds electron-updater', async () => {
    const engine = mock.fn((): UpdaterEngine => new FakeEngine());
    const updater = createUpdater({
      currentVersion: '2.0.0',
      supported: false,
      engine,
      onChange: () => undefined,
      beforeInstall: async () => undefined,
      log: { info: () => undefined, warn: () => undefined },
    });
    assert.equal((await updater.check()).state, 'unsupported');
    assert.equal(updater.download().state, 'unsupported');
    await updater.install();
    assert.equal(engine.mock.callCount(), 0);
  });

  it('check -> available -> download with progress -> downloaded -> install', async () => {
    const { engine, updater, changes, order } = setup();
    engine.checkForUpdates.mock.mockImplementation(async () => {
      engine.emit('update-available', { version: '2.1.0', releaseDate: '2026-11-14T00:00:00Z' });
      return null;
    });

    const checked = await updater.check();
    assert.equal(engine.autoDownload, false);
    assert.equal(engine.autoInstallOnAppQuit, false);
    assert.equal(checked.state, 'available');
    assert.equal(checked.version, '2.1.0');
    assert.equal(checked.checkedAt, '2026-11-15T10:00:00.000Z');

    const started = updater.download();
    assert.equal(started.state, 'downloading');
    assert.equal(started.percent, 0);
    const before = changes.length;
    engine.emit('download-progress', { percent: 10.2 });
    engine.emit('download-progress', { percent: 10.9 }); // same whole percent: no event
    engine.emit('download-progress', { percent: 55.5 });
    assert.deepEqual(
      changes.slice(before).map((s) => s.percent),
      [10, 55],
    );

    // Nothing installs before the download is complete.
    await updater.install();
    assert.deepEqual(order, []);

    engine.emit('update-downloaded', { version: '2.1.0' });
    assert.equal(updater.status().state, 'downloaded');
    assert.equal(updater.status().percent, 100);
    // A check now would only restart the cycle; it is ignored.
    await updater.check();
    assert.equal(engine.checkForUpdates.mock.callCount(), 1);

    await updater.install();
    assert.deepEqual(order, ['beforeInstall', 'quitAndInstall']);
    assert.deepEqual(engine.quitAndInstall.mock.calls[0]?.arguments, [true, true]);
  });

  it('up to date: not-available, also when electron-updater answers without an event', async () => {
    const { engine, updater } = setup();
    engine.checkForUpdates.mock.mockImplementationOnce(async () => {
      engine.emit('update-not-available');
      return null;
    });
    assert.equal((await updater.check()).state, 'not-available');
    assert.equal((await updater.check()).state, 'not-available');
    assert.equal(updater.download().state, 'not-available'); // nothing to download
    assert.equal(engine.downloadUpdate.mock.callCount(), 0);
  });

  it('a failed check shows an error; the quiet start-up check only logs it', async () => {
    const { engine, updater, warnings } = setup();
    const offline = Object.assign(new Error('getaddrinfo ENOTFOUND panel.posgro.uz'), {
      code: 'ENOTFOUND',
    });
    engine.checkForUpdates.mock.mockImplementation(async () => {
      throw offline;
    });

    assert.equal((await updater.check({ quiet: true })).state, 'idle');
    assert.deepEqual(warnings, [offline]);

    const loud = await updater.check();
    assert.equal(loud.state, 'error');
    assert.equal(loud.message, 'update.errors.offline');
  });

  it('a failed download can be retried', async () => {
    const { engine, updater } = setup();
    engine.checkForUpdates.mock.mockImplementation(async () => {
      engine.emit('update-available', { version: '2.1.0' });
      return null;
    });
    await updater.check();
    engine.downloadUpdate.mock.mockImplementationOnce(async () => {
      throw new Error('sha512 checksum mismatch');
    });
    updater.download();
    await new Promise((r) => setImmediate(r));
    assert.equal(updater.status().state, 'error');
    assert.equal(updater.status().version, '2.1.0');
    assert.equal(updater.status().message, 'update.errors.corrupt');
    assert.equal(updater.download().state, 'downloading');
    assert.equal(engine.downloadUpdate.mock.callCount(), 2);
  });

  it('maps errors to i18n keys', () => {
    assert.equal(
      updateErrorMessage(new Error('HttpError: 404 Not Found')),
      'update.errors.not_found',
    );
    assert.equal(
      updateErrorMessage(new Error('net::ERR_INTERNET_DISCONNECTED')),
      'update.errors.offline',
    );
    assert.equal(updateErrorMessage(new Error('something odd')), 'update.errors.unknown');
  });
});

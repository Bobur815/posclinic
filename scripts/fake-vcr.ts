/**
 * Development only: a stand-in for REGOS:VCR on http://127.0.0.1:22298/ (the default address in
 * Settings → Fiscal receipt), so the fiscal flow can be tried without a fiscal module.
 *
 *   npm run dev:fake-vcr            (login: cassir, password: pass)
 *
 * It keeps receipts in memory and prints each call. Never use it beside a real VCR (same port).
 */
import { startFakeVcr } from '../src/main/test-utils/fake-vcr';

async function main() {
  const port = Number(process.env.FAKE_VCR_PORT ?? 22298);
  const vcr = await startFakeVcr({ port, password: process.env.FAKE_VCR_PASSWORD ?? 'pass' });
  console.log(`[fake-vcr] listening on ${vcr.url} (login cassir, password ${vcr.password})`);
  let seen = 0;
  setInterval(() => {
    for (const c of vcr.calls.slice(seen)) {
      const p = c.params as { code?: string; positions?: unknown[] } | null;
      console.log(
        `[fake-vcr] ${c.method}${p?.code ? ` ${p.code}` : ''}${p?.positions ? ` (${p.positions.length} line(s))` : ''}`,
      );
    }
    seen = vcr.calls.length;
  }, 300);
  const stop = () => void vcr.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();

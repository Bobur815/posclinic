/**
 * Print jobs run one at a time, in the order they were asked for: two receipts printed at once
 * would each open a hidden print window on the same spooler, and a thermal driver may then drop
 * or interleave them. A job that hangs (driver stuck, printer offline) is given up after
 * `timeoutMs` so the jobs behind it still print. Electron-free (tests).
 */
export class PrintQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;

  constructor(private readonly timeoutMs = 60_000) {}

  /** Jobs queued or printing now. */
  get pending(): number {
    return this.waiting;
  }

  run<T>(job: () => Promise<T>): Promise<T> {
    this.waiting++;
    const result = this.tail.then(() => withTimeout(job(), this.timeoutMs));
    // The next job waits for this one whatever its outcome.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      this.waiting--;
    });
  }
}

export class PrintTimeoutError extends Error {
  constructor() {
    super('printing.errors.timeout');
    this.name = 'PrintTimeoutError';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PrintTimeoutError()), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

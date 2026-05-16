export class ServerTiming {
  private requestStart: bigint;
  private responseStartedAt: bigint | null = null;

  constructor() {
    this.requestStart = process.hrtime.bigint();
  }

  markResponseStarted(): void {
    this.responseStartedAt = process.hrtime.bigint();
  }

  getBufferedHeaderValue(responseFinishedAt: bigint): string {
    const now = responseFinishedAt;
    const responseStarted = this.responseStartedAt ?? now;
    const timeToResponseStarted = Number(responseStarted - this.requestStart) / 1_000_000;
    const timeToResponseFinished = Number(now - responseStarted) / 1_000_000;
    return `responseStarted;dur=${timeToResponseStarted.toFixed(3)}, responseFinished;dur=${timeToResponseFinished.toFixed(3)}`;
  }
}

import type { IncomingMessage } from "node:http";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const ORANGE = "\x1b[38;5;208m";

const DEFAULT_THRESHOLDS = { yellow: 50, orange: 250, red: 500 };

export interface LoggerOptions {
  timingThresholds?: { yellow: number; orange: number; red: number };
}

interface RequestLogger {
  onWriteHead: () => void;
  onFinish: (status: number) => void;
}

export class Logger {
  private enabled: boolean;
  private level: "error" | "info";
  private thresholds: typeof DEFAULT_THRESHOLDS;
  private activeSlots = new Map<number, true>();
  private highWaterMark = 0;

  constructor(options: LoggerOptions = {}) {
    const env = process.env.NODE_ENV;
    this.enabled = env !== "production" && env !== "test";
    this.level = process.env.LOG_LEVEL === "info" ? "info" : "error";
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.timingThresholds };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  onRequestStart(req: IncomingMessage): RequestLogger {
    if (!this.enabled) return { onWriteHead: noop, onFinish: noop };

    if (this.level === "error") {
      return this.createErrorLevelLogger(req);
    }

    const slot = this.assignSlot();
    const method = sanitize(req.method ?? "GET");
    const url = sanitize(req.url ?? "/");
    const startTime = process.hrtime.bigint();

    this.print("──‣", "┈┈┈┈┈", method, url, "┬", slot);

    return {
      onWriteHead: () => {
        const ms = this.elapsedMs(startTime);
        this.print("···", this.colorTiming(ms, this.formatTiming(ms)), method, url, "·", slot);
      },
      onFinish: (status: number) => {
        const ms = this.elapsedMs(startTime);
        this.freeSlot(slot);
        this.print(
          this.colorStatus(status, String(status)),
          this.colorTiming(ms, this.formatTiming(ms)),
          method,
          url,
          "┴",
          slot,
        );
      },
    };
  }

  private createErrorLevelLogger(req: IncomingMessage): RequestLogger {
    const method = sanitize(req.method ?? "GET");
    const url = sanitize(req.url ?? "/");
    const startTime = process.hrtime.bigint();
    return {
      onWriteHead: noop,
      onFinish: (status: number) => {
        if (status >= 500) {
          const ms = this.elapsedMs(startTime);
          process.stdout.write(
            `${RED}${status}${RESET} ${this.colorTiming(ms, this.formatTiming(ms))} ${method} ${url}\n`,
          );
        }
      },
    };
  }

  private assignSlot(): number {
    let slot = 0;
    while (this.activeSlots.has(slot)) slot++;
    this.activeSlots.set(slot, true);
    if (slot + 1 > this.highWaterMark) this.highWaterMark = slot + 1;
    return slot;
  }

  private freeSlot(slot: number): void {
    this.activeSlots.delete(slot);
    while (this.highWaterMark > 0 && !this.activeSlots.has(this.highWaterMark - 1)) {
      this.highWaterMark--;
    }
  }

  private print(
    statusStr: string,
    timingStr: string,
    method: string,
    url: string,
    slotChar: string,
    slotIndex: number,
  ): void {
    const bar = this.renderBar(slotChar, slotIndex);
    process.stdout.write(`${statusStr} ${timingStr} ${method}┈ ${bar} ${url}\n`);
  }

  private renderBar(eventChar: string, eventSlot: number): string {
    const parts: string[] = [];
    for (let i = 0; i < this.highWaterMark; i++) {
      parts.push(i === eventSlot ? eventChar : this.activeSlots.has(i) ? "│" : "┈");
    }
    return parts.join("┈");
  }

  private elapsedMs(startTime: bigint): number {
    return Number(process.hrtime.bigint() - startTime) / 1_000_000;
  }

  private formatTiming(ms: number): string {
    return `${Math.round(ms)}ms`.padStart(5, "┈");
  }

  private colorStatus(status: number, str: string): string {
    if (status >= 500) return `${RED}${str}${RESET}`;
    if (status >= 400) return `${ORANGE}${str}${RESET}`;
    if (status >= 300) return `${CYAN}${str}${RESET}`;
    return `${GREEN}${str}${RESET}`;
  }

  private colorTiming(ms: number, str: string): string {
    if (ms >= this.thresholds.red) return `${RED}${str}${RESET}`;
    if (ms >= this.thresholds.orange) return `${ORANGE}${str}${RESET}`;
    if (ms >= this.thresholds.yellow) return `${YELLOW}${str}${RESET}`;
    return str;
  }
}

function noop(): void {}

function sanitize(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
}

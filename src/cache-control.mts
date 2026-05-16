import type { ServerResponse } from "node:http";

const TIME_UNITS: Record<string, number> = {
  second: 1,
  seconds: 1,
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
  day: 86400,
  days: 86400,
  week: 604800,
  weeks: 604800,
  month: 2592000,
  months: 2592000,
  year: 31536000,
  years: 31536000,
};

function parseTtl(ttl: number | string): number {
  if (typeof ttl === "number") return ttl;
  const match = /^(\d+)\s+(\w+)$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL format: "${ttl}"`);
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplier = TIME_UNITS[unit];
  if (multiplier === undefined) throw new Error(`Unknown TTL unit: "${match[2]}"`);
  return amount * multiplier;
}

export function applyCacheControl(
  res: ServerResponse,
  type: "public" | "private",
  ttl?: number | string,
): void {
  if (type === "public") {
    if (ttl === undefined) throw new Error("TTL is required for public cache control");
    const maxAge = parseTtl(ttl);
    res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
  } else {
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
  }
}

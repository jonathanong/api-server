import type { IncomingHttpHeaders } from "node:http";

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function firstForwardedIp(value: string | undefined): string | undefined {
  const ip = value?.split(",")[0]?.trim();
  return ip && ip.length > 0 ? ip : undefined;
}

export function resolveTrustedClientIp(options: {
  headers: IncomingHttpHeaders;
  socketRemoteAddress?: string;
}): string | undefined {
  return (
    firstForwardedIp(firstHeaderValue(options.headers["cf-connecting-ip"])) ??
    firstForwardedIp(firstHeaderValue(options.headers["x-forwarded-for"])) ??
    options.socketRemoteAddress
  );
}

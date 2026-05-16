export type HeaderRecord = Record<string, string | string[] | number | undefined>;
export type HeaderGetter = { get(name: string): string | null };
export type HeaderSource = HeaderGetter | HeaderRecord;
export type RequestLike = { headers: HeaderSource };
export type RemoteAddress =
  | string
  | {
      address?: string;
      hostname?: string;
      port?: number;
    };

export interface TrustedClientIpOptions {
  headers?: HeaderSource;
  request?: RequestLike;
  socketRemoteAddress?: string;
  remoteAddress?: RemoteAddress;
}

function isHeaderGetter(headers: HeaderSource): headers is HeaderGetter {
  return typeof (headers as HeaderGetter).get === "function";
}

function firstHeaderValue(value: string | string[] | number | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? undefined : String(first);
}

function headerRecordValue(headers: HeaderRecord, name: string): string | undefined {
  const direct = firstHeaderValue(headers[name]);
  if (direct !== undefined) return direct;

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return firstHeaderValue(value);
  }
  return undefined;
}

function headerValue(headers: HeaderSource | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (isHeaderGetter(headers)) return headers.get(name) ?? undefined;
  return headerRecordValue(headers, name);
}

function withoutPort(value: string): string {
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 0) return value.slice(1, end);
  }

  const colon = value.lastIndexOf(":");
  if (colon > -1 && value.indexOf(":") === colon && /^\d+$/.test(value.slice(colon + 1))) {
    return value.slice(0, colon);
  }

  return value;
}

function normalizeIp(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return withoutPort(trimmed);
}

function firstForwardedIp(value: string | undefined): string | undefined {
  return normalizeIp(value?.split(",")[0]);
}

function remoteAddressValue(value: RemoteAddress | undefined): string | undefined {
  if (typeof value === "string") return normalizeIp(value);
  return normalizeIp(value?.hostname ?? value?.address);
}

export function resolveTrustedClientIp(options: TrustedClientIpOptions): string | undefined {
  const headers = options.headers ?? options.request?.headers;
  return (
    firstForwardedIp(headerValue(headers, "cf-connecting-ip")) ??
    firstForwardedIp(headerValue(headers, "x-forwarded-for")) ??
    remoteAddressValue(options.remoteAddress) ??
    normalizeIp(options.socketRemoteAddress)
  );
}

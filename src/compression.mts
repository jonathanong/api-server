import zlib from "node:zlib";
import type { IncomingMessage } from "node:http";
// @ts-ignore
import Negotiator from "negotiator";
// @ts-ignore
import compressibleFn from "compressible";

const SUPPORTED_ENCODINGS = ["br", "gzip", "deflate"];
const COMPRESSION_THRESHOLD = 1024;

export function negotiateEncoding(req: IncomingMessage): string | null {
  const negotiator = new Negotiator(req);
  const encoding = negotiator.encoding(SUPPORTED_ENCODINGS);
  if (!encoding || encoding === "identity") return null;
  return encoding;
}

export function isCompressible(contentType: string): boolean {
  return compressibleFn(contentType) === true;
}

export function createCompressStream(
  encoding: string,
): zlib.BrotliCompress | zlib.Gzip | zlib.Deflate {
  if (encoding === "br") {
    return zlib.createBrotliCompress({
      flush: zlib.constants.BROTLI_OPERATION_FLUSH,
    });
  }
  if (encoding === "gzip") {
    return zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH });
  }
  return zlib.createDeflate({ flush: zlib.constants.Z_SYNC_FLUSH });
}

export function compressSync(encoding: string, buffer: Buffer): Buffer {
  if (encoding === "br") {
    return zlib.brotliCompressSync(buffer);
  }
  if (encoding === "gzip") {
    return zlib.gzipSync(buffer);
  }
  return zlib.deflateSync(buffer);
}

export function shouldCompress(
  req: IncomingMessage,
  res: { getHeader(name: string): string | number | string[] | undefined },
  contentType: string,
  bodyLength: number,
): string | null {
  if (bodyLength < COMPRESSION_THRESHOLD) return null;
  if (res.getHeader("Content-Encoding")) return null;
  const cacheControl = req.headers["cache-control"];
  if (cacheControl && cacheControl.includes("no-transform")) return null;
  if (!isCompressible(contentType)) return null;
  return negotiateEncoding(req);
}

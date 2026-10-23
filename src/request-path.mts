export function getRawPath(url: string): string {
  const lower = url.slice(0, 8).toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    try {
      return new URL(url).pathname;
    } catch {
      throw Object.assign(new Error("Invalid URL"), { status: 400 });
    }
  }
  return url.split("?")[0];
}

/** Apply the same path normalization before dispatch and public route lookup. */
export function getRoutePath(url: string): string {
  return getRawPath(url).replace(/^\/+/, "/") || "/";
}

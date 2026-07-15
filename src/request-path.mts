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

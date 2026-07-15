type VaryHeader = undefined | string | number | readonly string[];

export function mergeVary(header: VaryHeader): string {
  const members = (Array.isArray(header) ? header : [header])
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    const normalized = member.toLowerCase();
    if (normalized === "*") return "*";
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(member);
  }

  if (!seen.has("accept-encoding")) merged.push("Accept-Encoding");
  return merged.join(", ");
}

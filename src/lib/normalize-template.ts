export function normalizeTemplate(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}$/, '')
    .replace(/[.,!?]+$/, '')
    .trim();
}

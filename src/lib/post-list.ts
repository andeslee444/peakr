/**
 * Strip heavy, list-irrelevant fields from post rows before sending them to the
 * client. `keyframe_base64` is a full-res JPEG (~100KB/row) that the cards never
 * use inline — they load it lazily via /api/keyframe — so shipping it in every
 * feed page is pure dead egress (~2.4MB per 24-card page).
 */
const HEAVY_FIELDS = ['keyframe_base64'] as const;

export function stripHeavyFields<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => {
    const out = { ...row };
    for (const f of HEAVY_FIELDS) delete out[f];
    return out;
  });
}

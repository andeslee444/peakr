/** Validation for LLM-generated playbook sections, so malformed model output is
 *  rejected instead of silently nulling a user's saved section. */
export interface PlaybookTemplate {
  script: string;
  example_filled: string;
}

export interface PlaybookSection {
  title: string;
  templates: PlaybookTemplate[];
  why_it_works: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validatePlaybookSection(obj: unknown): PlaybookSection | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  if (!isNonEmptyString(o.title)) return null;
  if (!isNonEmptyString(o.why_it_works)) return null;
  if (!Array.isArray(o.templates) || o.templates.length === 0) return null;

  const templates: PlaybookTemplate[] = [];
  for (const t of o.templates) {
    if (!t || typeof t !== 'object') return null;
    const tt = t as Record<string, unknown>;
    if (!isNonEmptyString(tt.script) || !isNonEmptyString(tt.example_filled)) return null;
    templates.push({ script: tt.script, example_filled: tt.example_filled });
  }

  return { title: o.title, templates, why_it_works: o.why_it_works };
}

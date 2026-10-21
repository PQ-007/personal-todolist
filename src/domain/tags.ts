/** Free-form tags such as #urgent or #報告, written with a leading # in text fields. */

const TAG = /(^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/gu;
const MAX_TAGS = 10;
const MAX_LEN = 30;

/**
 * Tags without "#", trimmed, without commas (they separate tags in storage), at most 30
 * characters, and without duplicates (compared case-insensitively, first spelling wins).
 */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const tag = r.replace(/^#+/, '').replace(/,/g, '').trim().slice(0, MAX_LEN);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Pulls #tags out of quick-add text: "Write #urgent report" → "Write report" + ["urgent"]. */
export function extractTags(text: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const rest = text.replace(TAG, (_, space: string, tag: string) => {
    tags.push(tag);
    return space;
  });
  return { text: rest.replace(/\s{2,}/g, ' ').trim(), tags: normalizeTags(tags) };
}

/** Tags typed in a tags field, with or without "#", separated by spaces or commas. */
export const parseTagField = (text: string) => normalizeTags(text.split(/[\s,、]+/));

export const formatTags = (tags: readonly string[] | undefined) => (tags ?? []).map((t) => '#' + t).join(' ');

/** A stable hue for a tag, so each tag keeps its color everywhere. */
export function tagHue(tag: string): number {
  let h = 0;
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

/** Tags in storage: comma-separated (commas are never part of a tag). */
export const tagsToStorage = (tags: readonly string[] | undefined) => (tags ?? []).join(',');
export const tagsFromStorage = (s: string | undefined) => (s ? normalizeTags(s.split(',')) : []);

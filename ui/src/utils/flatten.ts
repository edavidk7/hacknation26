import type { VibeTree } from "./types";

/**
 * Flatten a VibeTree into ACE-Step prompt format.
 * Follows the flattening rules from the spec.
 */
export function flattenTree(tree: VibeTree): string {
  const root = tree.root;
  const lines: string[] = [];

  // ── Tags ──────────────────────────────────────────
  const tagSet = new Set<string>(root.global.tags);

  for (const section of root.sections) {
    const b = section.branches;
    tagSet.add(b.genre.primary);
    b.genre.influences.forEach((i) => tagSet.add(i));
    tagSet.add(b.mood.primary);
    b.instruments.forEach((inst) => tagSet.add(inst.name));
  }

  lines.push(`Tags: ${[...tagSet].join(", ")}`);
  lines.push("");

  // ── Lyrics (structural markers + sonic details) ───
  lines.push("Lyrics:");
  for (const section of root.sections) {
    const b = section.branches;
    const sectionName =
      section.name.charAt(0).toUpperCase() + section.name.slice(1);
    lines.push(`[${sectionName}]`);

    const details: string[] = [];
    b.instruments.forEach((inst) => {
      details.push(`${inst.character} ${inst.name}`);
    });
    b.sonic_details.forEach((d) => details.push(d));

    if (b.mood.nuances.length > 0) {
      details.push(b.mood.nuances.join(", "));
    }

    lines.push(`(${details.join(", ")})`);
    lines.push("");
  }

  // ── Metadata ──────────────────────────────────────
  // Use first non-null values found across sections
  let bpm: number | null = null;
  let key: string | null = null;
  let timeSig: string | null = null;

  for (const section of root.sections) {
    const m = section.branches.metadata;
    if (bpm === null && m.suggested_bpm !== null) bpm = m.suggested_bpm;
    if (key === null && m.key !== null) key = m.key;
    if (timeSig === null && m.time_signature !== null)
      timeSig = m.time_signature;
  }

  if (bpm !== null) lines.push(`BPM: ${bpm}`);
  if (key !== null) lines.push(`Key: ${key}`);
  if (timeSig !== null) lines.push(`Time Signature: ${timeSig}`);
  lines.push(`Duration: ${root.global.duration_seconds}s`);

  return lines.join("\n");
}

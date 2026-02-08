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
    if (b.genre && typeof b.genre === "object" && "primary" in b.genre && b.genre.primary) {
      tagSet.add(b.genre.primary as string);
    }
    if (b.genre && typeof b.genre === "object" && "influences" in b.genre) {
      (b.genre.influences as unknown[]).forEach((i) => {
        if (typeof i === "string") tagSet.add(i);
      });
    }
    if (b.mood && typeof b.mood === "object" && "primary" in b.mood && b.mood.primary) {
      tagSet.add(b.mood.primary as string);
    }
    if (b.instruments && Array.isArray(b.instruments)) {
      (b.instruments as unknown[]).forEach((inst) => {
        if (typeof inst === "object" && inst !== null && "name" in inst) {
          tagSet.add((inst as {name: unknown}).name as string);
        }
      });
    }
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
    if (b.instruments && Array.isArray(b.instruments)) {
      (b.instruments as unknown[]).forEach((inst) => {
        if (typeof inst === "object" && inst !== null && "name" in inst && "character" in inst) {
          const instrument = inst as {character: unknown; name: unknown};
          details.push(`${instrument.character} ${instrument.name}`);
        }
      });
    }
    if (b.sonic_details && Array.isArray(b.sonic_details)) {
      (b.sonic_details as unknown[]).forEach((d) => {
        if (typeof d === "string") details.push(d);
      });
    }

    if (b.mood && typeof b.mood === "object" && "nuances" in b.mood) {
      const nuances = b.mood.nuances as unknown[];
      if (Array.isArray(nuances) && nuances.length > 0) {
        details.push(nuances.filter((n): n is string => typeof n === "string").join(", "));
      }
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
    if (m && typeof m === "object") {
      const metadata = m as Record<string, unknown>;
      if (bpm === null && typeof metadata.suggested_bpm === "number") bpm = metadata.suggested_bpm;
      if (key === null && typeof metadata.key === "string") key = metadata.key;
      if (timeSig === null && typeof metadata.time_signature === "string") timeSig = metadata.time_signature;
    }
  }

  if (bpm !== null) lines.push(`BPM: ${bpm}`);
  if (key !== null) lines.push(`Key: ${key}`);
  if (timeSig !== null) lines.push(`Time Signature: ${timeSig}`);
  lines.push(`Duration: ${root.global.duration_seconds}s`);

  return lines.join("\n");
}

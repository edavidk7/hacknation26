import type { VibeTree } from "./types";

/**
 * Convert a VibeTree into a markdown-formatted prompt suitable for feeding
 * to a music generation model.
 *
 * This produces a structured text representation that captures all the
 * hierarchical information from the tree.
 */
export function vibeTreeToPrompt(tree: VibeTree): string {
  const root = tree.root;
  const lines: string[] = [];

  // ── Title/Concept ──────────────────────────────────
  lines.push(`# ${root.concept}`);
  lines.push("");

  // ── Overall Arc ────────────────────────────────────
  if (root.global.overall_arc) {
    lines.push(`**Overall Arc:** ${root.global.overall_arc}`);
    lines.push("");
  }

  // ── Sections ───────────────────────────────────────
  lines.push("## Sections");
  lines.push("");

  for (const section of root.sections) {
    const b = section.branches;

    lines.push(`### ${section.name.charAt(0).toUpperCase() + section.name.slice(1)}`);
    lines.push("");

    // Dynamically iterate through all properties in branches
    for (const [key, value] of Object.entries(b)) {
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        continue;
      }

      // Format the key as a title
      const title = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
      lines.push(`**${title}:**`);

      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        lines.push(value.toString());
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "object") {
            // For object items, format nicely
            const itemStr = Object.entries(item as Record<string, unknown>)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ");
            lines.push(`- ${itemStr}`);
          } else {
            lines.push(`- ${item}`);
          }
        }
      } else if (typeof value === "object") {
        // For nested objects, format as key-value pairs
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          lines.push(`- ${k}: ${v}`);
        }
      }
      lines.push("");
    }
  }

  // ── Global Metadata ───────────────────────────────
  if (root.global.duration_seconds) {
    lines.push("## Global");
    lines.push(`- **Duration:** ${root.global.duration_seconds}s`);
    if (root.global.tags && root.global.tags.length > 0) {
      lines.push(`- **Tags:** ${root.global.tags.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Convert a VibeTree into a compact single-paragraph prompt.
 * Useful when you need a brief, inline description.
 */
export function vibeTreeToCompactPrompt(tree: VibeTree): string {
  const root = tree.root;
  const parts: string[] = [];

  parts.push(`"${root.concept}"`);

  if (root.global.overall_arc) {
    parts.push(`with an arc of ${root.global.overall_arc}`);
  }

  // Collect key elements from all sections
  const allMoods = new Set<string>();
  const allGenres = new Set<string>();
  const allInstruments = new Set<string>();

  for (const section of root.sections) {
    const b = section.branches;
    if (b.mood && typeof b.mood === "object" && "primary" in b.mood && b.mood.primary) {
      allMoods.add(b.mood.primary as string);
    }
    if (b.genre && typeof b.genre === "object" && "primary" in b.genre && b.genre.primary) {
      allGenres.add(b.genre.primary as string);
    }
    if (b.instruments && Array.isArray(b.instruments)) {
      (b.instruments as unknown[]).forEach((i: unknown) => {
        if (typeof i === "object" && i !== null && "name" in i) {
          allInstruments.add((i as {name: unknown}).name as string);
        }
      });
    }
  }

  if (allMoods.size > 0) {
    parts.push(`moods including ${[...allMoods].join(", ")}`);
  }

  if (allGenres.size > 0) {
    parts.push(`genres like ${[...allGenres].join(", ")}`);
  }

  if (allInstruments.size > 0) {
    parts.push(`featuring ${[...allInstruments].join(", ")}`);
  }

  if (root.global.duration_seconds) {
    parts.push(`(${root.global.duration_seconds}s)`);
  }

  return parts.join(", ");
}

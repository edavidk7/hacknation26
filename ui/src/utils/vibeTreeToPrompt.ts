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

    // Mood
    if (b.mood.primary) {
      lines.push(`**Mood:** ${b.mood.primary}`);
      if (b.mood.nuances && b.mood.nuances.length > 0) {
        lines.push(`- Nuances: ${b.mood.nuances.join(", ")}`);
      }
      lines.push("");
    }

    // Genre
    if (b.genre.primary) {
      lines.push(`**Genre:** ${b.genre.primary}`);
      if (b.genre.influences && b.genre.influences.length > 0) {
        lines.push(`- Influences: ${b.genre.influences.join(", ")}`);
      }
      lines.push("");
    }

    // Instruments
    if (b.instruments && b.instruments.length > 0) {
      lines.push("**Instruments:**");
      for (const inst of b.instruments) {
        let instLine = `- ${inst.name}`;
        if (inst.role) {
          instLine += ` (${inst.role})`;
        }
        if (inst.character) {
          instLine += `: ${inst.character}`;
        }
        lines.push(instLine);
      }
      lines.push("");
    }

    // Texture
    if (b.texture) {
      lines.push("**Texture:**");
      lines.push(`- Density: ${b.texture.density}`);
      lines.push(`- Movement: ${b.texture.movement}`);
      lines.push(`- Space: ${b.texture.space}`);
      lines.push("");
    }

    // Sonic Details
    if (b.sonic_details && b.sonic_details.length > 0) {
      lines.push("**Sonic Details:**");
      for (const detail of b.sonic_details) {
        lines.push(`- ${detail}`);
      }
      lines.push("");
    }

    // Metadata
    const m = b.metadata;
    if (m.tempo_feel || m.suggested_bpm || m.key || m.time_signature) {
      lines.push("**Metadata:**");
      if (m.tempo_feel) lines.push(`- Tempo Feel: ${m.tempo_feel}`);
      if (m.suggested_bpm) lines.push(`- BPM: ${m.suggested_bpm}`);
      if (m.key) lines.push(`- Key: ${m.key}`);
      if (m.time_signature) lines.push(`- Time Signature: ${m.time_signature}`);
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
    if (b.mood.primary) allMoods.add(b.mood.primary);
    if (b.genre.primary) allGenres.add(b.genre.primary);
    if (b.instruments) {
      b.instruments.forEach((i) => allInstruments.add(i.name));
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

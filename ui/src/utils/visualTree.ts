import type { Section, VisualNode } from "./types";
import { nodeId } from "./types";

/**
 * Create a blank Section with no defaults.
 */
export function createEmptySection(name: string): Section {
  return {
    name,
    weight: 0.25,
    branches: {
      mood: null,
      genre: null,
      instruments: [],
      texture: null,
      sonic_details: [],
      metadata: {},
    },
  };
}

/**
 * Create an empty visual tree for a section (just a root node, no children).
 * Uses the mood primary as the root vibe label.
 */
export function emptyVisualTree(vibe: string): VisualNode {
  return {
    id: nodeId(),
    label: vibe || "new vibe",
    kind: "section",
    children: [],
  };
}

/**
 * Convert a Section into a visual tree for rendering.
 * If branches.tree exists (from backend), use it directly.
 * Otherwise, fall back to the old branches structure.
 */
export function sectionToVisualTree(section: Section): VisualNode {
  const b = section.branches;
  
  // If we have the original tree structure, convert it directly
  if (b && typeof b === "object" && "tree" in b) {
    const songNode = b.tree as any;
    return songNodeToVisualTree(songNode, "section");
  }

  // Fallback to old structure (mood, genre, instruments, etc.)
  const br = b as any;
  const children: VisualNode[] = [];

  // Mood branch
  if (br.mood) {
    const moodChildren: VisualNode[] = (br.mood.nuances || []).map((n: string) => ({
      id: nodeId(),
      label: n,
      kind: "nuance" as const,
      children: [],
    }));
    const moodNode: VisualNode = {
      id: nodeId(),
      label: br.mood.primary,
      kind: "mood",
      children: moodChildren,
    };
    children.push(moodNode);
  }

  // Genre branch
  if (br.genre) {
    const genreChildren: VisualNode[] = (br.genre.influences || []).map((inf: string) => ({
      id: nodeId(),
      label: inf,
      kind: "influence" as const,
      children: [],
    }));
    const genreNode: VisualNode = {
      id: nodeId(),
      label: br.genre.primary,
      kind: "genre",
      children: genreChildren,
    };
    children.push(genreNode);
  }

  // Instruments branch
  if (br.instruments && br.instruments.length > 0) {
    const instChildren: VisualNode[] = br.instruments.map((inst: any) => ({
      id: nodeId(),
      label: inst.name,
      kind: "instrument" as const,
      children: [],
    }));
    const instrumentsNode: VisualNode = {
      id: nodeId(),
      label: "instruments",
      kind: "instruments",
      children: instChildren,
    };
    children.push(instrumentsNode);
  }

  // Texture branch
  if (br.texture) {
    const textureNode: VisualNode = {
      id: nodeId(),
      label: `${br.texture.density} · ${br.texture.movement} · ${br.texture.space}`,
      kind: "texture",
      children: [],
    };
    children.push(textureNode);
  }

  // Sonic details branch
  if (br.sonic_details && br.sonic_details.length > 0) {
    const sonicChildren: VisualNode[] = br.sonic_details.map((d: string) => ({
      id: nodeId(),
      label: d,
      kind: "detail" as const,
      children: [],
    }));
    const sonicNode: VisualNode = {
      id: nodeId(),
      label: "sonic details",
      kind: "sonic",
      children: sonicChildren,
    };
    children.push(sonicNode);
  }

  // Root = section name or "untitled"
  return {
    id: nodeId(),
    label: section.name || "untitled",
    kind: "section",
    children,
  };
}

/**
 * Convert a SongNode directly to a VisualNode tree.
 */
function songNodeToVisualTree(node: any, kind: string = "custom"): VisualNode {
  const children = (node.children || []).map((child: any) =>
    songNodeToVisualTree(child, "custom")
  );

  // Format label with value if present
  let label = node.name || "untitled";
  if (node.value !== null && node.value !== undefined) {
    const valueStr = formatValue(node.value);
    if (valueStr) {
      label = `${label}: ${valueStr}`;
    }
  }

  return {
    id: nodeId(),
    label,
    kind: kind as any,
    children,
  };
}

/**
 * Format a value for display.
 */
function formatValue(value: any): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return "";
}

/**
 * Convert a visual tree back to a partial Section update.
 * Reconstructs labels/children from the visual nodes.
 *
 * Handles both legacy branches (mood/genre/instruments/etc.)
 * and SongNode-tree format (branches.tree).
 */
export function visualTreeToSection(
  node: VisualNode,
  original: Section
): Section {
  const section = structuredClone(original);
  const b = section.branches;

  // If the original section uses SongNode-tree format, reconstruct it
  if (b && typeof b === "object" && "tree" in b) {
    (section.branches as any).tree = visualNodeToSongNode(node);
    return section;
  }

  // Legacy format: sync individual branch types
  for (const child of node.children) {
    switch (child.kind) {
      case "mood":
        if (!section.branches.mood) {
          section.branches.mood = { primary: "", nuances: [] };
        }
        (section.branches as any).mood.primary = child.label;
        (section.branches as any).mood.nuances = child.children.map((c) => c.label);
        break;
      case "genre":
        if (!section.branches.genre) {
          section.branches.genre = { primary: "", influences: [] };
        }
        (section.branches as any).genre.primary = child.label;
        (section.branches as any).genre.influences = child.children.map((c) => c.label);
        break;
      case "instruments":
        (section.branches as any).instruments = child.children.map((c, i) => ({
          name: c.label,
          role: (original.branches as any).instruments?.[i]?.role ?? "texture",
          character: (original.branches as any).instruments?.[i]?.character ?? "",
        }));
        break;
      case "texture":
        // texture label is "density · movement · space"
        // Keep original unless user edits it at detail level
        break;
      case "sonic":
        (section.branches as any).sonic_details = child.children.map((c) => c.label);
        break;
    }
  }

  return section;
}

/**
 * Convert a VisualNode tree back to a SongNode structure.
 * Reverses the songNodeToVisualTree transform by parsing
 * "name: value" labels back into { name, value, children }.
 */
function visualNodeToSongNode(node: VisualNode): any {
  const { name, value } = parseLabelToNameValue(node.label);

  const songNode: any = {
    name,
    value: value ?? null,
    children: node.children.map((child) => visualNodeToSongNode(child)),
    metadata: {},
  };

  return songNode;
}

/**
 * Parse a visual node label like "name: value" back into name and value parts.
 * The forward transform formats as "name: formattedValue".
 */
function parseLabelToNameValue(label: string): { name: string; value: any } {
  const colonIdx = label.indexOf(": ");
  if (colonIdx === -1) {
    return { name: label, value: null };
  }

  const name = label.substring(0, colonIdx);
  const valueStr = label.substring(colonIdx + 2);

  // Try to parse as number
  const num = Number(valueStr);
  if (!isNaN(num) && valueStr.trim() !== "") {
    return { name, value: num };
  }

  // Try to parse as comma-separated list (from Array.join(", "))
  if (valueStr.includes(", ")) {
    return { name, value: valueStr.split(", ") };
  }

  // Try to parse as JSON object
  if (valueStr.startsWith("{") || valueStr.startsWith("[")) {
    try {
      return { name, value: JSON.parse(valueStr) };
    } catch {
      // fall through to string
    }
  }

  return { name, value: valueStr };
}

/**
 * Immutable node operations for the visual tree.
 */
export function editVisualNode(
  tree: VisualNode,
  id: string,
  newLabel: string
): VisualNode {
  if (tree.id === id) return { ...tree, label: newLabel };
  return {
    ...tree,
    children: tree.children.map((c) => editVisualNode(c, id, newLabel)),
  };
}

export function deleteVisualNode(tree: VisualNode, id: string): VisualNode {
  return {
    ...tree,
    children: tree.children
      .filter((c) => c.id !== id)
      .map((c) => deleteVisualNode(c, id)),
  };
}

export function addVisualChild(
  tree: VisualNode,
  parentId: string
): VisualNode {
  if (tree.id === parentId) {
    return {
      ...tree,
      children: [
        ...tree.children,
        { id: nodeId(), label: "new", kind: "custom", children: [] },
      ],
    };
  }
  return {
    ...tree,
    children: tree.children.map((c) => addVisualChild(c, parentId)),
  };
}

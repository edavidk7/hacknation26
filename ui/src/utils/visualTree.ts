import type { Section, VisualNode } from "./types";
import { nodeId } from "./types";

/**
 * Convert a Section into a visual tree for rendering.
 * Root = section name, children = mood, genre, instruments, texture, sonic details.
 */
export function sectionToVisualTree(section: Section): VisualNode {
  const b = section.branches;

  // Mood branch
  const moodChildren: VisualNode[] = b.mood.nuances.map((n) => ({
    id: nodeId(),
    label: n,
    kind: "nuance" as const,
    children: [],
  }));
  const moodNode: VisualNode = {
    id: nodeId(),
    label: b.mood.primary,
    kind: "mood",
    children: moodChildren,
  };

  // Genre branch
  const genreChildren: VisualNode[] = b.genre.influences.map((inf) => ({
    id: nodeId(),
    label: inf,
    kind: "influence" as const,
    children: [],
  }));
  const genreNode: VisualNode = {
    id: nodeId(),
    label: b.genre.primary,
    kind: "genre",
    children: genreChildren,
  };

  // Instruments branch
  const instChildren: VisualNode[] = b.instruments.map((inst) => ({
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

  // Texture branch
  const textureNode: VisualNode = {
    id: nodeId(),
    label: `${b.texture.density} · ${b.texture.movement} · ${b.texture.space}`,
    kind: "texture",
    children: [],
  };

  // Sonic details branch
  const sonicChildren: VisualNode[] = b.sonic_details.map((d) => ({
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

  // Root = section
  return {
    id: nodeId(),
    label: section.name,
    kind: "section",
    children: [moodNode, genreNode, instrumentsNode, textureNode, sonicNode],
  };
}

/**
 * Convert a visual tree back to a partial Section update.
 * Reconstructs labels/children from the visual nodes.
 */
export function visualTreeToSection(
  node: VisualNode,
  original: Section
): Section {
  const section = structuredClone(original);
  section.name = node.label;

  for (const child of node.children) {
    switch (child.kind) {
      case "mood":
        section.branches.mood.primary = child.label;
        section.branches.mood.nuances = child.children.map((c) => c.label);
        break;
      case "genre":
        section.branches.genre.primary = child.label;
        section.branches.genre.influences = child.children.map((c) => c.label);
        break;
      case "instruments":
        section.branches.instruments = child.children.map((c, i) => ({
          name: c.label,
          role: original.branches.instruments[i]?.role ?? "texture",
          character: original.branches.instruments[i]?.character ?? "",
        }));
        break;
      case "texture":
        // texture label is "density · movement · space"
        // Keep original unless user edits it at detail level
        break;
      case "sonic":
        section.branches.sonic_details = child.children.map((c) => c.label);
        break;
    }
  }

  return section;
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

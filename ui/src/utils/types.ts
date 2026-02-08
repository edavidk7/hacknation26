// ── Vibe Tree Schema Types ──────────────────────────────
// Arbitrary structure - branches can contain any properties

export type SectionBranches = Record<string, unknown>;

export interface Section {
  name: string;
  weight: number;
  branches: SectionBranches;
}

export interface GlobalSettings {
  overall_arc?: string;
  tags?: string[];
  duration_seconds?: number;
}

export interface VibeTreeRoot {
  concept: string;
  image_interpretation?: string | null;
  sections: Section[];
  global: GlobalSettings;
}

export interface VibeTree {
  root: VibeTreeRoot;
}

// ── Visual Tree Node (for the tree visualization) ───────
// Each section becomes a visual tree. Nodes are generic
// with a label + optional children, and a reference to
// what part of the data they represent.

export type NodeKind =
  | "section"
  | "mood"
  | "genre"
  | "instruments"
  | "texture"
  | "sonic"
  | "instrument"
  | "nuance"
  | "influence"
  | "detail"
  | "custom";

export interface VisualNode {
  id: string;
  label: string;
  kind: NodeKind;
  children: VisualNode[];
}

let _nodeCounter = 0;
export function nodeId(): string {
  return `vn-${++_nodeCounter}`;
}

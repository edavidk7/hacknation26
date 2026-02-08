import { useRef, useCallback, useState } from "react";
import type { VisualNode } from "../utils/types";
import TreeNode from "./TreeNode";
import EdgeCanvas from "./EdgeCanvas";

// ── Section label colors (cycles for arbitrary count) ──

const SECTION_ACCENTS = [
  "#669bbc",
  "#89b3ce",
  "#7aadd0",
  "#c1121f",
  "#ef8389",
  "#d4c5a0",
  "#fdf0d5",
  "#003049",
];

interface TreeData {
  root: VisualNode;
  label: string; // section name, e.g. "intro" | "body" | "outro"
}

interface Props {
  trees: TreeData[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onEdit: (treeIndex: number, nodeId: string, newLabel: string) => void;
  onDelete: (treeIndex: number, nodeId: string) => void;
  onAdd: (treeIndex: number, parentId: string) => void;
  onSelect?: (nodeId: string | null) => void;
  selectedId?: string | null;
  onAddSection?: () => void;
  onRemoveSection?: (index: number) => void;
  onRenameSection?: (index: number, newName: string) => void;
}

export type { TreeData };

// ── Icons ──────────────────────────────────────────────

const PlusIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CrossIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function TreeStack({
  trees,
  activeIndex,
  onActiveChange,
  onEdit,
  onDelete,
  onAdd,
  onSelect,
  selectedId,
  onAddSection,
  onRemoveSection,
  onRenameSection,
}: Props) {
  if (trees.length === 0) return null;

  const activeTree = trees[activeIndex];

  return (
    <div className="tree-stack">
      {/* ── Single tree display ──────────────────────────── */}
      <div className="tree-stack-viewport">
        <div
          className="tree-layer tree-layer--active"
          style={
            {
              "--layer-accent": SECTION_ACCENTS[activeIndex % SECTION_ACCENTS.length],
              zIndex: 10,
            } as React.CSSProperties
          }
        >
          <div className="tree-container">
            <EdgeCanvas
              deps={[activeTree.root, true]}
              color={
                SECTION_ACCENTS[activeIndex % SECTION_ACCENTS.length] + "40"
              }
              lineWidth={1.5}
            />
            <TreeNode
              node={activeTree.root}
              isRoot
              onEdit={(id, label) => onEdit(activeIndex, id, label)}
              onDelete={(id) => onDelete(activeIndex, id)}
              onAdd={(parentId) => onAdd(activeIndex, parentId)}
              onSelect={(id) => onSelect?.(id)}
              selectedId={selectedId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

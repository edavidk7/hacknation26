import type { VisualNode } from "../utils/types";
import type { NodeDiff } from "../utils/treeDiff";
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
  diffMap?: Map<string, NodeDiff[]>;
}

export type { TreeData };

export default function TreeStack({
  trees,
  activeIndex,
  onEdit,
  onDelete,
  onAdd,
  onSelect,
  selectedId,
  diffMap,
}: Props) {
  if (trees.length === 0) return null;

  const activeTree = trees[activeIndex];

  // Helper to find diff status for a node
  const findDiffStatus = (nodeId: string): "added" | "removed" | "changed" | "unchanged" => {
    const diffs = diffMap?.get(activeTree.root.id);
    if (!diffs) return "unchanged";

    const findInDiff = (diff: NodeDiff): any => {
      if (diff.id === nodeId) return diff.status;
      if (diff.childrenDiff) {
        for (const child of diff.childrenDiff) {
          const found = findInDiff(child);
          if (found) return found;
        }
      }
      return null;
    };

    for (const diff of diffs) {
      const status = findInDiff(diff);
      if (status) return status;
    }
    return "unchanged";
  };

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
              diffStatus={findDiffStatus(activeTree.root.id)}
              findDiffStatus={findDiffStatus}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useRef, useCallback } from "react";
import type { VisualNode } from "../utils/types";
import TreeNode from "./TreeNode";
import EdgeCanvas from "./EdgeCanvas";

// ── Section label colors (matches KIND_COLORS.section but per-index) ──

const SECTION_ACCENTS = ["#6c63ff", "#4ecdc4", "#ffb66b"];

interface TreeData {
  root: VisualNode;
  label: string; // "intro" | "body" | "outro"
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
}

export type { TreeData };

export default function TreeStack({
  trees,
  activeIndex,
  onActiveChange,
  onEdit,
  onDelete,
  onAdd,
  onSelect,
  selectedId,
}: Props) {
  // Refs for each tree container (for EdgeCanvas)
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);

  const setContainerRef = useCallback(
    (el: HTMLDivElement | null, index: number) => {
      containerRefs.current[index] = el;
    },
    []
  );

  if (trees.length === 0) return null;

  return (
    <div className="tree-stack">
      {/* ── Tab bar ────────────────────────────────────── */}
      <div className="tree-tabs">
        {trees.map((t, i) => (
          <button
            key={i}
            className={`tree-tab ${i === activeIndex ? "tree-tab--active" : ""}`}
            style={
              {
                "--tab-accent": SECTION_ACCENTS[i % SECTION_ACCENTS.length],
              } as React.CSSProperties
            }
            onClick={() => onActiveChange(i)}
          >
            <span className="tree-tab-dot" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Stacked tree layers ────────────────────────── */}
      <div className="tree-stack-viewport">
        {trees.map((t, i) => {
          const isActive = i === activeIndex;
          // Offset & scale for inactive layers
          const offset = (i - activeIndex) * 18;
          const scale = isActive ? 1 : 0.96;

          return (
            <div
              key={i}
              className={`tree-layer ${isActive ? "tree-layer--active" : "tree-layer--inactive"}`}
              style={
                {
                  "--layer-offset": `${offset}px`,
                  "--layer-scale": scale,
                  "--layer-accent":
                    SECTION_ACCENTS[i % SECTION_ACCENTS.length],
                  zIndex: isActive ? 10 : 5 - Math.abs(i - activeIndex),
                } as React.CSSProperties
              }
            >
              <div
                className="tree-container"
                ref={(el) => setContainerRef(el, i)}
              >
                <EdgeCanvas
                  containerRef={{
                    current: containerRefs.current[i] ?? null,
                  }}
                  deps={[t.root, isActive]}
                  color={
                    isActive
                      ? SECTION_ACCENTS[i % SECTION_ACCENTS.length] + "40"
                      : "rgba(80,80,120,0.12)"
                  }
                  lineWidth={isActive ? 1.5 : 1}
                />
                <TreeNode
                  node={t.root}
                  isRoot
                  onEdit={(id, label) => onEdit(i, id, label)}
                  onDelete={(id) => onDelete(i, id)}
                  onAdd={(parentId) => onAdd(i, parentId)}
                  onSelect={isActive ? (id) => onSelect?.(id) : undefined}
                  selectedId={isActive ? selectedId : null}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

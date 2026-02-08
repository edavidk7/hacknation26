import { useRef, useCallback, useState } from "react";
import type { VisualNode } from "../utils/types";
import TreeNode from "./TreeNode";
import EdgeCanvas from "./EdgeCanvas";

// ── Section label colors (cycles for arbitrary count) ──

const SECTION_ACCENTS = [
  "#0077b6",
  "#00b4d8",
  "#48cae4",
  "#90e0ef",
  "#0096c7",
  "#ade8f4",
  "#caf0f8",
  "#023e8a",
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
  // Inline rename state
  const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(
    (index: number, currentLabel: string) => {
      setRenamingIndex(index);
      setRenameValue(currentLabel);
      // Focus after render
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    },
    []
  );

  const finishRename = useCallback(() => {
    if (renamingIndex !== null) {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== trees[renamingIndex]?.label) {
        onRenameSection?.(renamingIndex, trimmed);
      }
      setRenamingIndex(null);
      setRenameValue("");
    }
  }, [renamingIndex, renameValue, trees, onRenameSection]);

  const cancelRename = useCallback(() => {
    setRenamingIndex(null);
    setRenameValue("");
  }, []);

  if (trees.length === 0) return null;

  return (
    <div className="tree-stack">
      {/* ── Section buttons row ─────────────────────────── */}
      <div className="tree-section-btns">
        {trees.map((t, i) => (
          <div key={i} className="tree-section-btn-wrap">
            {renamingIndex === i ? (
              <div
                className="tree-section-btn tree-section-btn--active tree-section-btn--editing"
                style={
                  {
                    "--tab-accent": SECTION_ACCENTS[i % SECTION_ACCENTS.length],
                  } as React.CSSProperties
                }
              >
                <span className="tree-section-dot" />
                <input
                  ref={renameInputRef}
                  className="tree-section-rename-input"
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      finishRename();
                    }
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={finishRename}
                />
              </div>
            ) : (
              <button
                className={`tree-section-btn ${i === activeIndex ? "tree-section-btn--active" : ""}`}
                style={
                  {
                    "--tab-accent": SECTION_ACCENTS[i % SECTION_ACCENTS.length],
                  } as React.CSSProperties
                }
                onClick={() => onActiveChange(i)}
                onDoubleClick={() => startRename(i, t.label)}
              >
                <span className="tree-section-dot" />
                {t.label}
              </button>
            )}

            {/* Remove button (only if more than 1 section) */}
            {trees.length > 1 && onRemoveSection && (
              <button
                className="tree-section-remove"
                title={`Remove ${t.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSection(i);
                }}
              >
                <CrossIcon />
              </button>
            )}
          </div>
        ))}

        {/* Add section button */}
        {onAddSection && (
          <button
            className="tree-section-btn tree-section-btn--add"
            onClick={onAddSection}
            title="Add section"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {/* ── Tree layers ────────────────────────────────── */}
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
              <div className="tree-container">
                <EdgeCanvas
                  deps={[t.root, isActive]}
                  color={
                    isActive
                      ? SECTION_ACCENTS[i % SECTION_ACCENTS.length] + "40"
                      : "rgba(0,119,182,0.12)"
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

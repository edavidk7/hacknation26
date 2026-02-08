import { useState, useRef, useEffect, useCallback } from "react";
import type { VisualNode, NodeKind } from "../utils/types";
import type { DiffStatus } from "../utils/treeDiff";

// ── Kind → color mapping ────────────────────────────────

const KIND_COLORS: Record<NodeKind, string> = {
  section: "#669bbc",
  mood: "#fdf0d5",
  genre: "#89b3ce",
  instruments: "#c1121f",
  texture: "#d4c5a0",
  sonic: "#669bbc",
  instrument: "#ef8389",
  nuance: "#fdf0d5",
  influence: "#7aadd0",
  detail: "#d4c5a0",
  custom: "#669bbc",
};

// ── Icons ───────────────────────────────────────────────

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CrossIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── TreeNode Component ──────────────────────────────────

interface Props {
  node: VisualNode;
  isRoot?: boolean;
  onEdit: (id: string, newLabel: string) => void;
  onDelete: (id: string) => void;
  onAdd: (parentId: string) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  diffStatus?: DiffStatus;
  findDiffStatus?: (nodeId: string) => DiffStatus;
}

export default function TreeNode({
  node,
  isRoot = false,
  onEdit,
  onDelete,
  onAdd,
  onSelect,
  selectedId,
  diffStatus = "unchanged",
  findDiffStatus,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(node.label);
  }, [node.label]);

  const finishEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== node.label) {
      onEdit(node.id, trimmed);
    }
    setEditing(false);
    setEditValue(node.label);
  }, [editValue, node.label, node.id, onEdit]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditValue(node.label);
  }, [node.label]);

  const accentColor = KIND_COLORS[node.kind] ?? "#888";
  const isSelected = selectedId === node.id;

  return (
    <div className="branch">
      <div className="node-wrap">
        <div
          className={`node ${isRoot ? "node--root" : ""} ${isSelected ? "node--selected" : ""} ${diffStatus !== "unchanged" ? `node--${diffStatus}` : ""}`}
          data-node-id={node.id}
          style={{
            "--accent": accentColor,
          } as React.CSSProperties}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(node.id);
          }}
        >
          {/* Kind indicator dot */}
          <span className="node-dot" style={{ background: accentColor }} />

          {editing ? (
            <input
              ref={inputRef}
              className="node-input"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finishEdit();
                }
                if (e.key === "Escape") cancelEdit();
              }}
              onBlur={finishEdit}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="node-label">{node.label}</span>
          )}

          {/* Hover toolbar */}
          <div className="toolbar">
            <button
              className="tb-btn tb-edit"
              title="Edit"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              <PencilIcon />
            </button>
            <button
              className="tb-btn tb-add"
              title="Add child"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(node.id);
              }}
            >
              <PlusIcon />
            </button>
            {!isRoot && (
              <button
                className="tb-btn tb-del"
                title="Delete"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
              >
                <CrossIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onDelete={onDelete}
              onAdd={onAdd}
              onSelect={onSelect}
              selectedId={selectedId}
              diffStatus={findDiffStatus ? findDiffStatus(child.id) : "unchanged"}
              findDiffStatus={findDiffStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

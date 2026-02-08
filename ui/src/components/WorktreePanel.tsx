import { useCallback, useState } from "react";
import type { VisualNode } from "../utils/types";

interface NodeChange {
  path: string;
  node_name: string;
  type: "added" | "modified" | "deleted";
  original?: unknown;
  modified?: unknown;
}

interface WorktreePanelProps {
  originalTree: VisualNode | null;
  modifiedTree: VisualNode | null;
  changes: NodeChange[];
  onDiffCompute?: (changes: NodeChange[]) => void;
}

export default function WorktreePanel({
  originalTree,
  modifiedTree,
  changes,
  onDiffCompute,
}: WorktreePanelProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const renderChange = (change: NodeChange, index: number) => {
    const changeColor =
      change.type === "added"
        ? "#4caf50"
        : change.type === "deleted"
          ? "#f44336"
          : "#ff9800";

    return (
      <div key={index} className="change-item" style={{ borderLeftColor: changeColor }}>
        <div className="change-header">
          <span className="change-type" style={{ color: changeColor }}>
            {change.type.toUpperCase()}
          </span>
          <span className="change-name">{change.node_name}</span>
          <code className="change-path">{change.path}</code>
        </div>
        {change.original && change.type !== "added" && (
          <div className="change-value">
            <span className="label">Before:</span>
            <code>{JSON.stringify(change.original).substring(0, 100)}</code>
          </div>
        )}
        {change.modified && change.type !== "deleted" && (
          <div className="change-value">
            <span className="label">After:</span>
            <code>{JSON.stringify(change.modified).substring(0, 100)}</code>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="worktree-panel">
      <div className="worktree-header">
        <h3>Worktree Diff</h3>
        <div className="diff-stats">
          <span className="stat added">
            +{changes.filter((c) => c.type === "added").length}
          </span>
          <span className="stat modified">
            ~{changes.filter((c) => c.type === "modified").length}
          </span>
          <span className="stat deleted">
            -{changes.filter((c) => c.type === "deleted").length}
          </span>
        </div>
      </div>

      <div className="changes-list">
        {changes.length === 0 ? (
          <p className="empty-message">No changes yet</p>
        ) : (
          changes.map((change, idx) => renderChange(change, idx))
        )}
      </div>
    </div>
  );
}

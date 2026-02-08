import { useCallback, useEffect, useState } from "react";
import type { VibeTree } from "../utils/types";

interface Snapshot {
  snapshot_id: string;
  timestamp: string;
  tree_title: string;
  audio_url: string | null;
}

interface SnapshotSidebarProps {
  onLoadSnapshot: (tree: VibeTree, snapshotId: string) => void;
  currentSnapshotId: string | null;
}

export default function SnapshotSidebar({
  onLoadSnapshot,
  currentSnapshotId,
}: SnapshotSidebarProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/snapshots");
      if (!res.ok) throw new Error("Failed to load snapshots");
      const data = await res.json();
      setSnapshots(data.snapshots || []);
    } catch (error) {
      console.error("Error loading snapshots:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleLoadSnapshot = useCallback(
    async (snapshotId: string) => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/snapshot/${snapshotId}`
        );
        if (!res.ok) throw new Error("Failed to load snapshot");
        const data = await res.json();

        // Transform backend snapshot to VibeTree format
        const vibeTree: VibeTree = {
          root: {
            concept: data.tree_title || "Restored Snapshot",
            sections: [],
            global: {},
          },
        };

        onLoadSnapshot(vibeTree, snapshotId);
      } catch (error) {
        console.error("Error loading snapshot:", error);
      }
    },
    [onLoadSnapshot]
  );

  return (
    <aside className="snapshot-sidebar">
      <div className="sidebar-header">
        <h3>Generation History</h3>
        <button
          className="btn btn--small"
          onClick={loadSnapshots}
          disabled={loading}
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      <div className="snapshots-list">
        {snapshots.length === 0 ? (
          <p className="empty-message">No snapshots yet</p>
        ) : (
          snapshots.map((snapshot) => (
            <div
              key={snapshot.snapshot_id}
              className={`snapshot-item ${
                snapshot.snapshot_id === currentSnapshotId ? "active" : ""
              }`}
              onClick={() => handleLoadSnapshot(snapshot.snapshot_id)}
            >
              <div className="snapshot-title">{snapshot.tree_title}</div>
              <div className="snapshot-time">
                {new Date(snapshot.timestamp).toLocaleTimeString()}
              </div>
              {snapshot.audio_url && (
                <div className="snapshot-audio-indicator">🔊</div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

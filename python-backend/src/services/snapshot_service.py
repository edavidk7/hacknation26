"""Service for managing tree snapshots and computing diffs."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from src.models.snapshot import NodeDiff, TreeDiff, TreeSnapshot
from src.models.song_tree import SongCharacteristics, SongNode

log = logging.getLogger(__name__)


def _flatten_tree(
    node: dict | SongNode, path: str = "root", node_id: str | None = None
) -> dict[str, dict]:
    """
    Flatten a tree into {path: {name, value, children_count}}.
    Returns a mapping of path → node_info for easy diffing.
    """
    if isinstance(node, SongNode):
        node_dict = node.model_dump()
    else:
        node_dict = node

    node_id = node_id or str(uuid4())[:8]

    flattened = {
        path: {
            "id": node_id,
            "name": node_dict.get("name", ""),
            "value": node_dict.get("value"),
            "metadata": node_dict.get("metadata", {}),
            "children_count": len(node_dict.get("children", [])),
        }
    }

    for i, child in enumerate(node_dict.get("children", [])):
        child_path = f"{path}/children[{i}]"
        child_id = str(uuid4())[:8]
        flattened.update(_flatten_tree(child, child_path, child_id))

    return flattened


def compute_tree_diff(
    original: SongCharacteristics | dict,
    modified: SongCharacteristics | dict,
) -> list[NodeDiff]:
    """
    Compute differences between two trees.
    Returns list of NodeDiff objects.
    """
    if isinstance(original, SongCharacteristics):
        orig_dict = original.model_dump()
    else:
        orig_dict = original

    if isinstance(modified, SongCharacteristics):
        mod_dict = modified.model_dump()
    else:
        mod_dict = modified

    orig_flat = _flatten_tree(orig_dict.get("root", orig_dict))
    mod_flat = _flatten_tree(mod_dict.get("root", mod_dict))

    diffs: list[NodeDiff] = []

    # Check for modified and deleted nodes
    for path, orig_info in orig_flat.items():
        if path not in mod_flat:
            # Node deleted
            diffs.append(
                NodeDiff(
                    node_id=orig_info["id"],
                    path=path,
                    node_name=orig_info["name"],
                    change_type="deleted",
                    original_value=orig_info["value"],
                )
            )
        else:
            # Node exists in both, check if modified
            mod_info = mod_flat[path]
            if (
                orig_info["value"] != mod_info["value"]
                or orig_info["metadata"] != mod_info["metadata"]
                or orig_info["name"] != mod_info["name"]
            ):
                diffs.append(
                    NodeDiff(
                        node_id=orig_info["id"],
                        path=path,
                        node_name=mod_info["name"],
                        change_type="modified",
                        original_value=orig_info["value"],
                        modified_value=mod_info["value"],
                    )
                )

    # Check for added nodes
    for path, mod_info in mod_flat.items():
        if path not in orig_flat:
            diffs.append(
                NodeDiff(
                    node_id=mod_info["id"],
                    path=path,
                    node_name=mod_info["name"],
                    change_type="added",
                    modified_value=mod_info["value"],
                )
            )

    return diffs


def create_snapshot(
    tree: SongCharacteristics | dict,
    generation_params: dict | None = None,
    ace_metadata: dict | None = None,
    ace_generation_info: str | None = None,
    audio_url: str | None = None,
    reference_audio_path: str | None = None,
) -> TreeSnapshot:
    """Create a snapshot of the current tree state."""
    snapshot_id = str(uuid4())

    if isinstance(tree, dict):
        tree = SongCharacteristics(**tree)

    # Extract ACE params if provided
    ace_prompt = generation_params.get("prompt", "") if generation_params else ""
    ace_lyrics = generation_params.get("lyrics", "") if generation_params else ""

    snapshot = TreeSnapshot(
        snapshot_id=snapshot_id,
        timestamp=datetime.utcnow(),
        tree=tree,
        ace_prompt=ace_prompt,
        ace_lyrics=ace_lyrics,
        generation_params=generation_params or {},
        audio_url=audio_url,
        ace_metadata=ace_metadata or {},
        ace_generation_info=ace_generation_info,
        reference_audio_path=reference_audio_path,
    )

    log.info(f"Created snapshot {snapshot_id}")
    return snapshot


def create_diff_summary(diffs: list[NodeDiff]) -> str:
    """Generate a human-readable summary of changes."""
    if not diffs:
        return "No changes"

    added = sum(1 for d in diffs if d.change_type == "added")
    modified = sum(1 for d in diffs if d.change_type == "modified")
    deleted = sum(1 for d in diffs if d.change_type == "deleted")

    parts = []
    if added > 0:
        parts.append(f"{added} node{'s' if added != 1 else ''} added")
    if modified > 0:
        parts.append(f"{modified} node{'s' if modified != 1 else ''} modified")
    if deleted > 0:
        parts.append(f"{deleted} node{'s' if deleted != 1 else ''} deleted")

    return ", ".join(parts)


class SnapshotStore:
    """In-memory store for snapshots (production should use database)."""

    def __init__(self):
        self.snapshots: dict[str, TreeSnapshot] = {}
        self.diffs: dict[str, TreeDiff] = {}

    def save_snapshot(self, snapshot: TreeSnapshot) -> None:
        """Save a snapshot."""
        self.snapshots[snapshot.snapshot_id] = snapshot
        log.info(f"Saved snapshot {snapshot.snapshot_id}")

    def get_snapshot(self, snapshot_id: str) -> TreeSnapshot | None:
        """Retrieve a snapshot by ID."""
        return self.snapshots.get(snapshot_id)

    def list_snapshots(self) -> list[TreeSnapshot]:
        """List all snapshots, sorted by timestamp (newest first)."""
        return sorted(
            self.snapshots.values(), key=lambda s: s.timestamp, reverse=True
        )

    def save_diff(self, diff: TreeDiff) -> None:
        """Save a diff between two snapshots."""
        diff_id = f"{diff.from_snapshot_id}→{diff.to_snapshot_id}"
        self.diffs[diff_id] = diff
        log.info(f"Saved diff {diff_id}")

    def get_diff(self, from_id: str, to_id: str) -> TreeDiff | None:
        """Retrieve a diff between two snapshots."""
        diff_id = f"{from_id}→{to_id}"
        return self.diffs.get(diff_id)

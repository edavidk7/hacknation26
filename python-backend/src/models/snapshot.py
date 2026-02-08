"""Snapshot and diff models for the music generation worktree."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from src.models.song_tree import SongCharacteristics, SongNode


class NodeDiff(BaseModel):
    """Represents a change to a single tree node."""

    node_id: str = Field(description="Unique identifier for the node")
    path: str = Field(description="Path in tree: 'root/children[0]/name'")
    node_name: str = Field(description="Name of the node")
    change_type: str = Field(
        description="Type of change: 'added', 'modified', 'deleted'"
    )
    original_value: Any = Field(default=None, description="Original node value")
    modified_value: Any = Field(default=None, description="Modified node value")


class TreeSnapshot(BaseModel):
    """A frozen point-in-time snapshot of the tree and its generation state."""

    snapshot_id: str = Field(description="Unique snapshot identifier")
    timestamp: datetime = Field(description="When snapshot was created")
    tree: SongCharacteristics = Field(description="The tree at this snapshot")
    ace_prompt: str | None = Field(
        default=None, description="The ACE-Step prompt used for generation"
    )
    ace_lyrics: str | None = Field(
        default=None, description="The ACE-Step lyrics used for generation"
    )
    generation_params: dict[str, Any] = Field(
        default_factory=dict, description="Full ACE-Step parameters used"
    )
    audio_url: str | None = Field(
        default=None, description="URL to generated audio (relative path)"
    )
    audio_bytes: bytes | None = Field(
        default=None, description="Raw audio bytes (not stored in DB, transient)"
    )
    ace_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadata from ACE-Step (bpm, key, duration, etc)",
    )
    ace_generation_info: str | None = Field(
        default=None, description="Low-level ACE prompt from LM synthesis"
    )
    reference_audio_path: str | None = Field(
        default=None, description="Path to uploaded reference audio"
    )


class TreeDiff(BaseModel):
    """A diff between two tree snapshots."""

    from_snapshot_id: str = Field(
        description="ID of the original snapshot (or 'initial')"
    )
    to_snapshot_id: str = Field(description="ID of the modified snapshot")
    node_diffs: list[NodeDiff] = Field(
        default_factory=list, description="List of node changes"
    )
    summary: str = Field(
        default="", description="Human-readable summary of changes"
    )

    def has_changes(self) -> bool:
        """Check if there are any node changes."""
        return len(self.node_diffs) > 0

import type { VibeTree, VisualNode } from "./types";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  prompt: string;
  tree: VibeTree;
  visualTrees: VisualNode[];
  flattenedPrompt: string | null;
  audioUrl?: string | null;
  descriptions?: Record<string, unknown>;
}

let _historyIdCounter = 0;

export function createHistoryEntry(
  prompt: string,
  tree: VibeTree,
  visualTrees: VisualNode[],
  flattenedPrompt: string | null,
  audioUrl?: string | null,
  descriptions?: Record<string, unknown>
): HistoryEntry {
  return {
    id: `hist-${++_historyIdCounter}`,
    timestamp: Date.now(),
    prompt,
    tree,
    visualTrees,
    flattenedPrompt,
    audioUrl,
    descriptions,
  };
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

import type { VisualNode } from "./types";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface NodeDiff {
  id: string;
  status: DiffStatus;
  label?: string;
  childrenDiff?: NodeDiff[];
}

/**
 * Compute differences between two trees.
 * Returns a diff tree that mirrors the current tree structure,
 * but tracks what changed compared to the previous tree.
 */
export function diffTrees(
  currentTree: VisualNode,
  previousTree: VisualNode | null
): NodeDiff {
  if (!previousTree) {
    // No previous tree, everything is added
    return {
      id: currentTree.id,
      status: "added",
      label: currentTree.label,
      childrenDiff: currentTree.children.map((child) =>
        diffTrees(child, null)
      ),
    };
  }

  // Find if this node exists in the previous tree (by id)
  const findNodeById = (node: VisualNode, id: string): VisualNode | null => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
    return null;
  };

  const prevNode = findNodeById(previousTree, currentTree.id);

  if (!prevNode) {
    // Node is new
    return {
      id: currentTree.id,
      status: "added",
      label: currentTree.label,
      childrenDiff: currentTree.children.map((child) =>
        diffTrees(child, null)
      ),
    };
  }

  // Node exists, check if it changed
  const labelChanged = currentTree.label !== prevNode.label;
  const status = labelChanged ? "changed" : "unchanged";

  // Recursively diff children
  const childrenDiff: NodeDiff[] = [];

  // Current children
  for (const child of currentTree.children) {
    const prevChild = prevNode.children.find((c) => c.id === child.id);
    childrenDiff.push(diffTrees(child, prevChild || null));
  }

  // Removed children (in prev but not in current)
  for (const prevChild of prevNode.children) {
    if (!currentTree.children.find((c) => c.id === prevChild.id)) {
      childrenDiff.push({
        id: prevChild.id,
        status: "removed",
        label: prevChild.label,
        childrenDiff: prevChild.children.map((child) =>
          diffTrees(child, null)
        ),
      });
    }
  }

  return {
    id: currentTree.id,
    status,
    label: currentTree.label,
    childrenDiff:
      childrenDiff.length > 0
        ? childrenDiff
        : currentTree.children.map((child) => diffTrees(child, null)),
  };
}

/**
 * Flatten a diff tree to get all nodes with their status
 */
export function flattenDiff(diff: NodeDiff): NodeDiff[] {
  const result: NodeDiff[] = [diff];
  if (diff.childrenDiff) {
    for (const child of diff.childrenDiff) {
      result.push(...flattenDiff(child));
    }
  }
  return result;
}

/**
 * Type for the SongCharacteristics structure returned by the backend.
 */
export interface SongNode {
  name: string;
  value?: unknown;
  children?: SongNode[];
  metadata?: Record<string, unknown>;
}

/**
 * Convert a SongNode tree to markdown format (hierarchical list).
 * This is useful for displaying the raw tree structure or converting
 * it to a text-based prompt format.
 */
export function songNodeToMarkdown(node: SongNode, depth: number = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  const bullet = depth === 0 ? "" : "- ";

  // Format the node name
  let nodeLine = `${indent}${bullet}${node.name}`;

  // Add value if present
  if (node.value !== undefined && node.value !== null) {
    const valueStr = formatValue(node.value);
    nodeLine += `: ${valueStr}`;
  }

  lines.push(nodeLine);

  // Recursively process children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      lines.push(songNodeToMarkdown(child, depth + 1));
    }
  }

  return lines.join("\n");
}

/**
 * Convert a value to a readable string.
 */
function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Extract a simple text representation of the SongNode tree.
 * Useful for summarizing the structure without full markdown.
 */
export function songNodeToText(node: SongNode): string {
  const lines: string[] = [];

  function traverse(n: SongNode, depth: number = 0) {
    const indent = "  ".repeat(depth);
    lines.push(`${indent}${n.name}`);

    if (n.children && n.children.length > 0) {
      for (const child of n.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(node);
  return lines.join("\n");
}

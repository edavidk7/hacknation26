import type {
  VibeTree,
  Section,
} from "./types";

/**
 * Type for the SongCharacteristics structure returned by the backend.
 */
export interface SongNode {
  name: string;
  value?: unknown;
  children?: SongNode[];
  metadata?: Record<string, unknown>;
}

export interface SongCharacteristics {
  root?: SongNode;
}

/**
 * Transform a SongCharacteristics tree from the backend into a VibeTree structure.
 * This maps the arbitrary tree structure into the expected section-based format.
 */
export function transformSongCharacteristicsToVibeTree(
  data: any
): VibeTree {
  // Handle both direct SongCharacteristics and the API response wrapper
  const characteristics = data?.vibe_tree || data;
  
  if (!characteristics) {
    throw new Error("No vibe_tree data in API response");
  }
  
  const root = characteristics.root;
  
  if (!root) {
    console.error("SongCharacteristics structure:", characteristics);
    throw new Error("Invalid SongCharacteristics: missing root property");
  }

  // Store the entire tree structure as-is in a single section
  const sections = [
    {
      name: root.name || "Untitled",
      weight: 1,
      branches: {
        tree: root,
      },
    },
  ];

  return {
    root: {
      concept: root.name || "Untitled Composition",
      image_interpretation: null,
      sections,
      global: {
        overall_arc: root.metadata?.overall_arc as string || "evolving journey",
        tags: (root.metadata?.tags as string[]) || [],
        duration_seconds: (root.metadata?.duration_seconds as number) || 180,
      },
    },
  };
}

/**
 * Create an empty section with no defaults.
 */
export function createEmptySection(name: string): Section {
  return {
    name,
    weight: 1 / 3,
    branches: {
      mood: null,
      genre: null,
      instruments: [],
      texture: null,
      sonic_details: [],
      metadata: {},
    },
  };
}



import type {
  VibeTree,
  Section,
  SectionBranches,
  Mood,
  Genre,
  Texture,
  Instrument,
  SectionMetadata,
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
  root: SongNode;
}

/**
 * Transform a SongCharacteristics tree from the backend into a VibeTree structure.
 * This maps the arbitrary tree structure into the expected section-based format.
 */
export function transformSongCharacteristicsToVibeTree(
  characteristics: SongCharacteristics
): VibeTree {
  const root = characteristics.root;

  // Extract concept from root name
  const concept = root.name || "Untitled Composition";

  // Parse all children recursively to extract global info and sections
  const globalInfo = extractGlobalInfo(root);

  // Parse children into sections (intro, body, outro)
  const sections = parseChildrenToSections(root.children || []);

  // If we have fewer than 3 sections, pad with empty ones
  while (sections.length < 3) {
    const sectionNames = ["intro", "body", "outro"];
    sections.push(createEmptySection(sectionNames[sections.length]));
  }

  return {
    root: {
      concept,
      image_interpretation: null,
      sections: sections.slice(0, 3), // Take first 3 sections
      global: {
        overall_arc: globalInfo.arc || "evolving journey",
        tags: globalInfo.tags,
        duration_seconds: globalInfo.duration || 180,
      },
    },
  };
}

/**
 * Extract global-level information from the entire tree.
 */
function extractGlobalInfo(root: SongNode): {
  arc: string | null;
  tags: string[];
  duration: number;
} {
  const tags = new Set<string>();
  let arc: string | null = null;
  let duration = 180;

  function traverse(node: SongNode) {
    const nameLower = node.name.toLowerCase();

    if (nameLower.includes("arc")) {
      arc = extractStringValue(node.value) || node.name;
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(root);
  return { arc, tags: [...tags], duration };
}

/**
 * Parse children SongNodes into Section objects.
 */
function parseChildrenToSections(children: SongNode[]): Section[] {
  const sections: Section[] = [];

  // Identify section nodes
  const sectionNodes = children.filter((c) => {
    const nameLower = c.name.toLowerCase();
    return (
      nameLower.includes("intro") ||
      nameLower.includes("verse") ||
      nameLower.includes("body") ||
      nameLower.includes("chorus") ||
      nameLower.includes("outro") ||
      nameLower.includes("bridge")
    );
  });

  // If we found explicit sections, use them
  if (sectionNodes.length > 0) {
    for (let i = 0; i < Math.min(sectionNodes.length, 3); i++) {
      const sectionNode = sectionNodes[i];
      const section = parseSectionNode(sectionNode, sections.length);
      sections.push(section);
    }
  }

  // Otherwise, try to map top-level children as sections
  if (sections.length === 0) {
    for (let i = 0; i < Math.min(children.length, 3); i++) {
      const child = children[i];
      const section = parseSectionNode(child, i);
      sections.push(section);
    }
  }

  return sections;
}

/**
 * Parse a single SongNode into a Section.
 */
function parseSectionNode(node: SongNode, index: number): Section {
  const branches = parseBranches(node.children || []);

  // Infer section name from index
  const sectionNames = ["intro", "body", "outro"];
  const sectionName = sectionNames[index] || node.name;

  return {
    name: sectionName,
    weight: 1 / 3,
    branches,
  };
}

/**
 * Parse children nodes into SectionBranches.
 */
function parseBranches(children: SongNode[]): SectionBranches {
  const branches: SectionBranches = {
    mood: createDefaultMood(),
    genre: createDefaultGenre(),
    instruments: [],
    texture: createDefaultTexture(),
    sonic_details: [],
    metadata: createDefaultMetadata(),
  };

  // Flatten all text content from children for sonic details
  const sonicDetailsSet = new Set<string>();

  function extractFromNode(node: SongNode, depth: number = 0) {
    const nameLower = node.name.toLowerCase();

    if (nameLower.includes("mood") || nameLower.includes("emotion")) {
      branches.mood = parseMood(node);
    } else if (nameLower.includes("genre")) {
      branches.genre = parseGenre(node);
    } else if (nameLower.includes("instrument")) {
      branches.instruments = parseInstruments(node);
    } else if (nameLower.includes("texture")) {
      branches.texture = parseTexture(node);
    } else if (
      nameLower.includes("tempo") ||
      nameLower.includes("bpm") ||
      nameLower.includes("key") ||
      nameLower.includes("metadata")
    ) {
      Object.assign(branches.metadata, parseMetadata(node));
    } else {
      // Collect as sonic detail
      const detailStr = formatNodeAsDetail(node);
      sonicDetailsSet.add(detailStr);
    }

    if (node.children) {
      for (const child of node.children) {
        extractFromNode(child, depth + 1);
      }
    }
  }

  for (const child of children) {
    extractFromNode(child);
  }

  branches.sonic_details = [...sonicDetailsSet].filter((d) => d.length > 0);
  return branches;
}

/**
 * Format a node as a sonic detail string.
 */
function formatNodeAsDetail(node: SongNode): string {
  const value = extractStringValue(node.value);
  if (value && value !== node.name) {
    return `${node.name}: ${value}`;
  }
  return node.name;
}

/**
 * Parse mood from a SongNode.
 */
function parseMood(node: SongNode): Mood {
  const value = extractStringValue(node.value);
  const nuances = node.children?.map((c) => c.name) || [];

  return {
    primary: value || node.name || "mysterious",
    nuances,
  };
}

/**
 * Parse genre from a SongNode.
 */
function parseGenre(node: SongNode): Genre {
  const value = extractStringValue(node.value);
  const influences = node.children?.map((c) => c.name) || [];

  return {
    primary: value || node.name || "ambient",
    influences,
  };
}

/**
 * Parse instruments from a SongNode.
 */
function parseInstruments(node: SongNode): Instrument[] {
  if (node.children && node.children.length > 0) {
    return node.children.map((child) => ({
      name: child.name,
      role: (child.metadata?.role as string) || "texture",
      character: (child.metadata?.character as string) || "",
    }));
  }

  if (typeof node.value === "string") {
    return [
      {
        name: node.value,
        role: "texture",
        character: "",
      },
    ];
  }

  return [];
}

/**
 * Parse texture from a SongNode.
 */
function parseTexture(node: SongNode): Texture {
  const density =
    ((node.metadata?.density as "sparse" | "moderate" | "dense") || "moderate");
  const movement =
    ((node.metadata?.movement as "static" | "slow-evolving" | "dynamic") ||
      "slow-evolving");
  const space = ((node.metadata?.space as "intimate" | "open" | "vast") || "open");

  return { density, movement, space };
}

/**
 * Parse metadata from a SongNode.
 */
function parseMetadata(node: SongNode): Partial<SectionMetadata> {
  const metadata: Partial<SectionMetadata> = {};
  const nameLower = node.name.toLowerCase();

  if (nameLower.includes("tempo")) {
    metadata.tempo_feel = extractStringValue(node.value) || "moderate";
  } else if (nameLower.includes("bpm")) {
    metadata.suggested_bpm = extractNumberValue(node.value) || null;
  } else if (nameLower.includes("key")) {
    metadata.key = extractStringValue(node.value) || null;
  } else if (nameLower.includes("time")) {
    metadata.time_signature = extractStringValue(node.value) || null;
  }

  return metadata;
}

/**
 * Extract a string value from an unknown type.
 */
function extractStringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text);
  }
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * Extract a number value from an unknown type.
 */
function extractNumberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseInt(value, 10);
    return !isNaN(num) ? num : null;
  }
  return null;
}

/**
 * Create a default empty section.
 */
export function createEmptySection(name: string): Section {
  return {
    name,
    weight: 1 / 3,
    branches: {
      mood: createDefaultMood(),
      genre: createDefaultGenre(),
      instruments: [],
      texture: createDefaultTexture(),
      sonic_details: [],
      metadata: createDefaultMetadata(),
    },
  };
}

/**
 * Create default mood.
 */
function createDefaultMood(): Mood {
  return {
    primary: "neutral",
    nuances: [],
  };
}

/**
 * Create default genre.
 */
function createDefaultGenre(): Genre {
  return {
    primary: "ambient",
    influences: [],
  };
}

/**
 * Create default texture.
 */
function createDefaultTexture(): Texture {
  return {
    density: "moderate",
    movement: "slow-evolving",
    space: "open",
  };
}

/**
 * Create default metadata.
 */
function createDefaultMetadata(): SectionMetadata {
  return {
    tempo_feel: "moderate",
    suggested_bpm: null,
    key: null,
    time_signature: null,
  };
}

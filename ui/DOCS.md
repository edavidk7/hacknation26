# Vibe Tree UI — Documentation

Interactive visual tree editor for multimodal music generation. Built with Vite + React + TypeScript.

---

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # preview production build
npm run lint       # ESLint
```

---

## Architecture

```
User Input (text + image)
        |
   Kimi K2.5 (LLM)
        |
   Vibe Tree JSON
        |
   Prompt Assembly (flatten.ts)
        |
   ACE-Step 1.5 -> Audio
```

The UI manages two synchronized data models:

- **VibeTree** — canonical JSON data (sections, instruments, mood, genre, etc.)
- **VisualNode[]** — rendering model (tree of labeled nodes for the canvas)

### Bidirectional Sync

| Edit source | Direction |
|---|---|
| TreeNode toolbar (rename, add, delete) | `VisualNode -> visualTreeToSection() -> VibeTree` |
| DetailPanel (metadata, texture, instrument props) | `VibeTree -> sectionToVisualTree() -> VisualNode` |
| `flattenTree()` always operates on the `VibeTree` model |

---

## File Structure

```
src/
├── main.tsx                    # React entry point
├── App.tsx                     # Root component, all state management
├── App.css                     # Full dark-theme styles
├── index.css                   # Global reset
├── components/
│   ├── TreeNode.tsx            # Recursive visual tree node
│   ├── EdgeCanvas.tsx          # Canvas bezier curve connectors
│   ├── TreeStack.tsx           # Tabbed multi-section tree viewer
│   └── DetailPanel.tsx         # Node detail editor panel
└── utils/
    ├── types.ts                # All TypeScript types/interfaces
    ├── flatten.ts              # VibeTree -> ACE-Step prompt
    ├── visualTree.ts           # Section <-> VisualNode conversion + CRUD
    └── sampleData.ts           # Hardcoded fjord example
```

---

## Data Types (`src/utils/types.ts`)

### VibeTree Schema

```ts
interface VibeTree {
  root: VibeTreeRoot;
}

interface VibeTreeRoot {
  concept: string;
  image_interpretation: string | null;
  sections: Section[];
  global: GlobalSettings;
}

interface Section {
  name: string;           // "intro" | "body" | "outro"
  weight: number;         // 0-1, relative section importance
  branches: SectionBranches;
}

interface SectionBranches {
  mood: Mood;
  genre: Genre;
  instruments: Instrument[];
  texture: Texture;
  sonic_details: string[];
  metadata: SectionMetadata;
}

interface Mood {
  primary: string;
  nuances: string[];
}

interface Genre {
  primary: string;
  influences: string[];
}

interface Instrument {
  name: string;
  role: string;            // "lead" | "bass" | "rhythm" | "texture" | "percussion"
  character: string;       // free-text description
}

interface Texture {
  density: "sparse" | "moderate" | "dense";
  movement: "static" | "slow-evolving" | "dynamic";
  space: "intimate" | "open" | "vast";
}

interface SectionMetadata {
  tempo_feel: string;
  suggested_bpm: number | null;
  key: string | null;
  time_signature: string | null;
}

interface GlobalSettings {
  overall_arc: string;
  tags: string[];
  duration_seconds: number;
}
```

### Visual Tree

```ts
type NodeKind =
  | "section" | "mood" | "genre" | "instruments" | "texture"
  | "sonic" | "instrument" | "nuance" | "influence" | "detail" | "custom";

interface VisualNode {
  id: string;
  label: string;
  kind: NodeKind;
  children: VisualNode[];
}

function nodeId(): string;   // returns "vn-{counter}"
```

---

## Utility API (`src/utils/`)

### `flatten.ts`

```ts
flattenTree(tree: VibeTree): string
```

Converts a VibeTree to an ACE-Step prompt string. Output format:

```
Tags: ambient, nordic, cinematic, ...

Lyrics:
[Intro]
(glacial, sustained bowed pad, barely audible sub bass, ...)

[Body]
(warmer piano, field recording, ...)

BPM: 60
Key: D minor
Duration: 180s
```

**Flattening rules:**
1. Tags = union of `global.tags` + all genre primaries/influences + mood primaries + instrument names
2. Each section becomes a `[SectionName]` structural marker
3. Sonic details, instrument characters, and mood nuances are concatenated in parentheses
4. BPM, key, time signature use first non-null value across sections

### `visualTree.ts`

```ts
sectionToVisualTree(section: Section): VisualNode
```
Converts a Section to a visual tree. Root = section name, children = mood, genre, instruments, texture, sonic details.

```ts
visualTreeToSection(node: VisualNode, original: Section): Section
```
Converts a visual tree back to a Section, preserving original data for fields not represented in the tree (e.g. instrument role/character).

```ts
editVisualNode(tree: VisualNode, id: string, newLabel: string): VisualNode
```
Immutable label update by node ID.

```ts
deleteVisualNode(tree: VisualNode, id: string): VisualNode
```
Immutable node removal by ID (removes node + all descendants).

```ts
addVisualChild(tree: VisualNode, parentId: string): VisualNode
```
Immutable child addition. New node: `{ kind: "custom", label: "new" }`.

---

## Components

### `TreeNode`

Recursive tree node renderer with inline editing and hover toolbar.

```ts
interface Props {
  node: VisualNode;
  isRoot?: boolean;                                    // disables delete button
  onEdit: (id: string, newLabel: string) => void;
  onDelete: (id: string) => void;
  onAdd: (parentId: string) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}
```

**Node kind colors:**

| Kind | Color |
|---|---|
| section | `#6c63ff` |
| mood | `#ffb66b` |
| genre | `#4ecdc4` |
| instruments | `#a282ff` |
| texture | `#ff8a80` |
| sonic | `#64b5f6` |
| instrument | `#ce93d8` |
| nuance | `#ffcc80` |
| influence | `#80cbc4` |
| detail | `#90caf9` |
| custom | `#888` |

### `EdgeCanvas`

Canvas overlay that draws bezier curves between parent and child nodes.

```ts
interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  deps?: unknown[];          // redraw triggers
  color?: string;            // default: "rgba(108,99,255,0.25)"
  lineWidth?: number;        // default: 1.5
}
```

Supports HiDPI. Redraws on deps change, window resize, and DOM mutations (MutationObserver).

### `TreeStack`

Tabbed multi-section tree viewer. Renders up to 3 trees with tab switching animation.

```ts
interface TreeData {
  root: VisualNode;
  label: string;             // tab label
}

interface Props {
  trees: TreeData[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onEdit: (treeIndex: number, nodeId: string, newLabel: string) => void;
  onDelete: (treeIndex: number, nodeId: string) => void;
  onAdd: (treeIndex: number, parentId: string) => void;
  onSelect?: (nodeId: string | null) => void;
  selectedId?: string | null;
}
```

**Behavior:**
- Active tree: full color, interactive, `z-index: 10`
- Inactive trees: opacity 0, desaturated, non-interactive
- CSS transitions: 0.45s cubic-bezier on transform/opacity/filter

### `DetailPanel`

Context-sensitive detail editor. Appears when a node is selected.

```ts
interface Props {
  selectedId: string | null;
  tree: VisualNode | null;
  section: Section | null;
  onClose: () => void;
  onUpdateSection: (updater: (s: Section) => Section) => void;
}
```

**Context-sensitive fields by node kind:**

| Node kind | Editable fields |
|---|---|
| `instrument` | role (select), character (text) |
| `texture` | density, movement, space (selects) |
| `section` | tempo_feel, BPM, key, time_signature, weight (slider) |
| all others | kind description, parent context, children count |

---

## App State (`App.tsx`)

| State | Type | Purpose |
|---|---|---|
| `prompt` | `string` | User text input |
| `imageFile` | `File \| null` | Uploaded image |
| `imagePreview` | `string \| null` | Data URL preview |
| `tree` | `VibeTree \| null` | Canonical data model |
| `generating` | `boolean` | Loading spinner |
| `showFlattened` | `boolean` | Toggle flattened prompt |
| `visualTrees` | `VisualNode[]` | One visual tree per section |
| `activeSection` | `number` | Active tab index |
| `selectedNodeId` | `string \| null` | Selected node for DetailPanel |
| `audioUrl` | `string \| null` | Generated audio (placeholder) |

**Derived values:**
- `flattenedPrompt` — memoized `flattenTree(tree)`
- `treeDataArray` — memoized `TreeData[]` for TreeStack

---

## Theming

- **Background:** `#0b0b1a`
- **Panel background:** `#111128`
- **Primary accent:** `#6c63ff` (purple)
- **Font:** Inter / SF Pro Display / system-ui
- **CSS custom properties:** `--accent`, `--tab-accent`, `--layer-offset`, `--layer-scale`
- **Responsive breakpoint:** 768px

---

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| react | ^19.2.0 | UI framework |
| react-dom | ^19.2.0 | DOM renderer |
| vite | ^7.2.4 | Build tool + dev server |
| typescript | ~5.9.3 | Type checking |
| @vitejs/plugin-react | ^5.1.1 | React HMR/Babel |
| picomatch | ^4.0.3 | Glob matching (Vite dep) |

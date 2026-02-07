import { useState, useMemo, useRef, useCallback } from "react";
import type { VibeTree, VisualNode, Section } from "./utils/types";
import { FJORD_EXAMPLE } from "./utils/sampleData";
import { flattenTree } from "./utils/flatten";
import {
  sectionToVisualTree,
  visualTreeToSection,
  editVisualNode,
  deleteVisualNode,
  addVisualChild,
} from "./utils/visualTree";
import TreeStack from "./components/TreeStack";
import type { TreeData } from "./components/TreeStack";
import DetailPanel from "./components/DetailPanel";
import "./App.css";

function App() {
  // ── Input state ────────────────────────────────────
  const [prompt, setPrompt] = useState("make it feel lonely but hopeful");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Vibe Tree state ────────────────────────────────
  const [tree, setTree] = useState<VibeTree | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showFlattened, setShowFlattened] = useState(false);

  // ── Visual trees (one per section) ─────────────────
  const [visualTrees, setVisualTrees] = useState<VisualNode[]>([]);
  const [activeSection, setActiveSection] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ── Audio state ────────────────────────────────────
  const [audioUrl] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────
  const flattenedPrompt = useMemo(
    () => (tree ? flattenTree(tree) : null),
    [tree]
  );

  const treeDataArray: TreeData[] = useMemo(() => {
    if (!tree) return [];
    return visualTrees.map((vt, i) => ({
      root: vt,
      label: tree.root.sections[i]?.name ?? `section ${i}`,
    }));
  }, [visualTrees, tree]);

  // ── Sync visual trees back to the VibeTree model ───
  const syncToModel = useCallback(
    (newVisualTrees: VisualNode[], currentTree: VibeTree) => {
      const updated = structuredClone(currentTree);
      newVisualTrees.forEach((vt, i) => {
        if (updated.root.sections[i]) {
          updated.root.sections[i] = visualTreeToSection(
            vt,
            updated.root.sections[i]
          );
        }
      });
      setTree(updated);
    },
    []
  );

  // ── Handlers: input ────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1200));

    const sample = structuredClone(FJORD_EXAMPLE);
    setTree(sample);

    // Convert each section to a visual tree
    const vTrees = sample.root.sections.map((s) => sectionToVisualTree(s));
    setVisualTrees(vTrees);
    setActiveSection(0);
    setSelectedNodeId(null);
    setGenerating(false);
  };

  // ── Handlers: tree ops ─────────────────────────────
  const handleEdit = useCallback(
    (treeIndex: number, nodeId: string, newLabel: string) => {
      setVisualTrees((prev) => {
        const next = [...prev];
        next[treeIndex] = editVisualNode(next[treeIndex], nodeId, newLabel);
        if (tree) syncToModel(next, tree);
        return next;
      });
    },
    [tree, syncToModel]
  );

  const handleDelete = useCallback(
    (treeIndex: number, nodeId: string) => {
      setVisualTrees((prev) => {
        const next = [...prev];
        next[treeIndex] = deleteVisualNode(next[treeIndex], nodeId);
        if (tree) syncToModel(next, tree);
        return next;
      });
      setSelectedNodeId((current) => (current === nodeId ? null : current));
    },
    [tree, syncToModel]
  );

  const handleAdd = useCallback(
    (treeIndex: number, parentId: string) => {
      setVisualTrees((prev) => {
        const next = [...prev];
        next[treeIndex] = addVisualChild(next[treeIndex], parentId);
        if (tree) syncToModel(next, tree);
        return next;
      });
    },
    [tree, syncToModel]
  );

  const handleSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // ── Handler: update section from detail panel ──────
  const handleUpdateSection = useCallback(
    (updater: (s: Section) => Section) => {
      if (!tree) return;
      const updated = structuredClone(tree);
      updated.root.sections[activeSection] = updater(
        updated.root.sections[activeSection]
      );
      setTree(updated);

      // Re-derive visual tree for updated section
      const newVt = sectionToVisualTree(updated.root.sections[activeSection]);
      setVisualTrees((prev) => {
        const next = [...prev];
        next[activeSection] = newVt;
        return next;
      });
    },
    [tree, activeSection]
  );

  // ── Handler: global settings ───────────────────────
  const handleGlobalArc = useCallback(
    (value: string) => {
      if (!tree) return;
      const updated = structuredClone(tree);
      updated.root.global.overall_arc = value;
      setTree(updated);
    },
    [tree]
  );

  const handleGlobalDuration = useCallback(
    (value: number) => {
      if (!tree) return;
      const updated = structuredClone(tree);
      updated.root.global.duration_seconds = value;
      setTree(updated);
    },
    [tree]
  );

  const handleMusicGenerate = () => {
    alert(
      "ACE-Step music generation would be triggered here with the flattened prompt.\n\nSee the flattened output for what would be sent."
    );
  };

  // ── Active section data (for detail panel) ─────────
  const activeVisualTree = visualTrees[activeSection] ?? null;
  const activeSectionData = tree?.root.sections[activeSection] ?? null;

  return (
    <div className="app">
      {/* ── Header ──────────────────────────────────── */}
      <header className="header">
        <div className="header-content">
          <div className="logo-mark">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <h1 className="logo-text">Vibe Tree</h1>
          <span className="logo-sub">multimodal music generation</span>
        </div>
      </header>

      <main className="main">
        {/* ── Input Panel ──────────────────────────────── */}
        <section className="panel input-panel">
          <h2 className="panel-title">Input</h2>

          <div className="input-group">
            <label className="input-label">Describe your vibe</label>
            <textarea
              className="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a rainy evening in Tokyo, neon reflections on wet pavement..."
              rows={3}
            />
          </div>

          <div className="input-group">
            <label className="input-label">
              Reference image{" "}
              <span className="optional">(optional)</span>
            </label>
            <div
              className={`image-upload ${imagePreview ? "has-image" : ""}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <div className="image-preview-wrap">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="image-preview"
                  />
                  <button
                    className="image-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageFile(null);
                      setImagePreview(null);
                      if (fileInputRef.current)
                        fileInputRef.current.value = "";
                    }}
                  >
                    x
                  </button>
                </div>
              ) : (
                <div className="image-placeholder">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Click to upload</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                hidden
              />
            </div>
            {imageFile && (
              <span className="image-name">{imageFile.name}</span>
            )}
          </div>

          <button
            className="btn btn--primary"
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
          >
            {generating ? (
              <>
                <span className="spinner" />
                Generating Tree...
              </>
            ) : (
              "Generate Vibe Tree"
            )}
          </button>
        </section>

        {/* ── Tree Visualization ────────────────────────── */}
        {tree && treeDataArray.length > 0 && (
          <section className="panel tree-panel">
            <div className="panel-header">
              <h2 className="panel-title">Vibe Tree</h2>
              <div className="panel-actions">
                <button
                  className={`btn btn--ghost ${showFlattened ? "btn--active" : ""}`}
                  onClick={() => setShowFlattened(!showFlattened)}
                >
                  {showFlattened ? "Hide" : "Show"} Flattened Prompt
                </button>
                <button
                  className="btn btn--accent"
                  onClick={handleMusicGenerate}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Generate Music
                </button>
              </div>
            </div>

            {/* Global settings bar */}
            <div className="global-bar">
              <div className="global-field">
                <span className="global-field-label">Arc</span>
                <input
                  className="global-input"
                  type="text"
                  value={tree.root.global.overall_arc}
                  onChange={(e) => handleGlobalArc(e.target.value)}
                />
              </div>
              <div className="global-field global-field--small">
                <span className="global-field-label">Duration</span>
                <input
                  className="global-input global-input--number"
                  type="number"
                  value={tree.root.global.duration_seconds}
                  onChange={(e) =>
                    handleGlobalDuration(Number(e.target.value))
                  }
                />
                <span className="global-field-unit">s</span>
              </div>
            </div>

            {/* Tree stack */}
            <TreeStack
              trees={treeDataArray}
              activeIndex={activeSection}
              onActiveChange={setActiveSection}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
              onSelect={handleSelect}
              selectedId={selectedNodeId}
            />

            {/* Detail panel (conditional) */}
            {selectedNodeId && (
              <DetailPanel
                selectedId={selectedNodeId}
                tree={activeVisualTree}
                section={activeSectionData}
                onClose={() => setSelectedNodeId(null)}
                onUpdateSection={handleUpdateSection}
              />
            )}

            {/* Flattened output */}
            {showFlattened && flattenedPrompt && (
              <div className="flattened-output">
                <h3 className="flattened-title">ACE-Step Prompt</h3>
                <pre className="flattened-pre">{flattenedPrompt}</pre>
              </div>
            )}
          </section>
        )}

        {/* ── Audio Player ──────────────────────────────── */}
        {audioUrl && (
          <section className="panel audio-panel">
            <h2 className="panel-title">Output</h2>
            <audio controls src={audioUrl} className="audio-player" />
            <button className="btn btn--ghost">Refine</button>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

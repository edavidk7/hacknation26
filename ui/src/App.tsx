import { useState, useMemo, useRef, useCallback } from "react";
import type { VibeTree, VisualNode, Section } from "./utils/types";
import { FJORD_EXAMPLE } from "./utils/sampleData";
import { flattenTree } from "./utils/flatten";
import {
  sectionToVisualTree,
  emptyVisualTree,
  createEmptySection,
  visualTreeToSection,
  editVisualNode,
  deleteVisualNode,
  addVisualChild,
} from "./utils/visualTree";
import { transformSongCharacteristicsToVibeTree } from "./utils/transform";
import TreeStack from "./components/TreeStack";
import type { TreeData } from "./components/TreeStack";
import DetailPanel from "./components/DetailPanel";
import Showcase from "./components/Showcase";
import "./App.css";

function App() {
  // ── Input state ────────────────────────────────────
  const [prompt, setPrompt] = useState("make it feel lonely but hopeful");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setImageFiles((prev) => [...prev, ...newFiles]);

    // Generate previews for each new file
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setImagePreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });

    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAudioFile(e.target.files?.[0] ?? null);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoFile(e.target.files?.[0] ?? null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Prepare form data with files and text
      const formData = new FormData();
      formData.append("text", prompt);
      imageFiles.forEach((file) => formData.append("files", file));
      if (audioFile) formData.append("files", audioFile);
      if (videoFile) formData.append("files", videoFile);

      // Step 1: Submit generation request
      const generateRes = await fetch("http://localhost:8000/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!generateRes.ok) {
        throw new Error(`API error: ${generateRes.status}`);
      }

      const { job_id } = await generateRes.json();

      // Step 2: Poll for completion
      let completed = false;
      let attempts = 0;
      const maxAttempts = 600; // 10 minutes with 1s polls

      while (!completed && attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 1000)); // Poll every 1 second

        const statusRes = await fetch(
          `http://localhost:8000/api/status/${job_id}`
        );
        if (!statusRes.ok) {
          throw new Error(`Status check failed: ${statusRes.status}`);
        }

        const job = await statusRes.json();

        if (job.status === "completed") {
          if (!job.result) {
            throw new Error("No result returned from API");
          }

          // Transform SongCharacteristics to VibeTree
          const vibeTree = transformSongCharacteristicsToVibeTree(job.result);
          setTree(vibeTree);

          // Populate visual trees
          const vTrees = vibeTree.root.sections.map((s, i) =>
            i === 1
              ? sectionToVisualTree(s)
              : emptyVisualTree(s.branches.mood.primary)
          );
          setVisualTrees(vTrees);
          setActiveSection(1);
          setSelectedNodeId(null);
          completed = true;
        } else if (job.status === "failed") {
          throw new Error(job.error || "Generation failed");
        }
      }

      if (!completed) {
        throw new Error("Generation timeout");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      alert(`Error: ${message}`);
      console.error("Generation error:", error);
    } finally {
      setGenerating(false);
    }
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

  // ── Handlers: section management ──────────────────
  const handleAddSection = useCallback(() => {
    if (!tree) return;
    const updated = structuredClone(tree);
    const newSection = createEmptySection(`section ${updated.root.sections.length + 1}`);
    updated.root.sections.push(newSection);
    setTree(updated);

    const newVt = emptyVisualTree(newSection.branches.mood.primary);
    setVisualTrees((prev) => [...prev, newVt]);
    setActiveSection(updated.root.sections.length - 1);
    setSelectedNodeId(null);
  }, [tree]);

  const handleRemoveSection = useCallback(
    (index: number) => {
      if (!tree || tree.root.sections.length <= 1) return;
      const updated = structuredClone(tree);
      updated.root.sections.splice(index, 1);
      setTree(updated);

      setVisualTrees((prev) => prev.filter((_, i) => i !== index));

      // Adjust active section
      setActiveSection((current) => {
        if (current >= updated.root.sections.length)
          return updated.root.sections.length - 1;
        if (current > index) return current - 1;
        return current;
      });
      setSelectedNodeId(null);
    },
    [tree]
  );

  const handleRenameSection = useCallback(
    (index: number, newName: string) => {
      if (!tree) return;
      const updated = structuredClone(tree);
      updated.root.sections[index].name = newName;
      setTree(updated);
    },
    [tree]
  );

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
              Reference images{" "}
              <span className="optional">(optional, multiple)</span>
            </label>
            <div
              className={`image-upload ${imagePreviews.length > 0 ? "has-image" : ""}`}
              onClick={() => imageInputRef.current?.click()}
            >
              {imagePreviews.length > 0 ? (
                <div className="multi-preview-grid">
                  {imagePreviews.map((src, i) => (
                    <div key={i} className="multi-preview-item">
                      <img
                        src={src}
                        alt={`Upload ${i + 1}`}
                        className="image-preview"
                      />
                      <button
                        className="image-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(i);
                        }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  <div className="multi-preview-add">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
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
                  <span>Click to upload images</span>
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                hidden
              />
            </div>
            {imageFiles.length > 0 && (
              <span className="image-name">
                {imageFiles.length} image{imageFiles.length > 1 ? "s" : ""} selected
              </span>
            )}
          </div>

          {/* Audio upload */}
          <div className="input-group">
            <label className="input-label">
              Audio reference{" "}
              <span className="optional">(optional)</span>
            </label>
            <div
              className={`media-upload ${audioFile ? "has-media" : ""}`}
              onClick={() => audioInputRef.current?.click()}
            >
              {audioFile ? (
                <div className="media-file-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c1121f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span className="media-file-name">{audioFile.name}</span>
                  <button
                    className="media-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAudioFile(null);
                      if (audioInputRef.current) audioInputRef.current.value = "";
                    }}
                  >
                    x
                  </button>
                </div>
              ) : (
                <div className="media-placeholder">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span>Upload audio clip</span>
                </div>
              )}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.flac,.aac"
                onChange={handleAudioUpload}
                hidden
              />
            </div>
          </div>

          {/* Video upload */}
          <div className="input-group">
            <label className="input-label">
              Video reference{" "}
              <span className="optional">(optional)</span>
            </label>
            <div
              className={`media-upload ${videoFile ? "has-media" : ""}`}
              onClick={() => videoInputRef.current?.click()}
            >
              {videoFile ? (
                <div className="media-file-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#669bbc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span className="media-file-name">{videoFile.name}</span>
                  <button
                    className="media-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoFile(null);
                      if (videoInputRef.current) videoInputRef.current.value = "";
                    }}
                  >
                    x
                  </button>
                </div>
              ) : (
                <div className="media-placeholder">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span>Upload video clip</span>
                </div>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*,.mp4,.webm,.mov,.avi"
                onChange={handleVideoUpload}
                hidden
              />
            </div>
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
          <>
            {/* Tree (full-bleed) */}
            <section className="panel tree-panel">
              <TreeStack
                trees={treeDataArray}
                activeIndex={activeSection}
                onActiveChange={setActiveSection}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
                onSelect={handleSelect}
                selectedId={selectedNodeId}
                onAddSection={handleAddSection}
                onRemoveSection={handleRemoveSection}
                onRenameSection={handleRenameSection}
              />
            </section>

            {/* Detail panel (contained width) */}
            {selectedNodeId && (
              <section className="panel">
                <DetailPanel
                  selectedId={selectedNodeId}
                  tree={activeVisualTree}
                  section={activeSectionData}
                  onClose={() => setSelectedNodeId(null)}
                  onUpdateSection={handleUpdateSection}
                />
              </section>
            )}

            {/* Flattened output (contained width) */}
            {showFlattened && flattenedPrompt && (
              <section className="panel">
                <div className="flattened-output">
                  <h3 className="flattened-title">ACE-Step Prompt</h3>
                  <pre className="flattened-pre">{flattenedPrompt}</pre>
                </div>
              </section>
            )}
          </>
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

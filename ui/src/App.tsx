import { useState, useMemo, useRef, useCallback } from "react";
import type { VibeTree, VisualNode, Section } from "./utils/types";
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
import { createHistoryEntry, type HistoryEntry } from "./utils/history";
import { diffTrees, type NodeDiff } from "./utils/treeDiff";
import TreeStack from "./components/TreeStack";
import type { TreeData } from "./components/TreeStack";
import DetailPanel from "./components/DetailPanel";
import HistorySidebar from "./components/HistorySidebar";
import "./App.css";

// API base URL: empty string means same-origin (production), or override via env var (dev)
const API_BASE = import.meta.env.VITE_API_URL ?? "";

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

  // ── Visual trees (one per section) ─────────────────
  const [visualTrees, setVisualTrees] = useState<VisualNode[]>([]);
  const [activeSection, setActiveSection] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // ── Audio / music generation state ─────────────────
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [musicDescriptions, setMusicDescriptions] = useState<Record<string, unknown> | null>(null);
  const [songDuration, setSongDuration] = useState<number>(30);

  // ── History state ──────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [treeDiffs, setTreeDiffs] = useState<Map<string, NodeDiff[]>>(new Map());
  // ── Derived ────────────────────────────────────────
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

  // Whether we have at least one input to generate from
  const hasInput = prompt.trim().length > 0 || imageFiles.length > 0 || audioFile !== null || videoFile !== null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Prepare form data with files and text
      const formData = new FormData();
      if (prompt.trim()) {
        formData.append("text", prompt);
      }
      imageFiles.forEach((file) => formData.append("files", file));
      if (audioFile) formData.append("files", audioFile);
      if (videoFile) formData.append("files", videoFile);

      // Step 1: Submit generation request
      const generateRes = await fetch(`${API_BASE}/api/generate`, {
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
          `${API_BASE}/api/status/${job_id}`
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
           const vTrees = vibeTree.root.sections.map((s) =>
             sectionToVisualTree(s)
           );
           setVisualTrees(vTrees);
           setActiveSection(0);
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

  // ── Handler: restore from history ─────────────────────
  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    setTree(entry.tree);
    setVisualTrees(entry.visualTrees);
    setActiveSection(0);
    setSelectedNodeId(null);
    setCurrentHistoryId(entry.id);

    // Compute diffs relative to current (active) tree
    const newDiffs = new Map<string, NodeDiff[]>();
    if (tree) {
      entry.visualTrees.forEach((historyVTree, i) => {
        const currentVTree = visualTrees[i];
        const diff = diffTrees(historyVTree, currentVTree || null);
        newDiffs.set(historyVTree.id, [diff]);
      });
    }
    setTreeDiffs(newDiffs);
  }, [tree, visualTrees]);

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

  const handleMusicGenerate = async () => {
    if (!tree) return;
    setGeneratingMusic(true);
    setMusicDescriptions(null);
    setAudioUrl(null);
    try {
      const formData = new FormData();
      formData.append("vibe_tree", JSON.stringify(tree));
      formData.append("audio_duration", String(songDuration));
      if (audioFile) formData.append("reference_audio", audioFile);

      const res = await fetch(`${API_BASE}/api/generate-music`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const { job_id } = await res.json();

      // Poll for completion
      let completed = false;
      let attempts = 0;
      const maxAttempts = 600;

      while (!completed && attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 2000));

        const statusRes = await fetch(
          `${API_BASE}/api/status/${job_id}`
        );
        if (!statusRes.ok) throw new Error(`Status check failed: ${statusRes.status}`);
        const job = await statusRes.json();

        if (job.status === "completed") {
          if (!job.result) throw new Error("No result returned");
          setAudioUrl(`${API_BASE}${job.result.audio_url}`);
          setMusicDescriptions(job.result.descriptions);

          // Add to history after music generation completes
          const flattenedPrompt = tree ? flattenTree(tree) : null;
          const audioUrl = `${API_BASE}${job.result.audio_url}`;
          const entry = createHistoryEntry(
            prompt,
            tree!,
            visualTrees,
            flattenedPrompt,
            audioUrl,
            job.result.descriptions
          );
          setHistory((prev) => [entry, ...prev]);
          setCurrentHistoryId(entry.id);

          // Compute diffs
          const newDiffs = new Map<string, NodeDiff[]>();
          visualTrees.forEach((vTree, i) => {
            const prevTree = history.length > 0 ? history[0].visualTrees[i] : null;
            const diff = diffTrees(vTree, prevTree || null);
            newDiffs.set(vTree.id, [diff]);
          });
          setTreeDiffs(newDiffs);

          completed = true;
        } else if (job.status === "failed") {
          throw new Error(job.error || "Music generation failed");
        }
      }

      if (!completed) throw new Error("Music generation timed out");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Music generation error: ${message}`);
      console.error("Music generation error:", error);
    } finally {
      setGeneratingMusic(false);
    }
  };

  // ── Handlers: section management ──────────────────
  const handleAddSection = useCallback(() => {
    if (!tree) return;
    const updated = structuredClone(tree);
    const newSection = createEmptySection(`section ${updated.root.sections.length + 1}`);
    updated.root.sections.push(newSection);
    setTree(updated);

    const newVt = emptyVisualTree(
      newSection.branches.mood && typeof newSection.branches.mood === "object" && "primary" in newSection.branches.mood
        ? (newSection.branches.mood.primary as string)
        : `section ${updated.root.sections.length}`
    );
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
      {/* ── History Sidebar ─────────────────────────── */}
      <HistorySidebar
        history={history}
        currentEntryId={currentHistoryId}
        onSelect={handleHistorySelect}
      />

      {/* ── Header ──────────────────────────────────── */}
      <header className="header">
        <div className="header-content">
          <img src="/ruben.jpg" alt="Ruben" className="logo-avatar" />
          <h1 className="logo-text">Ruben</h1>
          <span className="logo-sub">multimodal music generation</span>
        </div>
      </header>

      <main className="main">
        {/* ── Input Panel ──────────────────────────────── */}
        <section className="panel input-panel">
          <h2 className="panel-title">Input</h2>

          <div className="input-grid">
            {/* Top-left: Text */}
            <div className="input-group input-grid-cell">
              <label className="input-label">
                Describe your vibe <span className="optional">(optional if files provided)</span>
              </label>
              <textarea
                className="prompt-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. a rainy evening in Tokyo, neon reflections on wet pavement..."
              />
            </div>

            {/* Top-right: Audio */}
            <div className="input-group input-grid-cell">
              <label className="input-label">
                Audio reference{" "}
                <span className="optional">(optional)</span>
              </label>
              <div
                className={`media-upload media-upload--fill ${audioFile ? "has-media" : ""}`}
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

            {/* Bottom-left: Images (horizontally scrollable) */}
            <div className="input-group input-grid-cell">
              <label className="input-label">
                Reference images{" "}
                <span className="optional">(optional, multiple)</span>
              </label>
              <div
                className={`image-upload image-upload--grid ${imagePreviews.length > 0 ? "has-image" : ""}`}
                onClick={(e) => {
                  // Only open file picker if clicking on the placeholder or the add button
                  const target = e.target as HTMLElement;
                  if (!target.closest(".image-remove")) {
                    imageInputRef.current?.click();
                  }
                }}
              >
                {imagePreviews.length > 0 ? (
                  <div className="multi-preview-scroll">
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
            </div>

            {/* Bottom-right: Video */}
            <div className="input-group input-grid-cell">
              <label className="input-label">
                Video reference{" "}
                <span className="optional">(optional)</span>
              </label>
              <div
                className={`media-upload media-upload--fill ${videoFile ? "has-media" : ""}`}
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
          </div>

          <button
            className="btn btn--primary btn--compact"
            onClick={handleGenerate}
            disabled={generating || !hasInput}
          >
            {generating ? (
              <>
                <span className="dots-loader"><span /><span /><span /></span>
                Composing
              </>
            ) : (
              "Compose ✨"
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
                diffMap={treeDiffs}
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

            {/* Generate Music button */}
            <section className="panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div>
                <label className="input-label" style={{ display: "block", marginBottom: 8, textAlign: "center" }}>
                  Song Duration
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                  <input
                    type="range"
                    min="10"
                    max="240"
                    value={songDuration}
                    onChange={(e) => setSongDuration(parseInt(e.target.value, 10))}
                    style={{ flex: 1, maxWidth: 200 }}
                  />
                  <span style={{ width: 50, textAlign: "center" }}>{songDuration}s</span>
                </div>
              </div>
              <button
                className="btn btn--primary btn--compact"
                onClick={handleMusicGenerate}
                disabled={generatingMusic}
              >
                {generatingMusic ? (
                  <>
                    <span className="dots-loader"><span /><span /><span /></span>
                    Conducting
                  </>
                ) : (
                  "Conduct 🎵"
                )}
              </button>
            </section>
          </>
        )}

        {/* ── Audio Player + Descriptions ─────────────────── */}
        {(audioUrl || generatingMusic) && (
          <section className="panel audio-panel">
            <h2 className="panel-title">Output</h2>
            {audioUrl && (
              <audio controls src={audioUrl} className="audio-player" />
            )}
            {generatingMusic && !audioUrl && (
              <p style={{ opacity: 0.6 }}>Conducting...</p>
            )}
            {musicDescriptions && (
              <div className="music-descriptions" style={{ marginTop: 16 }}>
                <h3 className="flattened-title">Musician's Analysis</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 14 }}>
                  {musicDescriptions.bpm != null && (
                    <>
                      <span style={{ opacity: 0.6 }}>BPM</span>
                      <span>{String(musicDescriptions.bpm)}</span>
                    </>
                  )}
                  {!!musicDescriptions.keyscale && (
                    <>
                      <span style={{ opacity: 0.6 }}>Key</span>
                      <span>{String(musicDescriptions.keyscale)}</span>
                    </>
                  )}
                  {!!musicDescriptions.timesignature && (
                    <>
                      <span style={{ opacity: 0.6 }}>Time Signature</span>
                      <span>{String(musicDescriptions.timesignature)}</span>
                    </>
                  )}
                  {musicDescriptions.duration != null && (
                    <>
                      <span style={{ opacity: 0.6 }}>Duration</span>
                      <span>{String(musicDescriptions.duration)}s</span>
                    </>
                  )}
                  {!!musicDescriptions.genres && (
                    <>
                      <span style={{ opacity: 0.6 }}>Genres</span>
                      <span>{String(musicDescriptions.genres)}</span>
                    </>
                  )}
                </div>
                {!!musicDescriptions.prompt && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ opacity: 0.6, fontSize: 13 }}>Musician's Impression</span>
                    <pre className="flattened-pre" style={{ marginTop: 4 }}>{String(musicDescriptions.prompt)}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

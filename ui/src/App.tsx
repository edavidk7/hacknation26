import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
import { flattenTree } from "./utils/flatten";
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
  const [musicJobId, setMusicJobId] = useState<string | null>(null);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [musicDescriptions, setMusicDescriptions] = useState<Record<string, unknown> | null>(null);
  const [songDuration, setSongDuration] = useState<number>(30);
  const [bpm, setBpm] = useState<number>(54);
  const [key, setKey] = useState<string>("F major");
  const [timeSignature, setTimeSignature] = useState<string>("4/4");

  // ── History state ──────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [treeDiffs, setTreeDiffs] = useState<Map<string, NodeDiff[]>>(new Map());

  // ── Custom audio player state ─────────────────────
  const playerRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = playerRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = playerRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = playerRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleDownload = async () => {
    if (!musicJobId) return;
    try {
      const downloadUrl = `${API_BASE}/api/audio/${musicJobId}?download=true`;
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `song-${musicJobId}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      alert(`Failed to download song: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

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
    setMusicJobId(null);
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
          setMusicJobId(job_id);
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
      {/* ── Ambient background ─────────────────────── */}
      <div className="ambient-bg" aria-hidden="true">
        <div className="aurora aurora--1" />
        <div className="aurora aurora--2" />
        <div className="aurora aurora--3" />
        <div className="aurora aurora--4" />
        <div className="aurora aurora--5" />
        <div className="aurora aurora--6" />
        <div className="aurora aurora--7" />
        <div className="aurora aurora--8" />
        <div className="star star--1" />
        <div className="star star--2" />
        <div className="star star--3" />
        <div className="star star--4" />
        <div className="star star--5" />
        <div className="star star--6" />
        <div className="star star--7" />
        <div className="star star--8" />
        <div className="star star--9" />
        <div className="star star--10" />
        <div className="star star--11" />
        <div className="star star--12" />
        <div className="star star--13" />
        <div className="star star--14" />
        <div className="star star--15" />
      </div>

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
          <span className="logo-sub">multimodal music composer</span>
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
            {/* Sonic Blueprint Title */}
            <div className="sonic-blueprint-header">
              <h2 className="sonic-blueprint-title">Sonic Blueprint</h2>
              <hr className="sonic-blueprint-divider" />
            </div>

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
            <section className="panel conduct-panel">
              <div className="music-controls-grid">
                {/* Duration Control */}
                <div className="music-control-item">
                  <label className="music-control-label">Song Duration</label>
                  <div className="duration-slider-row">
                    <span className="duration-bound">10s</span>
                    <input
                      type="range"
                      className="duration-slider"
                      min="10"
                      max="240"
                      step="1"
                      value={songDuration}
                      onChange={(e) => setSongDuration(parseFloat(e.target.value))}
                    />
                    <span className="duration-bound">240s</span>
                    <span className="duration-value">{songDuration}s</span>
                  </div>
                </div>

                {/* BPM Control */}
                <div className="music-control-item">
                  <label className="music-control-label">BPM</label>
                  <input
                    type="number"
                    className="music-control-input"
                    min="40"
                    max="200"
                    value={bpm}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setBpm(40);
                      } else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) {
                          setBpm(Math.max(40, Math.min(200, num)));
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (val === '' || isNaN(parseInt(val, 10))) {
                        setBpm(54);
                      }
                    }}
                  />
                </div>

                {/* Key Control */}
                <div className="music-control-item">
                  <label className="music-control-label">Key</label>
                  <select
                    className="music-control-select"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  >
                    <option value="C major">C major</option>
                    <option value="C minor">C minor</option>
                    <option value="C# major">C# major</option>
                    <option value="C# minor">C# minor</option>
                    <option value="D major">D major</option>
                    <option value="D minor">D minor</option>
                    <option value="D# major">D# major</option>
                    <option value="D# minor">D# minor</option>
                    <option value="E major">E major</option>
                    <option value="E minor">E minor</option>
                    <option value="F major">F major</option>
                    <option value="F minor">F minor</option>
                    <option value="F# major">F# major</option>
                    <option value="F# minor">F# minor</option>
                    <option value="G major">G major</option>
                    <option value="G minor">G minor</option>
                    <option value="G# major">G# major</option>
                    <option value="G# minor">G# minor</option>
                    <option value="A major">A major</option>
                    <option value="A minor">A minor</option>
                    <option value="A# major">A# major</option>
                    <option value="A# minor">A# minor</option>
                    <option value="B major">B major</option>
                    <option value="B minor">B minor</option>
                  </select>
                </div>

                {/* Time Signature Control */}
                <div className="music-control-item">
                  <label className="music-control-label">Time Signature</label>
                  <select
                    className="music-control-select"
                    value={timeSignature}
                    onChange={(e) => setTimeSignature(e.target.value)}
                  >
                    <option value="2/4">2/4</option>
                    <option value="3/4">3/4</option>
                    <option value="4/4">4/4</option>
                    <option value="5/4">5/4</option>
                    <option value="6/8">6/8</option>
                    <option value="7/8">7/8</option>
                    <option value="9/8">9/8</option>
                    <option value="12/8">12/8</option>
                  </select>
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
        {audioUrl && (
          <section className="panel audio-panel">
            <h2 className="panel-title">Output</h2>
            <audio ref={playerRef} src={audioUrl} preload="metadata" />
            <div className="custom-player">
                  <button className="player-play-btn" onClick={togglePlay}>
                    {isPlaying ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="6,4 20,12 6,20" />
                      </svg>
                    )}
                  </button>
                  <span className="player-time">{formatTime(currentTime)}</span>
                  <div className="player-track" onClick={seekTo}>
                    <div
                      className="player-track-fill"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                    />
                    <div
                      className="player-track-thumb"
                      style={{ left: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="player-time">{formatTime(duration)}</span>
                  <button className="player-download-btn" onClick={handleDownload} title="Download">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            {musicDescriptions && (
              <div className="music-descriptions">
                <h3 className="flattened-title">Musician's Analysis</h3>
                <div className="analysis-grid">
                  {musicDescriptions.bpm != null && (
                    <div className="analysis-item">
                      <span className="analysis-label">BPM</span>
                      <span className="analysis-value">{String(musicDescriptions.bpm)}</span>
                    </div>
                  )}
                  {!!musicDescriptions.keyscale && (
                    <div className="analysis-item">
                      <span className="analysis-label">Key</span>
                      <span className="analysis-value">{String(musicDescriptions.keyscale)}</span>
                    </div>
                  )}
                  {!!musicDescriptions.timesignature && (
                    <div className="analysis-item">
                      <span className="analysis-label">Time Signature</span>
                      <span className="analysis-value">{String(musicDescriptions.timesignature)}</span>
                    </div>
                  )}
                  {musicDescriptions.duration != null && (
                    <div className="analysis-item">
                      <span className="analysis-label">Duration</span>
                      <span className="analysis-value">{String(musicDescriptions.duration)}s</span>
                    </div>
                  )}
                  {!!musicDescriptions.genres && (
                    <div className="analysis-item">
                      <span className="analysis-label">Genres</span>
                      <span className="analysis-value">{String(musicDescriptions.genres)}</span>
                    </div>
                  )}
                </div>
                {!!musicDescriptions.prompt && (
                  <div className="impression-section">
                    <span className="impression-label">Musician's Impression</span>
                    <pre className="flattened-pre">{String(musicDescriptions.prompt)}</pre>
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

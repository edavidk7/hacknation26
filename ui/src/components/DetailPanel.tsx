import { useState, useEffect, useCallback } from "react";
import type { VisualNode, NodeKind, Section } from "../utils/types";

/**
 * Find a node by ID within a visual tree.
 */
function findNode(tree: VisualNode, id: string): VisualNode | null {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Find the parent node of a given node ID.
 */
function findParent(
  tree: VisualNode,
  id: string,
  parent: VisualNode | null = null
): VisualNode | null {
  if (tree.id === id) return parent;
  for (const child of tree.children) {
    const found = findParent(child, id, tree);
    if (found) return found;
  }
  return null;
}

// ── Kind descriptions ──────────────────────────────────

const KIND_DESCRIPTIONS: Record<NodeKind, string> = {
  section: "Top-level song section (intro, body, outro)",
  mood: "Primary mood / emotional core",
  genre: "Primary genre classification",
  instruments: "Instrument palette container",
  texture: "Sonic texture: density, movement, space",
  sonic: "Sonic detail descriptions",
  instrument: "Individual instrument entry",
  nuance: "Mood nuance / emotional shade",
  influence: "Genre influence / sub-genre",
  detail: "Specific sonic detail",
  custom: "Custom user-added node",
};

const KIND_COLORS: Record<NodeKind, string> = {
  section: "#6c63ff",
  mood: "#ffb66b",
  genre: "#4ecdc4",
  instruments: "#a282ff",
  texture: "#ff8a80",
  sonic: "#64b5f6",
  instrument: "#ce93d8",
  nuance: "#ffcc80",
  influence: "#80cbc4",
  detail: "#90caf9",
  custom: "#888",
};

// ── Helpers for instrument detail editing ──────────────

interface InstrumentDetail {
  role: string;
  character: string;
}

function getInstrumentDetail(
  section: Section | null,
  instrumentName: string
): InstrumentDetail {
  if (!section) return { role: "texture", character: "" };
  const inst = section.branches.instruments.find(
    (i) => i.name === instrumentName
  );
  return inst
    ? { role: inst.role, character: inst.character }
    : { role: "texture", character: "" };
}

// ── Component ──────────────────────────────────────────

interface Props {
  selectedId: string | null;
  tree: VisualNode | null;
  section: Section | null;
  onClose: () => void;
  onUpdateSection: (updater: (s: Section) => Section) => void;
}

export default function DetailPanel({
  selectedId,
  tree,
  section,
  onClose,
  onUpdateSection,
}: Props) {
  const [localRole, setLocalRole] = useState("");
  const [localChar, setLocalChar] = useState("");

  const node = selectedId && tree ? findNode(tree, selectedId) : null;
  const parent = selectedId && tree ? findParent(tree, selectedId) : null;

  // Sync local instrument fields when selection changes
  useEffect(() => {
    if (node && node.kind === "instrument" && section) {
      const detail = getInstrumentDetail(section, node.label);
      setLocalRole(detail.role);
      setLocalChar(detail.character);
    }
  }, [node, section]);

  const commitInstrumentDetail = useCallback(
    (field: "role" | "character", value: string) => {
      if (!node || !section) return;
      onUpdateSection((s) => {
        const updated = structuredClone(s);
        const inst = updated.branches.instruments.find(
          (i) => i.name === node.label
        );
        if (inst) {
          if (field === "role") inst.role = value;
          else inst.character = value;
        }
        return updated;
      });
    },
    [node, section, onUpdateSection]
  );

  if (!node) return null;

  const accent = KIND_COLORS[node.kind] ?? "#888";

  return (
    <div className="detail-panel">
      <div className="detail-panel-header">
        <div className="detail-panel-title">
          <span
            className="detail-panel-dot"
            style={{ background: accent }}
          />
          <span className="detail-panel-kind">{node.kind}</span>
          <span className="detail-panel-label">{node.label}</span>
        </div>
        <button className="detail-panel-close" onClick={onClose}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p className="detail-panel-desc">{KIND_DESCRIPTIONS[node.kind]}</p>

      {/* Parent context */}
      {parent && (
        <div className="detail-field">
          <span className="detail-field-label">Parent</span>
          <span className="detail-field-value">
            {parent.label}{" "}
            <span className="detail-field-kind">({parent.kind})</span>
          </span>
        </div>
      )}

      {/* Children count */}
      {node.children.length > 0 && (
        <div className="detail-field">
          <span className="detail-field-label">Children</span>
          <span className="detail-field-value">{node.children.length}</span>
        </div>
      )}

      {/* Instrument-specific: role & character */}
      {node.kind === "instrument" && section && (
        <div className="detail-instrument">
          <div className="detail-field">
            <span className="detail-field-label">Role</span>
            <select
              className="detail-select"
              value={localRole}
              onChange={(e) => {
                setLocalRole(e.target.value);
                commitInstrumentDetail("role", e.target.value);
              }}
            >
              <option value="lead">lead</option>
              <option value="bass">bass</option>
              <option value="rhythm">rhythm</option>
              <option value="texture">texture</option>
              <option value="percussion">percussion</option>
            </select>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Character</span>
            <input
              className="detail-input"
              type="text"
              value={localChar}
              onChange={(e) => setLocalChar(e.target.value)}
              onBlur={() => commitInstrumentDetail("character", localChar)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitInstrumentDetail("character", localChar);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="e.g. warm, sustained, breathy..."
            />
          </div>
        </div>
      )}

      {/* Texture node: show density / movement / space */}
      {node.kind === "texture" && section && (
        <div className="detail-texture">
          <div className="detail-field">
            <span className="detail-field-label">Density</span>
            <select
              className="detail-select"
              value={section.branches.texture.density}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.texture.density = e.target.value as
                    | "sparse"
                    | "moderate"
                    | "dense";
                  return u;
                })
              }
            >
              <option value="sparse">sparse</option>
              <option value="moderate">moderate</option>
              <option value="dense">dense</option>
            </select>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Movement</span>
            <select
              className="detail-select"
              value={section.branches.texture.movement}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.texture.movement = e.target.value as
                    | "static"
                    | "slow-evolving"
                    | "dynamic";
                  return u;
                })
              }
            >
              <option value="static">static</option>
              <option value="slow-evolving">slow-evolving</option>
              <option value="dynamic">dynamic</option>
            </select>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Space</span>
            <select
              className="detail-select"
              value={section.branches.texture.space}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.texture.space = e.target.value as
                    | "intimate"
                    | "open"
                    | "vast";
                  return u;
                })
              }
            >
              <option value="intimate">intimate</option>
              <option value="open">open</option>
              <option value="vast">vast</option>
            </select>
          </div>
        </div>
      )}

      {/* Section node: show metadata */}
      {node.kind === "section" && section && (
        <div className="detail-metadata">
          <h4 className="detail-section-title">Metadata</h4>
          <div className="detail-field">
            <span className="detail-field-label">Tempo feel</span>
            <input
              className="detail-input"
              type="text"
              value={section.branches.metadata.tempo_feel}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.metadata.tempo_feel = e.target.value;
                  return u;
                })
              }
            />
          </div>
          <div className="detail-field">
            <span className="detail-field-label">BPM</span>
            <input
              className="detail-input detail-input--number"
              type="number"
              value={section.branches.metadata.suggested_bpm ?? ""}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.metadata.suggested_bpm = e.target.value
                    ? Number(e.target.value)
                    : null;
                  return u;
                })
              }
              placeholder="—"
            />
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Key</span>
            <input
              className="detail-input"
              type="text"
              value={section.branches.metadata.key ?? ""}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.metadata.key = e.target.value || null;
                  return u;
                })
              }
              placeholder="e.g. D minor"
            />
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Time sig</span>
            <input
              className="detail-input"
              type="text"
              value={section.branches.metadata.time_signature ?? ""}
              onChange={(e) =>
                onUpdateSection((s) => {
                  const u = structuredClone(s);
                  u.branches.metadata.time_signature =
                    e.target.value || null;
                  return u;
                })
              }
              placeholder="e.g. 4/4"
            />
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Weight</span>
            <div className="detail-weight-row">
              <input
                type="range"
                className="detail-slider"
                min="0"
                max="1"
                step="0.05"
                value={section.weight}
                onChange={(e) =>
                  onUpdateSection((s) => ({
                    ...s,
                    weight: Number(e.target.value),
                  }))
                }
              />
              <span className="detail-weight-val">
                {section.weight.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

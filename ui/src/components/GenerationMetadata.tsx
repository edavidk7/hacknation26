import { useState } from "react";

interface GenerationMetadataProps {
  descriptions: Record<string, unknown> | null;
  aceGenerationInfo: string | null;
  acePrompt: string | null;
}

export default function GenerationMetadata({
  descriptions,
  aceGenerationInfo,
  acePrompt,
}: GenerationMetadataProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  if (!descriptions) {
    return null;
  }

  return (
    <div className="generation-metadata">
      <h3>ACE-Step Generation Details</h3>

      <div className="metadata-grid">
        {descriptions.bpm != null && (
          <>
            <span className="metadata-label">BPM</span>
            <span className="metadata-value">{String(descriptions.bpm)}</span>
          </>
        )}
        {descriptions.keyscale && (
          <>
            <span className="metadata-label">Key</span>
            <span className="metadata-value">{String(descriptions.keyscale)}</span>
          </>
        )}
        {descriptions.timesignature && (
          <>
            <span className="metadata-label">Time Signature</span>
            <span className="metadata-value">{String(descriptions.timesignature)}</span>
          </>
        )}
        {descriptions.duration != null && (
          <>
            <span className="metadata-label">Duration</span>
            <span className="metadata-value">{String(descriptions.duration)}s</span>
          </>
        )}
        {descriptions.genres && (
          <>
            <span className="metadata-label">Genres</span>
            <span className="metadata-value">{String(descriptions.genres)}</span>
          </>
        )}
      </div>

      <div className="metadata-sections">
        {descriptions.prompt && (
          <div className="metadata-section">
            <button
              className="metadata-toggle"
              onClick={() => setShowPrompt((v) => !v)}
            >
              {showPrompt ? "▼" : "▶"} LM Caption
            </button>
            {showPrompt && (
              <pre className="metadata-content">
                {String(descriptions.prompt)}
              </pre>
            )}
          </div>
        )}

        {descriptions.lyrics && (
          <div className="metadata-section">
            <button
              className="metadata-toggle"
              onClick={() => setShowLyrics((v) => !v)}
            >
              {showLyrics ? "▼" : "▶"} Lyrics/Structure
            </button>
            {showLyrics && (
              <pre className="metadata-content">
                {String(descriptions.lyrics)}
              </pre>
            )}
          </div>
        )}

        {aceGenerationInfo && (
          <div className="metadata-section">
            <div className="metadata-label">Generation Info</div>
            <pre className="metadata-content">{aceGenerationInfo}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

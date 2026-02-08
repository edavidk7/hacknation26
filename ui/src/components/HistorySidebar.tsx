import { useState, useRef, useEffect } from "react";
import { formatTimestamp, formatDate, type HistoryEntry } from "../utils/history";
import "./HistorySidebar.css";

interface Props {
  history: HistoryEntry[];
  currentEntryId: string | null;
  onSelect: (entry: HistoryEntry) => void;
}

export default function HistorySidebar({
  history,
  currentEntryId,
  onSelect,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Handle audio playback
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (playingId) {
      const entry = [...history].reverse().find((e) => e.id === playingId);
      if (entry?.audioUrl) {
        audioRef.current.src = entry.audioUrl;
        audioRef.current.onloadedmetadata = () => {
          audioRef.current?.play().catch((err) => {
            console.error("Playback error:", err);
            setPlayingId(null);
          });
        };
        audioRef.current.onerror = () => {
          console.error("Audio load error:", audioRef.current?.error);
          setPlayingId(null);
        };
      }
    } else {
      audioRef.current.pause();
    }
  }, [playingId, history]);

  if (history.length === 0) {
    return (
      <aside className="history-sidebar history-sidebar--empty">
        <h3 className="history-title">Generation History</h3>
        <p className="history-empty">No generations yet</p>
      </aside>
    );
  }

  // Reverse to show oldest on top, newest on bottom
  const reversed = [...history].reverse();

  // Group by date
  const grouped = new Map<string, (HistoryEntry & { iterationNum: number })[]>();
  let iterationNum = 1;
  for (const entry of reversed) {
    const date = formatDate(entry.timestamp);
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push({ ...entry, iterationNum });
    iterationNum++;
  }

  return (
    <aside className="history-sidebar">
      <h3 className="history-title">Generation History</h3>
      <div className="history-list">
        {Array.from(grouped.entries()).map(([date, entries]) => (
          <div key={date} className="history-group">
            <div className="history-date-label">{date}</div>
            <ul className="history-items">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    className={`history-item ${
                      entry.id === currentEntryId ? "history-item--active" : ""
                    }`}
                    onClick={() => onSelect(entry)}
                  >
                      <div className="history-top">
                      <span className="history-tag">{entry.iterationNum}</span>
                      <span className="history-time">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    {entry.audioUrl && (
                      <button
                        className="history-play-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayingId(
                            playingId === entry.id ? null : entry.id
                          );
                        }}
                        title="Play audio"
                      >
                        {playingId === entry.id ? "⏸ Playing" : "▶ Play"}
                      </button>
                    )}

                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        style={{ display: "none" }}
      />
    </aside>
  );
}

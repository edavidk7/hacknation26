import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  images: string[];
  audioFile: File | null;
  videoFile: File | null;
}

export default function Showcase({ images, audioFile, videoFile }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = stripRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, images]);

  const scroll = (dir: "left" | "right") => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  const hasContent = images.length > 0 || audioFile || videoFile;
  if (!hasContent) return null;

  return (
    <div className="showcase">
      <div className="showcase-label">Media</div>
      <div className="showcase-track">
        {canScrollLeft && (
          <button className="showcase-arrow showcase-arrow--left" onClick={() => scroll("left")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className="showcase-strip" ref={stripRef}>
          {images.map((src, i) => (
            <div key={i} className="showcase-item">
              <img src={src} alt={`Reference ${i + 1}`} className="showcase-img" />
              <div className="showcase-glow" />
            </div>
          ))}
          {audioFile && (
            <div className="showcase-item showcase-item--file">
              <div className="showcase-file-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c1121f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <span className="showcase-file-name">{audioFile.name}</span>
              <div className="showcase-glow showcase-glow--audio" />
            </div>
          )}
          {videoFile && (
            <div className="showcase-item showcase-item--file">
              <div className="showcase-file-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#669bbc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <span className="showcase-file-name">{videoFile.name}</span>
              <div className="showcase-glow showcase-glow--video" />
            </div>
          )}
        </div>
        {canScrollRight && (
          <button className="showcase-arrow showcase-arrow--right" onClick={() => scroll("right")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

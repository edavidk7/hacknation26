import type { ChangeEvent } from "react";

interface InputPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  imageFiles: File[];
  imagePreviews: string[];
  onImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onImageRemove: (index: number) => void;
  audioFile: File | null;
  onAudioUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  videoFile: File | null;
  onVideoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
  generating: boolean;
  imageInputRef: React.RefObject<HTMLInputElement>;
  audioInputRef: React.RefObject<HTMLInputElement>;
  videoInputRef: React.RefObject<HTMLInputElement>;
}

export default function InputPanel({
  prompt,
  onPromptChange,
  imageFiles,
  imagePreviews,
  onImageUpload,
  onImageRemove,
  audioFile,
  onAudioUpload,
  videoFile,
  onVideoUpload,
  onGenerate,
  generating,
  imageInputRef,
  audioInputRef,
  videoInputRef,
}: InputPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Generate Vibe Tree</h2>
      </div>

      {/* Prompt */}
      <div className="input-group">
        <label className="input-label">Describe the vibe</label>
        <textarea
          className="prompt-input"
          rows={3}
          placeholder="e.g., 'make it feel lonely but hopeful'"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
        />
      </div>

      {/* Image Upload */}
      <div className="input-group">
        <label className="input-label">
          Images <span className="optional">(optional)</span>
        </label>
        <div
          className={`image-upload ${imagePreviews.length > 0 ? "has-image" : ""}`}
          onClick={() => imageInputRef.current?.click()}
        >
          {imagePreviews.length === 0 ? (
            <div className="image-placeholder">
              <span>+ Upload image</span>
            </div>
          ) : (
            <div className="multi-preview-grid">
              {imagePreviews.map((preview, i) => (
                <div key={i} className="multi-preview-item">
                  <img src={preview} alt={`preview ${i}`} className="image-preview" />
                  <button
                    className="image-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageRemove(i);
                    }}
                  >
                    ×
                  </button>
                  {imageFiles[i] && (
                    <span className="image-name">{imageFiles[i].name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={onImageUpload}
          style={{ display: "none" }}
        />
      </div>

      {/* Audio Upload */}
      <div className="input-group">
        <label className="input-label">
          Audio <span className="optional">(optional)</span>
        </label>
        <div className="file-input-wrapper">
          <button
            className="file-input-btn"
            onClick={() => audioInputRef.current?.click()}
          >
            {audioFile ? `✓ ${audioFile.name}` : "+ Upload audio"}
          </button>
        </div>
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          onChange={onAudioUpload}
          style={{ display: "none" }}
        />
      </div>

      {/* Video Upload */}
      <div className="input-group">
        <label className="input-label">
          Video <span className="optional">(optional)</span>
        </label>
        <div className="file-input-wrapper">
          <button
            className="file-input-btn"
            onClick={() => videoInputRef.current?.click()}
          >
            {videoFile ? `✓ ${videoFile.name}` : "+ Upload video"}
          </button>
        </div>
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={onVideoUpload}
          style={{ display: "none" }}
        />
      </div>

      {/* Generate Button */}
      <div className="input-group">
        <button
          className="btn-primary"
          onClick={onGenerate}
          disabled={generating || !prompt.trim()}
        >
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>
    </section>
  );
}

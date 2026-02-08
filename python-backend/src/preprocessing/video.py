from __future__ import annotations

import io
from pathlib import Path

import cv2
from PIL import Image


def extract_keyframes(
    video_path: str | Path, max_frames: int = 6
) -> list[tuple[bytes, float]]:
    """Extract evenly-spaced keyframes from a video file.

    Returns a list of (JPEG-encoded image bytes, timestamp_seconds) tuples,
    suitable for passing to an LLM as BinaryContent with temporal annotations.
    """
    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    if total_frames <= 0:
        cap.release()
        raise ValueError(f"Could not read frames from {video_path}")

    step = max(1, total_frames // max_frames)
    indices = list(range(0, total_frames, step))[:max_frames]

    frames: list[tuple[bytes, float]] = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue
        timestamp = idx / fps
        # Convert BGR (OpenCV) to RGB (PIL)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        frames.append((buf.getvalue(), timestamp))

    cap.release()
    return frames

from __future__ import annotations

import logging
import os
from pathlib import Path

from pydantic_ai import Agent
from pydantic_ai.messages import (
    BinaryContent,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
    UserContent,
    UserPromptPart,
)
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from src.agent.prompts import SYSTEM_PROMPT
from src.models.music_prompt import MusicPrompt
from src.preprocessing.video import extract_keyframes

log = logging.getLogger(__name__)

# OpenRouter config — set OPENROUTER_API_KEY env var
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL_NAME = "moonshotai/kimi-k2.5"

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"}


def _make_model(model_name: str | None = None) -> OpenAIModel:
    """Create an OpenAI-compatible model pointing at OpenRouter."""
    return OpenAIModel(
        model_name or DEFAULT_MODEL_NAME,
        provider=OpenAIProvider(
            base_url=OPENROUTER_BASE_URL,
            api_key=os.environ.get("OPENROUTER_API_KEY"),
        ),
    )


# Defer model resolution to run time so imports don't require API keys
agent = Agent(
    output_type=MusicPrompt,
    system_prompt=SYSTEM_PROMPT,
)


def _classify_file(path: Path) -> str:
    """Return 'image', 'audio', 'video', or 'unknown' based on extension."""
    ext = path.suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return "unknown"


def prepare_inputs(
    file_paths: list[str | Path] | None = None,
    text: str | None = None,
    max_video_frames: int = 6,
) -> list[UserContent]:
    """Convert raw file paths and text into a list of UserContent for the agent.

    - Images and audio are passed directly via BinaryContent
    - Videos are preprocessed into keyframes
    - Text is passed as a string
    """
    parts: list[UserContent] = []

    if text:
        parts.append(text)

    for fp in file_paths or []:
        path = Path(fp)
        kind = _classify_file(path)

        if kind in ("image", "audio"):
            parts.append(BinaryContent.from_path(path))

        elif kind == "video":
            frames = extract_keyframes(path, max_frames=max_video_frames)
            for frame_bytes in frames:
                parts.append(
                    BinaryContent(data=frame_bytes, media_type="image/jpeg")
                )

        else:
            # Unknown file type — try to read as text
            try:
                content = path.read_text()
                parts.append(f"[File: {path.name}]\n{content}")
            except (UnicodeDecodeError, OSError):
                # Try as binary
                parts.append(BinaryContent.from_path(path))

    if not parts:
        raise ValueError("No inputs provided. Pass at least one file or text.")

    return parts


def _log_messages(messages: list[ModelRequest | ModelResponse]) -> None:
    """Log the agent's conversation for visibility."""
    for msg in messages:
        if isinstance(msg, ModelRequest):
            for part in msg.parts:
                if isinstance(part, UserPromptPart):
                    content = part.content if isinstance(part.content, str) else f"[{len(part.content)} multimodal parts]"
                    log.info("[user] %s", content)
                elif isinstance(part, ToolReturnPart):
                    log.info("[tool result] %s -> %s", part.tool_name, str(part.content)[:200])
                elif isinstance(part, RetryPromptPart):
                    log.warning("[retry] %s", str(part.content)[:200])
        elif isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, TextPart):
                    log.info("[model] %s", part.content[:300])
                elif isinstance(part, ThinkingPart):
                    log.debug("[thinking] %s", part.content[:300])
                elif isinstance(part, ToolCallPart):
                    log.info("[tool call] %s(%s)", part.tool_name, str(part.args)[:200])


async def generate_music_prompt(
    file_paths: list[str | Path] | None = None,
    text: str | None = None,
    model_name: str | None = None,
    max_video_frames: int = 6,
    verbose: bool = False,
) -> MusicPrompt:
    """Main entry point: analyze multimodal inputs and produce a MusicPrompt.

    Args:
        file_paths: Paths to image, audio, or video files.
        text: Text description of the memory/moment.
        model_name: Override the OpenRouter model (default: moonshotai/kimi-k2.5).
        max_video_frames: Max keyframes to extract from videos.
        verbose: If True, log each step of the agent loop to stderr.

    Returns:
        A structured MusicPrompt ready for any music generation backend.
    """
    if verbose:
        logging.basicConfig(
            level=logging.DEBUG, format="%(levelname)s %(name)s: %(message)s"
        )
    parts = prepare_inputs(file_paths, text, max_video_frames)
    log.info("Prepared %d input parts", len(parts))

    model = _make_model(model_name)
    log.info("Using model: %s", model_name or DEFAULT_MODEL_NAME)

    result = await agent.run(parts, model=model)

    _log_messages(result.new_messages())
    log.info("Total usage: %s", result.usage())

    return result.output

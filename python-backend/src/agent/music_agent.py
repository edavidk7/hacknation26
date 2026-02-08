from __future__ import annotations

import base64
import json
import logging
import os
import time
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from src.agent.debug import (
    trace_final_output,
    trace_input_preparation,
    trace_model_config,
    trace_system_prompt,
    trace_usage,
)
from src.agent.mock_tree import get_mock_vibe_tree
from src.agent.prompts import ASSEMBLY_PROMPT, SYSTEM_PROMPT
from src.models.song_tree import SongCharacteristics
from src.preprocessing.video import extract_keyframes
from src.services.ace_step_client import AceStepClient

log = logging.getLogger(__name__)

# OpenRouter config — set OPENROUTER_API_KEY env var
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL_NAME = "moonshotai/kimi-k2.5"

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"}


def _make_client() -> OpenAI:
    """Create an OpenAI-compatible client pointing at OpenRouter."""
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=os.environ.get("OPENROUTER_API_KEY"),
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


def _encode_image(path: Path) -> str:
    """Encode an image file to base64."""
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8")


def prepare_content(
    file_paths: list[str | Path] | None = None,
    text: str | None = None,
    max_video_frames: int = 6,
    audio_analyses: dict[str, dict] | None = None,
) -> list[dict]:
    """Convert raw file paths and text into a list of content dicts for the API.

    - Images are passed as base64-encoded content blocks
    - Audio files use ACE-Step analysis results when available
    - Videos are preprocessed into keyframes
    - Text is passed as text content blocks

    Args:
        audio_analyses: Optional mapping of filename -> ACE-Step analysis result.
            If provided, audio files will include structured analysis instead of
            a useless placeholder.
    """
    content: list[dict] = []
    audio_analyses = audio_analyses or {}

    if text:
        content.append({"type": "text", "text": text})

    for fp in file_paths or []:
        path = Path(fp)
        kind = _classify_file(path)

        if kind == "image":
            b64_image = _encode_image(path)
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                }
            )

        elif kind == "audio":
            # Use ACE-Step analysis if available, otherwise a basic placeholder
            analysis = audio_analyses.get(path.name)
            if analysis:
                parts = [f"[Audio analysis of {path.name}]"]
                if analysis.get("caption"):
                    parts.append(f"Caption: {analysis['caption']}")
                if analysis.get("bpm"):
                    parts.append(f"BPM: {analysis['bpm']}")
                if analysis.get("key_scale"):
                    parts.append(f"Key: {analysis['key_scale']}")
                if analysis.get("time_signature"):
                    parts.append(f"Time signature: {analysis['time_signature']}")
                if analysis.get("duration"):
                    parts.append(f"Duration: {analysis['duration']}s")
                if analysis.get("language"):
                    parts.append(f"Language: {analysis['language']}")
                if analysis.get("lyrics"):
                    parts.append(f"Lyrics:\n{analysis['lyrics']}")
                content.append({"type": "text", "text": "\n".join(parts)})
            else:
                content.append(
                    {
                        "type": "text",
                        "text": f"[Audio file: {path.name}] (analysis unavailable)",
                    }
                )

        elif kind == "video":
            frames = extract_keyframes(path, max_frames=max_video_frames)
            for i, frame_bytes in enumerate(frames):
                b64_frame = base64.standard_b64encode(frame_bytes).decode("utf-8")
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_frame}"},
                    }
                )

        else:
            # Unknown file type — try to read as text
            try:
                file_content = path.read_text()
                content.append(
                    {"type": "text", "text": f"[File: {path.name}]\n{file_content}"}
                )
            except (UnicodeDecodeError, OSError):
                # Skip binary files we can't read
                log.warning("Could not read file: %s", path)

    if not content:
        raise ValueError("No inputs provided. Pass at least one file or text.")

    return content


def _handle_tool_calls(
    client: OpenAI, model: str, messages: list[dict], thinking_budget: int | None = None
) -> tuple[list[dict], bool]:
    """Handle tool calls in the conversation.

    Returns:
        Tuple of (updated messages, has_tool_calls)
    """
    has_tool_calls = False

    params = {
        "model": model,
        "messages": messages,
        "tools": [{"type": "builtin_function", "function": {"name": "$web_search"}}],
        "temperature": 0.6,
    }
    if thinking_budget is not None:
        params["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}

    response = client.chat.completions.create(**params)

    # Add assistant response to messages
    assistant_msg = {
        "role": "assistant",
        "content": response.choices[0].message.content or "",
    }

    # Check for tool calls
    if response.choices[0].message.tool_calls:
        has_tool_calls = True
        assistant_msg["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in response.choices[0].message.tool_calls
        ]

    messages.append(assistant_msg)

    # If there are tool calls, Kimi will handle them internally on the next request
    # Just return the updated messages
    return messages, has_tool_calls


async def generate_music_prompt(
    file_paths: list[str | Path] | None = None,
    text: str | None = None,
    model_name: str | None = None,
    max_video_frames: int = 6,
    verbose: bool = False,
    debug: bool = False,
    disable_web_search: bool = False,
    use_mock: bool = False,
    thinking_budget: int | None = None,
) -> SongCharacteristics:
    """Main entry point: analyze multimodal inputs and produce structured song characteristics.

    Args:
        file_paths: Paths to image, audio, or video files.
        text: Text description of the memory/moment.
        model_name: Override the OpenRouter model (default: moonshotai/kimi-k2.5).
        max_video_frames: Max keyframes to extract from videos.
        verbose: If True, log each step of the agent loop to stderr.
        debug: If True, log full debug trace of context and tool calls.
        disable_web_search: If True, disable web search tool in the agent.
        use_mock: If True, return mock vibe tree data without calling the model.
        thinking_budget: Optional thinking token budget for models like Kimi K2.5 (default: None).

    Returns:
        A tree-structured SongCharacteristics object ready for frontend editing and markdown conversion.
    """
    log_level = logging.DEBUG if (verbose or debug) else logging.INFO
    logging.basicConfig(level=log_level, format="%(levelname)s %(name)s: %(message)s")

    # Return mock data if requested
    if use_mock:
        log.info("Using mock vibe tree data")
        return get_mock_vibe_tree()

    # Track overall execution time
    overall_start = time.time()

    # Step 1: Analyze audio files via ACE-Step (before prepare_content)
    audio_analyses: dict[str, dict] = {}
    if file_paths:
        audio_files = [
            Path(fp) for fp in file_paths if _classify_file(Path(fp)) == "audio"
        ]
        if audio_files:
            log.info("Analyzing %d audio file(s) via ACE-Step...", len(audio_files))
            ace_client = AceStepClient()
            for audio_path in audio_files:
                try:
                    analysis = await ace_client.understand_audio(audio_path)
                    audio_analyses[audio_path.name] = analysis
                    log.info(
                        "Audio analysis for %s: caption='%s', bpm=%s, key=%s",
                        audio_path.name,
                        str(analysis.get("caption", ""))[:80],
                        analysis.get("bpm"),
                        analysis.get("key_scale"),
                    )
                except Exception as e:
                    log.warning(
                        "ACE-Step audio analysis failed for %s: %s", audio_path.name, e
                    )

    # Step 2: Prepare inputs
    step_start = time.time()
    content = prepare_content(file_paths, text, max_video_frames, audio_analyses)
    step_duration = time.time() - step_start
    log.info("Prepared %d content blocks in %.2fs", len(content), step_duration)

    if debug:
        trace_input_preparation(
            text, len(file_paths or []), len(content), max_video_frames
        )
        trace_system_prompt(SYSTEM_PROMPT)

    # Step 3: Initialize client
    step_start = time.time()
    client = _make_client()
    model_display = model_name or DEFAULT_MODEL_NAME
    step_duration = time.time() - step_start
    log.info("Client initialized (%s) in %.2fs", model_display, step_duration)

    if debug:
        trace_model_config(model_display, OPENROUTER_BASE_URL)

    # Step 4: Build and run conversation with web search support
    step_start = time.time()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]

    # Call model with web search tool
    if not disable_web_search:
        messages, has_tool_calls = _handle_tool_calls(
            client, model_display, messages, thinking_budget
        )
    else:
        # Call without web search
        params = {
            "model": model_display,
            "messages": messages,
            "temperature": 0.6,
        }
        if thinking_budget is not None:
            params["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
        response = client.chat.completions.create(**params)
        messages.append(
            {
                "role": "assistant",
                "content": response.choices[0].message.content or "",
            }
        )

    step_duration = time.time() - step_start
    log.info("Agent execution completed in %.2fs", step_duration)

    # Extract final response and parse into SongCharacteristics
    final_content = messages[-1]["content"]
    log.info("Final response: %s", final_content[:300])

    if debug:
        trace_final_output(final_content)

    # Parse JSON response into SongCharacteristics
    try:
        if isinstance(final_content, str):
            # Try to extract JSON from the response
            json_start = final_content.find("{")
            json_end = final_content.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = final_content[json_start:json_end]
                log.info("Extracted JSON: %s", json_str[:500])  # Log first 500 chars
                data = json.loads(json_str)
                log.info(
                    "Parsed JSON data: %s",
                    json.dumps(data, indent=2, default=str)[:1000],
                )
                result = SongCharacteristics(**data)
                log.info("Created SongCharacteristics: %s", result.model_dump())
            else:
                raise ValueError("No JSON found in response")
        else:
            raise ValueError("Expected string response from model")
    except (json.JSONDecodeError, ValidationError) as e:
        log.error("Failed to parse response: %s", e)
        log.error("Full response content: %s", final_content)
        raise ValueError(
            f"Model response could not be parsed as SongCharacteristics: {e}"
        )

    # Overall timing
    overall_duration = time.time() - overall_start
    log.info("Total generation time: %.2fs", overall_duration)

    return result


async def assemble_music_prompt(
    vibe_tree: dict,
    original_text: str | None = None,
    model_name: str | None = None,
) -> dict:
    """Assembly pass: convert a (potentially user-edited) vibe tree into a coherent
    ACE-Step caption + lyrics via Kimi K2.5.

    This replaces the mechanical tree-to-string flattening with an LLM call that:
    - Resolves cross-branch convergences
    - Resolves tensions between contradictory branches
    - Produces a descriptive caption paragraph in ACE-Step's expected format
    - Produces structured lyrics (or [Instrumental])

    Args:
        vibe_tree: The SongCharacteristics dict (with "root" key) — may be user-edited.
        original_text: Optional original user text for additional context.
        model_name: Override the OpenRouter model (default: Kimi K2.5).

    Returns:
        Dict with "prompt" (caption string) and "lyrics" (lyrics string).
        Falls back to empty defaults on failure rather than crashing.
    """
    start = time.time()
    model = model_name or DEFAULT_MODEL_NAME

    # Build user content: the tree JSON + optional context
    user_parts: list[str] = []
    if original_text:
        user_parts.append(f"Original user context: {original_text}")
    user_parts.append(f"Vibe tree:\n{json.dumps(vibe_tree, indent=2, default=str)}")
    user_content = "\n\n".join(user_parts)

    messages = [
        {"role": "system", "content": ASSEMBLY_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        client = _make_client()
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.5,
        )

        raw = response.choices[0].message.content or ""
        log.info("Assembly pass raw response: %s", raw[:500])

        # Parse JSON from response
        json_start = raw.find("{")
        json_end = raw.rfind("}") + 1
        if json_start < 0 or json_end <= json_start:
            raise ValueError("No JSON found in assembly response")

        parsed = json.loads(raw[json_start:json_end])
        caption = parsed.get("caption", "").strip()
        lyrics = parsed.get("lyrics", "[Instrumental]").strip()

        if not caption:
            raise ValueError("Assembly returned empty caption")

        duration = time.time() - start
        log.info(
            "Assembly pass completed in %.2fs: caption='%s...', lyrics_len=%d",
            duration,
            caption[:80],
            len(lyrics),
        )

        return {"prompt": caption, "lyrics": lyrics}

    except Exception as e:
        log.error("Assembly pass failed: %s", e, exc_info=True)
        return {"prompt": "", "lyrics": ""}

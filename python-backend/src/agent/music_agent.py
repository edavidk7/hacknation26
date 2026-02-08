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
from src.agent.prompts import SYSTEM_PROMPT
from src.models.song_tree import SongCharacteristics
from src.preprocessing.video import extract_keyframes

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
) -> list[dict]:
    """Convert raw file paths and text into a list of content dicts for the API.

    - Images and audio are passed as base64-encoded content blocks
    - Videos are preprocessed into keyframes
    - Text is passed as text content blocks
    """
    content: list[dict] = []

    if text:
        content.append({"type": "text", "text": text})

    for fp in file_paths or []:
        path = Path(fp)
        kind = _classify_file(path)

        if kind == "image":
            b64_image = _encode_image(path)
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}
            })

        elif kind == "audio":
            # Audio as base64
            b64_audio = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
            content.append({
                "type": "text",
                "text": f"[Audio file: {path.name}]\n[Content: base64-encoded audio data]"
            })

        elif kind == "video":
            frames = extract_keyframes(path, max_frames=max_video_frames)
            for i, frame_bytes in enumerate(frames):
                b64_frame = base64.standard_b64encode(frame_bytes).decode("utf-8")
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64_frame}"}
                })

        else:
            # Unknown file type — try to read as text
            try:
                file_content = path.read_text()
                content.append({
                    "type": "text",
                    "text": f"[File: {path.name}]\n{file_content}"
                })
            except (UnicodeDecodeError, OSError):
                # Skip binary files we can't read
                log.warning("Could not read file: %s", path)

    if not content:
        raise ValueError("No inputs provided. Pass at least one file or text.")

    return content


def _handle_tool_calls(client: OpenAI, model: str, messages: list[dict]) -> tuple[list[dict], bool]:
    """Handle tool calls in the conversation.
    
    Returns:
        Tuple of (updated messages, has_tool_calls)
    """
    has_tool_calls = False
    
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        tools=[{
            "type": "builtin_function",
            "function": {"name": "$web_search"}
        }],
        temperature=0.6,
    )
    
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
                }
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

    Returns:
        A tree-structured SongCharacteristics object ready for frontend editing and markdown conversion.
    """
    log_level = logging.DEBUG if (verbose or debug) else logging.INFO
    logging.basicConfig(
        level=log_level, format="%(levelname)s %(name)s: %(message)s"
    )
    
    # Track overall execution time
    overall_start = time.time()
    
    # Step 1: Prepare inputs
    step_start = time.time()
    content = prepare_content(file_paths, text, max_video_frames)
    step_duration = time.time() - step_start
    log.info("Prepared %d content blocks in %.2fs", len(content), step_duration)
    
    if debug:
        trace_input_preparation(text, len(file_paths or []), len(content), max_video_frames)
        trace_system_prompt(SYSTEM_PROMPT)

    # Step 2: Initialize client
    step_start = time.time()
    client = _make_client()
    model_display = model_name or DEFAULT_MODEL_NAME
    step_duration = time.time() - step_start
    log.info("Client initialized (%s) in %.2fs", model_display, step_duration)
    
    if debug:
        trace_model_config(model_display, OPENROUTER_BASE_URL)

    # Step 3: Build and run conversation with web search support
    step_start = time.time()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content}
    ]
    
    # Call model with web search tool
    if not disable_web_search:
        messages, has_tool_calls = _handle_tool_calls(client, model_display, messages)
    else:
        # Call without web search
        response = client.chat.completions.create(
            model=model_display,
            messages=messages,
            temperature=0.6,
        )
        messages.append({
            "role": "assistant",
            "content": response.choices[0].message.content or "",
        })
    
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
            json_start = final_content.find('{')
            json_end = final_content.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = final_content[json_start:json_end]
                data = json.loads(json_str)
                result = SongCharacteristics(**data)
            else:
                raise ValueError("No JSON found in response")
        else:
            raise ValueError("Expected string response from model")
    except (json.JSONDecodeError, ValidationError) as e:
        log.error("Failed to parse response: %s", e)
        raise ValueError(f"Model response could not be parsed as SongCharacteristics: {e}")
    
    # Overall timing
    overall_duration = time.time() - overall_start
    log.info("Total generation time: %.2fs", overall_duration)

    return result

"""Debug tracing utilities for agent execution."""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

log = logging.getLogger(__name__)


def _format_value(value: Any, max_length: int | None = 300) -> str:
    """Format a value for display, truncating if needed."""
    if isinstance(value, str):
        s = value
    elif isinstance(value, bytes):
        s = f"<bytes {len(value)} bytes>"
    elif isinstance(value, dict):
        s = json.dumps(value, indent=2, default=str)
    else:
        s = str(value)
    
    if max_length is not None and len(s) > max_length:
        return s[:max_length] + f"\n... (truncated {len(s) - max_length} chars)"
    return s


def trace_input_preparation(
    text: str | None,
    file_count: int,
    parts_count: int,
    max_video_frames: int,
) -> None:
    """Log input preparation details."""
    log.debug("=" * 80)
    log.debug("INPUT PREPARATION")
    log.debug("=" * 80)
    log.debug(f"Text provided: {bool(text)}")
    if text:
        log.debug(f"Text content: {_format_value(text, max_length=200)}")
    log.debug(f"File count: {file_count}")
    log.debug(f"Max video frames per video: {max_video_frames}")
    log.debug(f"Total prepared parts: {parts_count}")
    log.debug("=" * 80)


def trace_system_prompt(system_prompt: str) -> None:
    """Log the system prompt."""
    log.debug("=" * 80)
    log.debug("SYSTEM PROMPT")
    log.debug("=" * 80)
    log.debug(_format_value(system_prompt, max_length=None))
    log.debug("=" * 80)


def trace_model_config(model_name: str, base_url: str) -> None:
    """Log model configuration."""
    log.debug("=" * 80)
    log.debug("MODEL CONFIGURATION")
    log.debug("=" * 80)
    log.debug(f"Model: {model_name}")
    log.debug(f"Base URL: {base_url}")
    log.debug("=" * 80)


def trace_messages(messages: list[ModelRequest | ModelResponse]) -> None:
    """Log all messages in the conversation trace with full details."""
    log.debug("=" * 80)
    log.debug("AGENT CONVERSATION TRACE")
    log.debug("=" * 80)
    
    for i, msg in enumerate(messages):
        if isinstance(msg, ModelRequest):
            log.debug(f"\n[MESSAGE {i}] MODEL REQUEST")
            log.debug("-" * 40)
            
            for j, part in enumerate(msg.parts):
                if isinstance(part, UserPromptPart):
                    log.debug(f"  [Part {j}] USER PROMPT")
                    if isinstance(part.content, str):
                        log.debug(f"    Content: {_format_value(part.content)}")
                    else:
                        log.debug(f"    Multimodal content: {len(part.content)} parts")
                        for k, subpart in enumerate(part.content):
                            log.debug(f"      [{k}] {type(subpart).__name__}")
                
                elif isinstance(part, ToolReturnPart):
                    log.debug(f"  [Part {j}] TOOL RETURN")
                    log.debug(f"    Tool: {part.tool_name}")
                    log.debug(f"    Content: {_format_value(part.content)}")
                
                elif isinstance(part, RetryPromptPart):
                    log.debug(f"  [Part {j}] RETRY PROMPT")
                    log.debug(f"    Content: {_format_value(part.content)}")
        
        elif isinstance(msg, ModelResponse):
            log.debug(f"\n[MESSAGE {i}] MODEL RESPONSE")
            log.debug("-" * 40)
            
            for j, part in enumerate(msg.parts):
                if isinstance(part, TextPart):
                    log.debug(f"  [Part {j}] TEXT")
                    log.debug(f"    {_format_value(part.content)}")
                
                elif isinstance(part, ThinkingPart):
                    log.debug(f"  [Part {j}] THINKING")
                    log.debug(f"    {_format_value(part.content)}")
                
                elif isinstance(part, ToolCallPart):
                    log.debug(f"  [Part {j}] TOOL CALL")
                    log.debug(f"    Tool: {part.tool_name}")
                    log.debug(f"    Args: {_format_value(part.args)}")
    
    log.debug("\n" + "=" * 80)
    log.debug(f"TOTAL MESSAGES: {len(messages)}")
    log.debug("=" * 80)


def trace_tool_call(tool_name: str, args: dict[str, Any]) -> None:
    """Log a tool call with full arguments."""
    log.debug("=" * 80)
    log.debug(f"TOOL CALL: {tool_name}")
    log.debug("=" * 80)
    log.debug(f"Arguments:\n{_format_value(args, max_length=None)}")
    log.debug("=" * 80)


def trace_tool_result(tool_name: str, result: Any, error: str | None = None) -> None:
    """Log a tool result."""
    log.debug("=" * 80)
    log.debug(f"TOOL RESULT: {tool_name}")
    log.debug("=" * 80)
    if error:
        log.debug(f"Error: {error}")
    else:
        log.debug(f"Result:\n{_format_value(result, max_length=None)}")
    log.debug("=" * 80)


def trace_final_output(output: Any) -> None:
    """Log the final agent output."""
    log.debug("=" * 80)
    log.debug("FINAL OUTPUT")
    log.debug("=" * 80)
    log.debug(_format_value(output, max_length=None))
    log.debug("=" * 80)


def trace_usage(usage_str: str) -> None:
    """Log token usage information."""
    log.debug("=" * 80)
    log.debug("API USAGE")
    log.debug("=" * 80)
    log.debug(usage_str)
    log.debug("=" * 80)

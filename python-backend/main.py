"""CLI entry point: turn multimodal inputs into a structured music prompt."""

from __future__ import annotations

import argparse
import asyncio
import sys

from src.agent.music_agent import generate_music_prompt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a music prompt from multimodal inputs (images, audio, video, text)."
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Paths to input files (images, audio, video).",
    )
    parser.add_argument(
        "--text", "-t",
        type=str,
        default=None,
        help="Text description of the memory or moment.",
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default=None,
        help="OpenRouter model ID (default: moonshotai/kimi-k2.5).",
    )
    parser.add_argument(
        "--max-video-frames",
        type=int,
        default=6,
        help="Max keyframes to extract from video files (default: 6).",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Log agent steps to stderr.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Log full debug trace of context, tool calls, and agent messages.",
    )
    parser.add_argument(
        "--no-web-search",
        action="store_true",
        help="Disable web search in the agent.",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    if not args.files and not args.text:
        print("Error: provide at least one file or --text", file=sys.stderr)
        sys.exit(1)

    prompt = await generate_music_prompt(
        file_paths=args.files or None,
        text=args.text,
        model_name=args.model,
        max_video_frames=args.max_video_frames,
        verbose=args.verbose,
        debug=args.debug,
        disable_web_search=args.no_web_search,
    )

    print(prompt.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())

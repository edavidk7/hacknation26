"""CLI entry point: turn multimodal inputs into a structured music prompt."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

from src.agent.music_agent import generate_music_prompt

log = logging.getLogger(__name__)


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
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory (default: outputs/YYYY-MM-DD/HH-MM-SS).",
    )
    return parser.parse_args()


def setup_output_dir(custom_dir: str | None = None) -> Path:
    """Create output directory with timestamp."""
    if custom_dir:
        output_dir = Path(custom_dir)
    else:
        now = datetime.now()
        output_dir = Path("outputs") / now.strftime("%Y-%m-%d") / now.strftime("%H-%M-%S")
    
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def setup_logging(output_dir: Path, verbose: bool = False, debug: bool = False) -> None:
    """Setup logging to both console and file."""
    log_level = logging.DEBUG if (verbose or debug) else logging.INFO
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(log_level)
    console_formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    console_handler.setFormatter(console_formatter)
    
    # File handler
    log_file = output_dir / "execution.log"
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)
    file_handler.setFormatter(console_formatter)
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)


async def main() -> None:
    args = parse_args()
    
    # Setup output directory
    output_dir = setup_output_dir(args.output_dir)
    
    # Setup logging
    setup_logging(output_dir, args.verbose, args.debug)
    
    start_time = time.time()
    start_datetime = datetime.now().isoformat()
    
    # Log execution parameters
    log.info("=" * 80)
    log.info("Starting music prompt generation")
    log.info("Execution Parameters:")
    log.info(f"  - Timestamp: {start_datetime}")
    log.info(f"  - Input files: {args.files or []}")
    log.info(f"  - Text input: {'<provided>' if args.text else '<none>'}")
    log.info(f"  - Model: {args.model or 'default (moonshotai/kimi-k2.5)'}")
    log.info(f"  - Max video frames: {args.max_video_frames}")
    log.info(f"  - Verbose logging: {args.verbose}")
    log.info(f"  - Debug mode: {args.debug}")
    log.info(f"  - Web search disabled: {args.no_web_search}")
    log.info(f"  - Output directory: {output_dir}")
    log.info("=" * 80)

    if not args.files and not args.text:
        log.error("Error: provide at least one file or --text")
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

    elapsed_time = time.time() - start_time
    log.info("=" * 80)
    log.info(f"Execution completed successfully in {elapsed_time:.2f}s")
    log.info("=" * 80)
    
    # Save output JSON
    output_file = output_dir / "result.json"
    output_file.write_text(prompt.model_dump_json(indent=2))
    log.info(f"Result saved to {output_file}")
    
    # Save parameters to JSON
    params_file = output_dir / "params.json"
    params = {
        "timestamp": start_datetime,
        "files": args.files or [],
        "text": args.text,
        "model": args.model or "moonshotai/kimi-k2.5",
        "max_video_frames": args.max_video_frames,
        "verbose": args.verbose,
        "debug": args.debug,
        "no_web_search": args.no_web_search,
        "runtime_seconds": elapsed_time,
    }
    params_file.write_text(json.dumps(params, indent=2))
    log.info(f"Parameters saved to {params_file}")
    
    # Print to stdout as well
    print(prompt.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())

"""REST API routes for the music generation agentic loop."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from src.agent.music_agent import generate_music_prompt, assemble_music_prompt
from src.services.ace_step_client import (
    AceStepClient,
    vibe_tree_to_ace_step_params,
    song_characteristics_to_ace_step_params,
)

log = logging.getLogger(__name__)

# Simple in-memory job storage (use Redis/DB for production)
jobs: dict[str, dict] = {}

# Create temporary directory for uploads
TEMP_DIR = Path("/tmp/hacknation_uploads")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


class JobStatus(BaseModel):
    job_id: str
    status: str  # "processing", "completed", "failed"
    result: Optional[dict] = None
    error: Optional[str] = None


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="HackNation Music Generation API",
        description="REST API for multimodal memory to music agentic pipeline",
        version="0.1.0",
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, restrict to specific domains
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/api/generate")
    async def generate_tree(
        text: str = Form(...),
        model_name: Optional[str] = Form(None),
        max_video_frames: int = Form(6),
        disable_web_search: bool = Form(False),
        use_mock: bool = Form(False),
        files: list[UploadFile] = File(default=[]),
        background_tasks: BackgroundTasks = BackgroundTasks(),
    ) -> dict:
        """
        Generate a vibe tree from multimodal inputs.

        Args:
            text: Text description/prompt
            model_name: Optional OpenRouter model ID
            max_video_frames: Max keyframes to extract from videos
            disable_web_search: Whether to disable web search
            files: List of uploaded files (images, audio, video)
            background_tasks: FastAPI background tasks

        Returns:
            Job ID and initial status
        """
        job_id = str(uuid.uuid4())
        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # Save uploaded files
        file_paths = []
        try:
            for file in files:
                if file.filename:
                    file_path = job_dir / file.filename
                    with open(file_path, "wb") as f:
                        f.write(await file.read())
                    file_paths.append(str(file_path))
        except Exception as e:
            log.error(f"Error saving uploaded files: {e}")
            shutil.rmtree(job_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail="Failed to save uploaded files")

        # Initialize job status
        jobs[job_id] = {
            "status": "processing",
            "result": None,
            "error": None,
        }

        # Start generation in background
        background_tasks.add_task(
            _run_generation,
            job_id,
            file_paths,
            text,
            model_name,
            max_video_frames,
            disable_web_search,
            use_mock,
        )

        return {"job_id": job_id, "status": "processing"}

    @app.get("/api/status/{job_id}")
    async def get_status(job_id: str) -> JobStatus:
        """Get the status and result of a generation job."""
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")

        job = jobs[job_id]
        return JobStatus(
            job_id=job_id,
            status=job["status"],
            result=job.get("result"),
            error=job.get("error"),
        )

    @app.post("/api/generate-music")
    async def generate_music(
        vibe_tree: str = Form(...),
        reference_audio: Optional[UploadFile] = File(None),
        background_tasks: BackgroundTasks = BackgroundTasks(),
    ) -> dict:
        """Generate music from a VibeTree via ACE-Step.

        Args:
            vibe_tree: JSON string of the VibeTree
            reference_audio: Optional audio file for style transfer
        """
        try:
            tree_dict = json.loads(vibe_tree)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid vibe_tree JSON: {e}")

        job_id = str(uuid.uuid4())
        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # Save reference audio if provided
        ref_audio_path: str | None = None
        if reference_audio and reference_audio.filename:
            ref_path = job_dir / reference_audio.filename
            with open(ref_path, "wb") as f:
                f.write(await reference_audio.read())
            ref_audio_path = str(ref_path)

        jobs[job_id] = {"status": "processing", "result": None, "error": None}

        background_tasks.add_task(
            _run_music_generation, job_id, tree_dict, ref_audio_path
        )

        return {"job_id": job_id, "status": "processing"}

    @app.get("/api/audio/{job_id}")
    async def get_audio(job_id: str):
        """Serve the generated audio file for a job."""
        audio_path = TEMP_DIR / job_id / "output.mp3"
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        return FileResponse(str(audio_path), media_type="audio/mpeg")

    @app.get("/api/health")
    async def health_check() -> dict:
        """Health check endpoint."""
        return {"status": "ok"}

    # ── ACE-Step proxy endpoints ─────────────────────────

    @app.get("/api/ace-step/health")
    async def ace_step_health() -> dict:
        """Check if the remote ACE-Step API is reachable."""
        client = AceStepClient()
        ok = await client.health_check()
        return {"ace_step_available": ok}

    @app.get("/api/ace-step/stats")
    async def ace_step_stats() -> dict:
        """Get ACE-Step server statistics (queue size, job counts)."""
        client = AceStepClient()
        try:
            stats = await client.server_stats()
            return {"status": "ok", "data": stats}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ACE-Step stats failed: {e}")

    @app.get("/api/ace-step/models")
    async def ace_step_models() -> dict:
        """List available DiT models on the ACE-Step server."""
        client = AceStepClient()
        try:
            models = await client.list_models()
            return {"status": "ok", "data": models}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ACE-Step models failed: {e}")

    @app.post("/api/ace-step/inspire")
    async def ace_step_inspire(
        query: str = Form(...),
        instrumental: bool = Form(False),
        temperature: float = Form(0.85),
    ) -> dict:
        """Generate a song blueprint (caption, lyrics, metadata) from text description.
        No audio is produced."""
        client = AceStepClient()
        try:
            result = await client.inspire(
                query=query, instrumental=instrumental, temperature=temperature
            )
            return {"status": "ok", "data": result}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ACE-Step inspire failed: {e}")

    @app.post("/api/ace-step/understand")
    async def ace_step_understand(
        audio: UploadFile = File(...),
        temperature: float = Form(0.3),
    ) -> dict:
        """Analyze an uploaded audio file to extract caption, BPM, key, lyrics, duration."""
        job_dir = TEMP_DIR / str(uuid.uuid4())
        job_dir.mkdir(parents=True, exist_ok=True)
        audio_path = job_dir / (audio.filename or "upload.mp3")
        try:
            with open(audio_path, "wb") as f:
                f.write(await audio.read())
            client = AceStepClient()
            result = await client.understand_audio(str(audio_path), temperature)
            return {"status": "ok", "data": result}
        except Exception as e:
            raise HTTPException(
                status_code=502, detail=f"ACE-Step understand failed: {e}"
            )
        finally:
            shutil.rmtree(job_dir, ignore_errors=True)

    @app.post("/api/ace-step/repaint")
    async def ace_step_repaint(
        src_audio: UploadFile = File(...),
        prompt: str = Form(...),
        repainting_start: float = Form(0.0),
        repainting_end: float = Form(15.0),
        background_tasks: BackgroundTasks = BackgroundTasks(),
    ) -> dict:
        """Remix a section of existing audio. Returns a job_id to poll for result."""
        job_id = str(uuid.uuid4())
        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        src_path = job_dir / (src_audio.filename or "source.mp3")
        with open(src_path, "wb") as f:
            f.write(await src_audio.read())

        jobs[job_id] = {"status": "processing", "result": None, "error": None}
        background_tasks.add_task(
            _run_repaint,
            job_id,
            str(src_path),
            prompt,
            repainting_start,
            repainting_end,
        )
        return {"job_id": job_id, "status": "processing"}

    @app.post("/api/ace-step/style-transfer")
    async def ace_step_style_transfer(
        ref_audio: UploadFile = File(...),
        prompt: str = Form(...),
        lyrics: str = Form(""),
        audio_cover_strength: float = Form(0.2),
        audio_duration: float = Form(30),
        background_tasks: BackgroundTasks = BackgroundTasks(),
    ) -> dict:
        """Generate music using a reference audio for style. Returns a job_id."""
        job_id = str(uuid.uuid4())
        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        ref_path = job_dir / (ref_audio.filename or "reference.mp3")
        with open(ref_path, "wb") as f:
            f.write(await ref_audio.read())

        jobs[job_id] = {"status": "processing", "result": None, "error": None}
        background_tasks.add_task(
            _run_style_transfer,
            job_id,
            str(ref_path),
            prompt,
            lyrics,
            audio_cover_strength,
            audio_duration,
        )
        return {"job_id": job_id, "status": "processing"}

    return app


async def _run_generation(
    job_id: str,
    file_paths: list[str],
    text: str,
    model_name: Optional[str],
    max_video_frames: int,
    disable_web_search: bool,
    use_mock: bool = False,
) -> None:
    """Run the music prompt generation in the background.

    This now does the full pipeline:
    1. Generate vibe tree from multimodal inputs
    2. Convert vibe tree to ACE-Step parameters
    3. Call ACE-Step to generate music
    """
    try:
        log.info(f"Starting generation for job {job_id}")
        log.info(f"  Files: {file_paths}")
        log.info(f"  Text: {text}")
        log.info(f"  Use mock: {use_mock}")

        # Step 1: Generate vibe tree
        log.info(f"[{job_id}] Generating vibe tree...")

        # Get thinking budget from environment or use default
        thinking_budget = None
        if os.getenv("THINKING_BUDGET"):
            try:
                thinking_budget = int(os.getenv("THINKING_BUDGET"))
            except ValueError:
                log.warning("Invalid THINKING_BUDGET env var, using default")

        vibe_tree = await generate_music_prompt(
            file_paths=file_paths if file_paths else None,
            text=text,
            model_name=model_name,
            max_video_frames=max_video_frames,
            verbose=False,
            debug=False,
            disable_web_search=disable_web_search,
            use_mock=use_mock,
            thinking_budget=thinking_budget,
        )

        # Convert to dict for storage
        vibe_tree_dict = (
            vibe_tree.model_dump() if hasattr(vibe_tree, "model_dump") else vibe_tree
        )
        log.info(f"[{job_id}] Vibe tree generated successfully")

        # Step 2: Assembly pass — LLM converts tree to coherent caption + lyrics
        log.info(f"[{job_id}] Running assembly pass...")
        assembled = await assemble_music_prompt(
            vibe_tree=vibe_tree_dict,
            original_text=text,
        )
        if assembled.get("prompt"):
            log.info(
                f"[{job_id}] Assembly pass succeeded: caption='{assembled['prompt'][:80]}...'"
            )
        else:
            log.warning(
                f"[{job_id}] Assembly pass returned empty, falling back to mechanical conversion"
            )

        # Step 3: Convert vibe tree to ACE-Step parameters
        log.info(f"[{job_id}] Converting to ACE-Step parameters...")
        ace_params = song_characteristics_to_ace_step_params(
            vibe_tree, assembled_prompt=assembled if assembled.get("prompt") else None
        )
        log.info(
            f"[{job_id}] ACE-Step params: prompt='{ace_params.get('prompt', '')[:100]}...'"
        )

        # Step 4: Generate music via ACE-Step (optional)
        log.info(f"[{job_id}] Submitting to ACE-Step...")
        ace_result = None
        try:
            client = AceStepClient()
            ace_result = await client.generate_music(ace_params)

            # Save audio to job directory
            job_dir = TEMP_DIR / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            audio_path = job_dir / "output.mp3"
            audio_path.write_bytes(ace_result["audio_bytes"])
            log.info(
                f"[{job_id}] Saved audio to {audio_path} ({len(ace_result['audio_bytes'])} bytes)"
            )
        except Exception as ace_error:
            log.warning(
                f"[{job_id}] ACE-Step generation failed (continuing without audio): {ace_error}"
            )
            ace_result = None

        # Store result with both tree and generation metadata
        result_data = {
            "vibe_tree": vibe_tree_dict,
        }

        # Include assembled prompt so frontend can display what was sent to ACE-Step
        if assembled.get("prompt"):
            result_data["assembled_prompt"] = assembled

        if ace_result:
            result_data["audio_url"] = f"/api/audio/{job_id}"
            result_data["descriptions"] = ace_result.get("descriptions", {})
        else:
            result_data["audio_status"] = "not_generated"
            result_data["audio_error"] = "ACE-Step API not available"

        jobs[job_id] = {
            "status": "completed",
            "result": result_data,
            "error": None,
        }

        log.info(f"[{job_id}] Completed full generation pipeline")

    except Exception as e:
        log.error(f"Error during generation for job {job_id}: {e}", exc_info=True)
        jobs[job_id] = {
            "status": "failed",
            "result": None,
            "error": str(e),
        }

    finally:
        # Clean up temporary input files
        job_dir = TEMP_DIR / job_id
        # Only clean up input files, not output audio
        for f in (job_dir).glob("*"):
            if f.name != "output.mp3":
                f.unlink(missing_ok=True)


async def _run_music_generation(
    job_id: str,
    vibe_tree: dict,
    reference_audio_path: str | None,
) -> None:
    """Run ACE-Step music generation in the background."""
    try:
        log.info(f"Starting music generation for job {job_id}")

        # Assembly pass — LLM converts (user-edited) tree to coherent caption + lyrics
        log.info(f"[{job_id}] Running assembly pass on edited tree...")
        assembled = await assemble_music_prompt(vibe_tree=vibe_tree)
        if assembled.get("prompt"):
            log.info(
                f"[{job_id}] Assembly pass succeeded: caption='{assembled['prompt'][:80]}...'"
            )
        else:
            log.warning(
                f"[{job_id}] Assembly pass returned empty, falling back to mechanical conversion"
            )

        params = vibe_tree_to_ace_step_params(
            vibe_tree,
            reference_audio_path,
            assembled_prompt=assembled if assembled.get("prompt") else None,
        )
        log.info(f"  ACE-Step params: prompt={params.get('prompt', '')[:100]}...")

        client = AceStepClient()
        result = await client.generate_music(params)

        # Save audio to job directory
        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        audio_path = job_dir / "output.mp3"
        audio_path.write_bytes(result["audio_bytes"])
        log.info(f"Saved audio to {audio_path} ({len(result['audio_bytes'])} bytes)")

        jobs[job_id] = {
            "status": "completed",
            "result": {
                "audio_url": f"/api/audio/{job_id}",
                "descriptions": result["descriptions"],
                **({"assembled_prompt": assembled} if assembled.get("prompt") else {}),
            },
            "error": None,
        }
        log.info(f"Completed music generation for job {job_id}")

    except Exception as e:
        log.error(f"Error during music generation for job {job_id}: {e}", exc_info=True)
        jobs[job_id] = {
            "status": "failed",
            "result": None,
            "error": str(e),
        }


async def _run_repaint(
    job_id: str,
    src_audio_path: str,
    prompt: str,
    repainting_start: float,
    repainting_end: float,
) -> None:
    """Run ACE-Step repaint/remix in the background."""
    try:
        log.info(f"Starting repaint for job {job_id}")
        client = AceStepClient()
        result = await client.repaint(
            src_audio_path=src_audio_path,
            prompt=prompt,
            repainting_start=repainting_start,
            repainting_end=repainting_end,
        )

        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        audio_path = job_dir / "output.mp3"
        audio_path.write_bytes(result["audio_bytes"])
        log.info(
            f"Saved repainted audio to {audio_path} ({len(result['audio_bytes'])} bytes)"
        )

        jobs[job_id] = {
            "status": "completed",
            "result": {
                "audio_url": f"/api/audio/{job_id}",
                "descriptions": result["descriptions"],
            },
            "error": None,
        }
    except Exception as e:
        log.error(f"Error during repaint for job {job_id}: {e}", exc_info=True)
        jobs[job_id] = {"status": "failed", "result": None, "error": str(e)}


async def _run_style_transfer(
    job_id: str,
    ref_audio_path: str,
    prompt: str,
    lyrics: str,
    audio_cover_strength: float,
    audio_duration: float,
) -> None:
    """Run ACE-Step style transfer in the background."""
    try:
        log.info(f"Starting style transfer for job {job_id}")
        client = AceStepClient()
        result = await client.style_transfer(
            ref_audio_path=ref_audio_path,
            prompt=prompt,
            lyrics=lyrics,
            audio_cover_strength=audio_cover_strength,
            audio_duration=audio_duration,
        )

        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        audio_path = job_dir / "output.mp3"
        audio_path.write_bytes(result["audio_bytes"])
        log.info(
            f"Saved style-transferred audio to {audio_path} ({len(result['audio_bytes'])} bytes)"
        )

        jobs[job_id] = {
            "status": "completed",
            "result": {
                "audio_url": f"/api/audio/{job_id}",
                "descriptions": result["descriptions"],
            },
            "error": None,
        }
    except Exception as e:
        log.error(f"Error during style transfer for job {job_id}: {e}", exc_info=True)
        jobs[job_id] = {"status": "failed", "result": None, "error": str(e)}

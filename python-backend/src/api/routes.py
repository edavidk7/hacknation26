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
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.agent.music_agent import generate_music_prompt

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

    @app.get("/api/health")
    async def health_check() -> dict:
        """Health check endpoint."""
        return {"status": "ok"}

    return app


async def _run_generation(
    job_id: str,
    file_paths: list[str],
    text: str,
    model_name: Optional[str],
    max_video_frames: int,
    disable_web_search: bool,
) -> None:
    """Run the music prompt generation in the background."""
    try:
        log.info(f"Starting generation for job {job_id}")
        log.info(f"  Files: {file_paths}")
        log.info(f"  Text: {text}")

        result = await generate_music_prompt(
            file_paths=file_paths if file_paths else None,
            text=text,
            model_name=model_name,
            max_video_frames=max_video_frames,
            verbose=False,
            debug=False,
            disable_web_search=disable_web_search,
        )

        # Convert Pydantic model to dict
        result_dict = result.model_dump() if hasattr(result, "model_dump") else result
        jobs[job_id] = {
            "status": "completed",
            "result": result_dict,
            "error": None,
        }

        log.info(f"Completed generation for job {job_id}")
        log.info(f"Result structure: {json.dumps(result_dict, indent=2, default=str)}")

    except Exception as e:
        log.error(f"Error during generation for job {job_id}: {e}", exc_info=True)
        jobs[job_id] = {
            "status": "failed",
            "result": None,
            "error": str(e),
        }

    finally:
        # Clean up temporary files
        job_dir = TEMP_DIR / job_id
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)

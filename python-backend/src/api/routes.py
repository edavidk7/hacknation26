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

from src.agent.music_agent import generate_music_prompt
from src.services.ace_step_client import (
    AceStepClient,
    vibe_tree_to_ace_step_params,
    song_characteristics_to_ace_step_params,
)
from src.services.snapshot_service import (
    SnapshotStore,
    create_snapshot,
    compute_tree_diff,
    create_diff_summary,
)
from src.models.snapshot import TreeDiff

log = logging.getLogger(__name__)

# Simple in-memory job storage (use Redis/DB for production)
jobs: dict[str, dict] = {}
snapshot_store = SnapshotStore()

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

    @app.post("/api/snapshot/create")
    async def create_tree_snapshot(
        tree: str = Form(...),
        generation_params: Optional[str] = Form(None),
        ace_metadata: Optional[str] = Form(None),
        ace_generation_info: Optional[str] = Form(None),
        audio_url: Optional[str] = Form(None),
        reference_audio: Optional[UploadFile] = File(None),
    ) -> dict:
        """
        Create a snapshot of the current tree and generation state.
        
        Args:
            tree: JSON string of SongCharacteristics
            generation_params: JSON string of ACE-Step parameters used
            ace_metadata: JSON string of ACE metadata (bpm, key, etc.)
            ace_generation_info: Low-level ACE generation prompt
            audio_url: URL to generated audio
            reference_audio: Optional reference audio file
        
        Returns:
            Snapshot ID and metadata
        """
        try:
            tree_dict = json.loads(tree)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid tree JSON: {e}")
        
        gen_params = {}
        if generation_params:
            try:
                gen_params = json.loads(generation_params)
            except json.JSONDecodeError:
                log.warning("Failed to parse generation_params JSON")
        
        ace_meta = {}
        if ace_metadata:
            try:
                ace_meta = json.loads(ace_metadata)
            except json.JSONDecodeError:
                log.warning("Failed to parse ace_metadata JSON")
        
        # Save reference audio if provided
        ref_audio_path: str | None = None
        if reference_audio and reference_audio.filename:
            job_id = str(uuid.uuid4())
            job_dir = TEMP_DIR / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            ref_path = job_dir / reference_audio.filename
            with open(ref_path, "wb") as f:
                f.write(await reference_audio.read())
            ref_audio_path = str(ref_path)
        
        snapshot = create_snapshot(
            tree=tree_dict,
            generation_params=gen_params,
            ace_metadata=ace_meta,
            ace_generation_info=ace_generation_info,
            audio_url=audio_url,
            reference_audio_path=ref_audio_path,
        )
        
        snapshot_store.save_snapshot(snapshot)
        
        return {
            "snapshot_id": snapshot.snapshot_id,
            "timestamp": snapshot.timestamp.isoformat(),
            "audio_url": snapshot.audio_url,
        }

    @app.get("/api/snapshot/{snapshot_id}")
    async def get_snapshot_detail(snapshot_id: str) -> dict:
        """Retrieve a specific snapshot."""
        snapshot = snapshot_store.get_snapshot(snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        
        return {
            "snapshot_id": snapshot.snapshot_id,
            "timestamp": snapshot.timestamp.isoformat(),
            "tree": snapshot.tree.model_dump() if hasattr(snapshot.tree, "model_dump") else snapshot.tree,
            "ace_prompt": snapshot.ace_prompt,
            "ace_lyrics": snapshot.ace_lyrics,
            "ace_metadata": snapshot.ace_metadata,
            "ace_generation_info": snapshot.ace_generation_info,
            "audio_url": snapshot.audio_url,
        }

    @app.get("/api/snapshots")
    async def list_all_snapshots() -> dict:
        """List all snapshots (newest first)."""
        snapshots = snapshot_store.list_snapshots()
        return {
            "snapshots": [
                {
                    "snapshot_id": s.snapshot_id,
                    "timestamp": s.timestamp.isoformat(),
                    "tree_title": s.tree.root.get("name") if isinstance(s.tree, dict) else s.tree.root.name if hasattr(s.tree.root, "name") else "Untitled",
                    "audio_url": s.audio_url,
                }
                for s in snapshots
            ]
        }

    @app.post("/api/diff/compute")
    async def compute_diff(
        from_snapshot_id: str = Form(...),
        to_snapshot_id: str = Form(...),
    ) -> dict:
        """
        Compute diff between two snapshots.
        
        Args:
            from_snapshot_id: ID of original snapshot (or "initial" for empty)
            to_snapshot_id: ID of modified snapshot
        
        Returns:
            Diff with list of changed nodes
        """
        from_snap = snapshot_store.get_snapshot(from_snapshot_id) if from_snapshot_id != "initial" else None
        to_snap = snapshot_store.get_snapshot(to_snapshot_id)
        
        if not to_snap:
            raise HTTPException(status_code=404, detail="Target snapshot not found")
        
        from_tree = from_snap.tree if from_snap else {}
        to_tree = to_snap.tree
        
        diffs = compute_tree_diff(from_tree, to_tree)
        summary = create_diff_summary(diffs)
        
        tree_diff = TreeDiff(
            from_snapshot_id=from_snapshot_id,
            to_snapshot_id=to_snapshot_id,
            node_diffs=diffs,
            summary=summary,
        )
        
        snapshot_store.save_diff(tree_diff)
        
        return {
            "from_snapshot_id": from_snapshot_id,
            "to_snapshot_id": to_snapshot_id,
            "summary": summary,
            "changes": [
                {
                    "path": d.path,
                    "node_name": d.node_name,
                    "type": d.change_type,
                    "original": d.original_value,
                    "modified": d.modified_value,
                }
                for d in diffs
            ],
        }

    @app.post("/api/music-worktree")
    async def generate_music_from_worktree(
        tree: str = Form(...),
        snapshot_id: Optional[str] = Form(None),
        reference_audio: Optional[UploadFile] = File(None),
        background_tasks: BackgroundTasks = BackgroundTasks(),
    ) -> dict:
        """
        Generate music from a potentially modified tree in worktree mode.
        Creates a new snapshot and generates music via ACE-Step.
        
        Args:
            tree: JSON string of modified SongCharacteristics
            snapshot_id: Optional ID of original snapshot for diff computation
            reference_audio: Optional audio file for style transfer
        
        Returns:
            Job ID for music generation
        """
        try:
            tree_dict = json.loads(tree)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid tree JSON: {e}")
        
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
        
        jobs[job_id] = {
            "status": "processing",
            "result": None,
            "error": None,
        }
        
        background_tasks.add_task(
            _run_worktree_music_generation,
            job_id,
            tree_dict,
            snapshot_id,
            ref_audio_path,
        )
        
        return {"job_id": job_id, "status": "processing"}

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
        vibe_tree_dict = vibe_tree.model_dump() if hasattr(vibe_tree, "model_dump") else vibe_tree
        log.info(f"[{job_id}] Vibe tree generated successfully")
        
        # Step 2: Convert vibe tree to ACE-Step parameters
        log.info(f"[{job_id}] Converting to ACE-Step parameters...")
        ace_params = song_characteristics_to_ace_step_params(vibe_tree)
        log.info(f"[{job_id}] ACE-Step params: prompt='{ace_params.get('prompt', '')[:100]}...'")
        
        # Step 3: Generate music via ACE-Step (optional)
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
            log.info(f"[{job_id}] Saved audio to {audio_path} ({len(ace_result['audio_bytes'])} bytes)")
        except Exception as ace_error:
            log.warning(f"[{job_id}] ACE-Step generation failed (continuing without audio): {ace_error}")
            ace_result = None
        
        # Store result with both tree and generation metadata
        result_data = {
            "vibe_tree": vibe_tree_dict,
        }
        
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

        params = vibe_tree_to_ace_step_params(vibe_tree, reference_audio_path)
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


async def _run_worktree_music_generation(
    job_id: str,
    tree_dict: dict,
    original_snapshot_id: str | None,
    reference_audio_path: str | None,
) -> None:
    """Run music generation from worktree with snapshot management."""
    try:
        log.info(f"[{job_id}] Starting worktree music generation")

        # Step 1: Convert tree to ACE-Step parameters
        params = song_characteristics_to_ace_step_params(tree_dict, reference_audio_path)
        log.info(f"[{job_id}] ACE-Step params: prompt='{params.get('prompt', '')[:100]}...'")

        # Step 2: Generate music via ACE-Step
        client = AceStepClient()
        result = await client.generate_music(params)

        # Step 3: Save audio to job directory
        job_dir = TEMP_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        audio_path = job_dir / "output.mp3"
        audio_path.write_bytes(result["audio_bytes"])
        audio_url = f"/api/audio/{job_id}"
        log.info(f"[{job_id}] Saved audio to {audio_path} ({len(result['audio_bytes'])} bytes)")

        # Step 4: Create snapshot with generation metadata
        ace_metadata = result.get("descriptions", {})
        ace_generation_info = ace_metadata.get("generation_info", "")
        
        snapshot = create_snapshot(
            tree=tree_dict,
            generation_params=params,
            ace_metadata=ace_metadata,
            ace_generation_info=ace_generation_info,
            audio_url=audio_url,
            reference_audio_path=reference_audio_path,
        )
        snapshot_store.save_snapshot(snapshot)

        # Step 5: Compute diff if original snapshot provided
        diff_info = None
        if original_snapshot_id:
            diffs = compute_tree_diff(
                snapshot_store.get_snapshot(original_snapshot_id).tree
                if snapshot_store.get_snapshot(original_snapshot_id)
                else {},
                tree_dict,
            )
            summary = create_diff_summary(diffs)
            diff_info = {
                "original_snapshot_id": original_snapshot_id,
                "new_snapshot_id": snapshot.snapshot_id,
                "summary": summary,
                "changes_count": len(diffs),
            }

        # Step 6: Store job result
        jobs[job_id] = {
            "status": "completed",
            "result": {
                "audio_url": audio_url,
                "descriptions": ace_metadata,
                "snapshot_id": snapshot.snapshot_id,
                "diff_info": diff_info,
            },
            "error": None,
        }
        log.info(f"[{job_id}] Completed worktree music generation")

    except Exception as e:
        log.error(f"[{job_id}] Error during worktree music generation: {e}", exc_info=True)
        jobs[job_id] = {
            "status": "failed",
            "result": None,
            "error": str(e),
        }

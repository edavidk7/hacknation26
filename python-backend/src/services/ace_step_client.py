"""HTTP client for the ACE-Step music generation REST API.

Supports all API capabilities demoed in music_api_demo/:
  1. Health check          — GET  /health
  2. List models           — GET  /v1/models
  3. Server stats          — GET  /v1/stats
  4. Understand audio      — POST /lm/understand
  5. Inspire (text→plan)   — POST /lm/inspire
  6. Format (enhance)      — POST /lm/format
  7. Generate (prompt)     — POST /release_task  (prompt + lyrics)
  8. Generate (query)      — POST /release_task  (sample_query + thinking)
  9. Repaint / remix       — POST /release_task  (src_audio + task_type=repaint)
 10. Style transfer        — POST /release_task  (ref_audio + audio_cover_strength)
 11. Poll result           — POST /query_result
 12. Download audio        — GET  /v1/audio
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import httpx

from src.models.song_tree import SongCharacteristics, SongNode

log = logging.getLogger(__name__)

# Remote ACE-Step server (ngrok tunnel)
DEFAULT_ACESTEP_URL = "https://abox-noneruptive-felisha.ngrok-free.dev"
DEFAULT_ACESTEP_USER = "admin"
DEFAULT_ACESTEP_PASS = "goldenhands"


def song_characteristics_to_ace_step_params(
    song_chars: SongCharacteristics | dict,
    reference_audio_path: str | None = None,
    assembled_prompt: dict | None = None,
) -> dict:
    """Convert a SongCharacteristics tree into ACE-Step /release_task parameters.

    If ``assembled_prompt`` is provided (from the LLM assembly pass), uses the
    direct ``prompt`` + ``lyrics`` approach — bypassing ACE-Step's own LM
    for better quality since Kimi has full context of the tree.

    Otherwise falls back to the ``sample_query`` + ``thinking`` approach so that
    ACE-Step's own LM auto-generates caption, lyrics, and metadata from a
    natural-language description derived from the vibe tree.

    Args:
        song_chars: SongCharacteristics (Pydantic model or dict).
        reference_audio_path: Optional reference audio for style transfer.
        assembled_prompt: Optional dict with "prompt" (caption) and "lyrics" keys
            from the assembly pass.
    """
    # Convert Pydantic model to dict if needed
    if isinstance(song_chars, SongCharacteristics):
        tree_dict = song_chars.model_dump()
    else:
        tree_dict = song_chars

    if not tree_dict:
        log.warning("song_chars is empty, using defaults")
        tree_dict = {}

    root = tree_dict.get("root") or tree_dict
    if not root:
        log.error("Could not find root in tree_dict. Keys: %s", list(tree_dict.keys()))
        root = {}

    # Extract duration
    duration = root.get("metadata", {}).get("duration_seconds")
    audio_duration = min(float(duration), 120) if duration is not None else 30

    # ── If assembly pass produced a prompt, use direct prompt+lyrics ──
    if assembled_prompt and assembled_prompt.get("prompt"):
        params: dict[str, Any] = {
            "prompt": assembled_prompt["prompt"],
            "lyrics": assembled_prompt.get("lyrics", "[Instrumental]"),
            "inference_steps": 8,
            "batch_size": 1,
            "audio_format": "mp3",
            "audio_duration": audio_duration,
        }
        log.info(
            "Using assembled prompt (direct mode): caption='%s...', lyrics_len=%d",
            assembled_prompt["prompt"][:80],
            len(assembled_prompt.get("lyrics", "")),
        )
        return params

    # ── Fallback: Build a natural-language description from the tree ──
    description_parts: list[str] = []

    # Title
    title = root.get("name", "")
    if title:
        description_parts.append(f'"{title}".')

    # Tags
    tags = root.get("metadata", {}).get("tags", [])
    if tags:
        description_parts.append(f"Tags: {', '.join(str(t) for t in tags)}.")

    # Collect key characteristics from the tree
    def summarise_node(node: dict | None, depth: int = 0) -> str:
        if node is None or depth > 4:
            return ""
        parts: list[str] = []
        name = node.get("name", "")
        value = node.get("value")

        if value is not None:
            if isinstance(value, list):
                val_str = ", ".join(str(v) for v in value if v)
            else:
                val_str = str(value)
            if val_str:
                parts.append(f"{name}: {val_str}")
        elif name:
            # Check metadata for interesting values
            meta = node.get("metadata", {})
            meta_strs = []
            for k, v in meta.items():
                if k in ("tags", "overall_arc"):
                    continue  # already handled
                if isinstance(v, list):
                    meta_strs.append(f"{k}={', '.join(str(x) for x in v)}")
                elif v is not None:
                    meta_strs.append(f"{k}={v}")
            if meta_strs:
                parts.append(f"{name} ({'; '.join(meta_strs)})")

        # Recurse into children
        for child in node.get("children", []):
            child_summary = summarise_node(child, depth + 1)
            if child_summary:
                parts.append(child_summary)

        return ". ".join(parts)

    tree_summary = summarise_node(root)
    if tree_summary:
        description_parts.append(tree_summary)

    sample_query = " ".join(description_parts).strip()
    if not sample_query:
        sample_query = "instrumental music composition"

    # ── Build params (fallback: sample_query + thinking) ──────────
    params = {
        "sample_query": sample_query,
        "thinking": True,
        "inference_steps": 8,
        "batch_size": 1,
        "audio_format": "mp3",
        "audio_duration": audio_duration,
    }

    log.info(
        "Converted SongCharacteristics → ACE-Step sample_query='%s' (fallback mode)",
        sample_query[:120],
    )
    return params


def vibe_tree_to_ace_step_params(
    vibe_tree: dict,
    reference_audio_path: str | None = None,
    assembled_prompt: dict | None = None,
) -> dict:
    """Convert a VibeTree JSON dict into ACE-Step /release_task parameters.

    Handles both SongNode-tree format (branches.tree) and the legacy
    VibeTree format (branches with mood/genre/instruments/etc).

    If ``assembled_prompt`` is provided, passes it through to use direct
    prompt+lyrics mode instead of sample_query+thinking.
    """
    root = vibe_tree.get("root", vibe_tree)
    sections = root.get("sections", [])
    global_cfg = root.get("global", {})

    # Check if sections contain a SongNode tree
    has_song_node_tree = (
        sections
        and sections[0].get("branches", {}).get("tree")
        and isinstance(sections[0]["branches"]["tree"], dict)
        and "name" in sections[0]["branches"]["tree"]
    )

    if has_song_node_tree:
        # Delegate to song_characteristics_to_ace_step_params
        song_node = sections[0]["branches"]["tree"]
        return song_characteristics_to_ace_step_params(
            {"root": song_node},
            reference_audio_path,
            assembled_prompt,
        )

    # ── Legacy VibeTree format ──────────────────────────
    description_parts: list[str] = []

    concept = root.get("concept", "")
    if concept:
        description_parts.append(concept)

    for sec in sections:
        b = sec.get("branches", {})
        genre = b.get("genre", {})
        if isinstance(genre, dict):
            if genre.get("primary"):
                description_parts.append(genre["primary"])
            for inf in genre.get("influences", []):
                description_parts.append(str(inf))
        mood = b.get("mood", {})
        if isinstance(mood, dict) and mood.get("primary"):
            description_parts.append(f"{mood['primary']} mood")
        for inst in b.get("instruments", []):
            if isinstance(inst, dict) and inst.get("name"):
                description_parts.append(inst["name"])

    sample_query = (
        ", ".join(description_parts) if description_parts else "instrumental music"
    )

    duration = global_cfg.get("duration_seconds")

    params: dict[str, Any] = {
        "sample_query": sample_query,
        "thinking": True,
        "inference_steps": 8,
        "batch_size": 1,
        "audio_format": "mp3",
    }

    if duration is not None:
        params["audio_duration"] = min(float(duration), 240)
    else:
        params["audio_duration"] = 30

    return params


class AceStepClient:
    """Async client for the ACE-Step REST API.

    Supports both local deployments and ngrok-tunneled remote endpoints.
    Auth is configured via environment variables:
      - ACESTEP_API_URL: base URL (default: ngrok tunnel)
      - ACESTEP_API_USER / ACESTEP_API_PASS: HTTP basic auth (for ngrok)
    """

    def __init__(
        self,
        base_url: str | None = None,
        username: str | None = None,
        password: str | None = None,
    ):
        self.base_url = (
            base_url or os.environ.get("ACESTEP_API_URL") or DEFAULT_ACESTEP_URL
        ).rstrip("/")
        self.username = (
            username or os.environ.get("ACESTEP_API_USER") or DEFAULT_ACESTEP_USER
        )
        self.password = (
            password or os.environ.get("ACESTEP_API_PASS") or DEFAULT_ACESTEP_PASS
        )

    def _headers(self) -> dict[str, str]:
        """Build request headers with auth and ngrok bypass."""
        headers: dict[str, str] = {
            # Required for ngrok free-tier to bypass browser interstitial
            "ngrok-skip-browser-warning": "true",
        }
        if self.username and self.password:
            creds = base64.b64encode(
                f"{self.username}:{self.password}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {creds}"
        return headers

    # ── 1. Health Check ─────────────────────────────────

    async def health_check(self) -> bool:
        """Check if the ACE-Step API is reachable.

        GET /health → {"data": {"status": "ok", "service": "ACE-Step API", "version": "1.0"}, ...}
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.base_url}/health",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                inner = data.get("data", data)
                return inner.get("status") == "ok"
        except Exception as e:
            log.warning("ACE-Step health check failed: %s", e)
            return False

    # ── 2. List Models ──────────────────────────────────

    async def list_models(self) -> dict:
        """List available DiT models.

        GET /v1/models → {"data": {"models": [...], "default_model": "..."}, ...}
        """
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/v1/models",
                headers=self._headers(),
            )
            resp.raise_for_status()
            body = resp.json()
            return body.get("data", body)

    # ── 3. Server Stats ─────────────────────────────────

    async def server_stats(self) -> dict:
        """Get server statistics (queue size, job counts, avg time).

        GET /v1/stats → {"data": {"jobs": {...}, "queue_size": 0, ...}, ...}
        """
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/v1/stats",
                headers=self._headers(),
            )
            resp.raise_for_status()
            body = resp.json()
            return body.get("data", body)

    # ── 4. LM Understand Audio ──────────────────────────

    async def understand_audio(
        self, audio_path: str | Path, temperature: float = 0.3
    ) -> dict:
        """Analyze an audio file to extract structured metadata.

        POST /lm/understand (multipart: audio file + temperature)

        Returns: {caption, lyrics, bpm, duration, key_scale, language, time_signature, seed}
        """
        path = Path(audio_path)
        mime = "audio/mpeg" if path.suffix.lower() == ".mp3" else "audio/*"

        async with httpx.AsyncClient(timeout=120) as client:
            with open(path, "rb") as f:
                resp = await client.post(
                    f"{self.base_url}/lm/understand",
                    files={"audio": (path.name, f, mime)},
                    data={"temperature": str(temperature)},
                    headers=self._headers(),
                )
            resp.raise_for_status()
            body = resp.json()
            result = body.get("data", body)
            log.info(
                "ACE-Step /lm/understand: caption='%s', bpm=%s, key=%s, duration=%s",
                str(result.get("caption", ""))[:80],
                result.get("bpm"),
                result.get("key_scale"),
                result.get("duration"),
            )
            return result

    # ── 5. LM Inspire ──────────────────────────────────

    async def inspire(
        self,
        query: str,
        instrumental: bool = False,
        temperature: float = 0.85,
        seed: int | None = None,
    ) -> dict:
        """Generate a creative blueprint (caption, lyrics, metadata) from text.
        No audio is produced — just the structured plan for a song.

        POST /lm/inspire (JSON: query, instrumental, temperature, seed)

        Returns: {caption, lyrics, bpm, duration, key_scale, language, time_signature, instrumental, seed}
        """
        payload: dict[str, Any] = {
            "query": query,
            "temperature": temperature,
        }
        if instrumental:
            payload["instrumental"] = True
        if seed is not None:
            payload["seed"] = seed

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/lm/inspire",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            body = resp.json()
            result = body.get("data", body)
            log.info(
                "ACE-Step /lm/inspire: caption='%s', bpm=%s, key=%s",
                str(result.get("caption", ""))[:80],
                result.get("bpm"),
                result.get("key_scale"),
            )
            return result

    # ── 6. LM Format ───────────────────────────────────

    async def format_prompt(
        self,
        prompt: str,
        lyrics: str | None = None,
        language: str | None = None,
        bpm: int | None = None,
        key_scale: str | None = None,
        time_signature: str | None = None,
        duration: float | None = None,
    ) -> dict:
        """Enhance a rough caption/lyrics into polished, structured form.

        POST /lm/format (JSON: prompt, lyrics, language, bpm, key_scale, time_signature, duration)

        Returns: {caption, lyrics, bpm, duration, key_scale, language, time_signature, seed}
        """
        payload: dict[str, Any] = {"prompt": prompt}
        if lyrics is not None:
            payload["lyrics"] = lyrics
        if language is not None:
            payload["language"] = language
        if bpm is not None:
            payload["bpm"] = bpm
        if key_scale is not None:
            payload["key_scale"] = key_scale
        if time_signature is not None:
            payload["time_signature"] = time_signature
        if duration is not None:
            payload["duration"] = duration

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/lm/format",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            body = resp.json()
            result = body.get("data", body)
            log.info(
                "ACE-Step /lm/format: caption='%s', bpm=%s",
                str(result.get("caption", ""))[:80],
                result.get("bpm"),
            )
            return result

    # ── 7–10. Task Submission ───────────────────────────

    async def submit_task(self, params: dict) -> str:
        """Submit a music generation task (any type). Returns the task_id.

        POST /release_task (JSON or multipart depending on audio uploads)
        """
        # Pop internal file-path markers (not sent as params)
        params = dict(params)  # shallow copy
        src_audio_path = params.pop("_src_audio_path", None)
        ref_audio_path = params.pop("_ref_audio_path", None)

        async with httpx.AsyncClient(timeout=30) as client:
            if src_audio_path or ref_audio_path:
                # Multipart upload for repaint / style transfer
                files_list: list[tuple[str, Any]] = []
                data: dict[str, str] = {}

                # Convert all params to form data strings
                for k, v in params.items():
                    if isinstance(v, bool):
                        data[k] = str(v).lower()
                    elif v is not None:
                        data[k] = str(v)

                opened_files = []
                if src_audio_path:
                    p = Path(src_audio_path)
                    fh = open(p, "rb")
                    opened_files.append(fh)
                    files_list.append(("src_audio", (p.name, fh, "audio/mpeg")))
                if ref_audio_path:
                    p = Path(ref_audio_path)
                    fh = open(p, "rb")
                    opened_files.append(fh)
                    files_list.append(("ref_audio", (p.name, fh, "audio/mpeg")))

                try:
                    resp = await client.post(
                        f"{self.base_url}/release_task",
                        files=files_list,
                        data=data,
                        headers=self._headers(),
                    )
                finally:
                    for fh in opened_files:
                        fh.close()
            else:
                # JSON body for standard generation
                resp = await client.post(
                    f"{self.base_url}/release_task",
                    json=params,
                    headers=self._headers(),
                )

            resp.raise_for_status()
            body = resp.json()
            data_resp = body.get("data", body)
            task_id = data_resp.get("task_id")
            if not task_id:
                raise ValueError(f"No task_id in response: {body}")
            log.info(
                "Submitted ACE-Step task %s (queue_position=%s)",
                task_id,
                data_resp.get("queue_position"),
            )
            return task_id

    async def poll_result(
        self,
        task_id: str,
        timeout: float = 600,
        interval: float = 3.0,
    ) -> dict:
        """Poll /query_result until the task completes or fails.

        Returns the parsed result dict for the first (and usually only) item.
        """
        elapsed = 0.0
        async with httpx.AsyncClient(timeout=30) as client:
            while elapsed < timeout:
                resp = await client.post(
                    f"{self.base_url}/query_result",
                    json={"task_id_list": [task_id]},
                    headers=self._headers(),
                )
                resp.raise_for_status()
                body = resp.json()
                items = body.get("data", [])
                if not items:
                    await asyncio.sleep(interval)
                    elapsed += interval
                    continue

                item = items[0]
                status = item.get("status", 0)
                progress = item.get("progress_text", "")
                if progress:
                    log.info("ACE-Step %s progress: %s", task_id, progress)

                if status == 1:  # succeeded
                    result_raw = item.get("result", "[]")
                    if isinstance(result_raw, str):
                        result_list = json.loads(result_raw)
                    else:
                        result_list = result_raw
                    if not result_list:
                        raise ValueError("ACE-Step returned empty result")
                    return result_list[0]

                if status == 2:  # failed
                    result_raw = item.get("result", "[]")
                    error_msg = "Unknown error"
                    try:
                        parsed = (
                            json.loads(result_raw)
                            if isinstance(result_raw, str)
                            else result_raw
                        )
                        if (
                            parsed
                            and isinstance(parsed, list)
                            and parsed[0].get("error")
                        ):
                            error_msg = parsed[0]["error"]
                    except Exception:
                        error_msg = str(result_raw)
                    raise RuntimeError(f"ACE-Step generation failed: {error_msg}")

                # status 0 → still running
                await asyncio.sleep(interval)
                elapsed += interval

        raise TimeoutError(f"ACE-Step task {task_id} timed out after {timeout}s")

    # ── 12. Download Audio ──────────────────────────────

    async def download_audio(self, audio_url_path: str) -> bytes:
        """Download an audio file from the ACE-Step /v1/audio endpoint.

        audio_url_path: relative path like "/v1/audio?path=..."
        """
        url = f"{self.base_url}{audio_url_path}"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.content

    # ── High-Level Flows ────────────────────────────────

    async def generate_music(self, params: dict) -> dict:
        """Full generation flow: submit → poll → download audio.

        Returns dict with keys:
            audio_bytes: bytes of the generated audio file
            audio_format: str (e.g. "mp3")
            descriptions: dict with prompt, lyrics, metas, generation_info
        """
        task_id = await self.submit_task(params)
        result = await self.poll_result(task_id)

        # Download audio
        audio_url = result.get("file", "")
        audio_bytes = b""
        if audio_url:
            try:
                audio_bytes = await self.download_audio(audio_url)
                log.info("Downloaded %d bytes of audio", len(audio_bytes))
            except Exception as e:
                log.error("Failed to download audio from %s: %s", audio_url, e)

        # Extract descriptions (the LM's low-level instructions)
        metas = result.get("metas", {})
        descriptions = {
            "prompt": result.get("prompt", ""),
            "lyrics": result.get("lyrics", ""),
            "bpm": metas.get("bpm"),
            "keyscale": metas.get("keyscale", ""),
            "timesignature": metas.get("timesignature", ""),
            "duration": metas.get("duration"),
            "genres": metas.get("genres", ""),
            "generation_info": result.get("generation_info", ""),
            "seed": result.get("seed_value", ""),
            "dit_model": result.get("dit_model", ""),
        }

        audio_format = params.get("audio_format", "mp3")

        return {
            "audio_bytes": audio_bytes,
            "audio_format": audio_format,
            "descriptions": descriptions,
        }

    async def generate_from_description(
        self,
        description: str,
        audio_duration: float = 30,
        thinking: bool = True,
        batch_size: int = 1,
        audio_format: str = "mp3",
    ) -> dict:
        """Description-driven generation (demo section 7).

        Lets ACE-Step's LM auto-generate caption, lyrics, and metadata
        from a plain text description, then generates audio.
        """
        params = {
            "sample_query": description,
            "thinking": thinking,
            "audio_duration": min(audio_duration, 120),
            "batch_size": batch_size,
            "audio_format": audio_format,
        }
        return await self.generate_music(params)

    async def generate_from_prompt(
        self,
        prompt: str,
        lyrics: str = "",
        audio_duration: float = 30,
        inference_steps: int = 8,
        batch_size: int = 1,
        audio_format: str = "mp3",
    ) -> dict:
        """Basic prompt+lyrics generation (demo section 6)."""
        params = {
            "prompt": prompt,
            "lyrics": lyrics,
            "audio_duration": min(audio_duration, 120),
            "inference_steps": inference_steps,
            "batch_size": batch_size,
            "audio_format": audio_format,
        }
        return await self.generate_music(params)

    async def repaint(
        self,
        src_audio_path: str | Path,
        prompt: str,
        repainting_start: float = 0.0,
        repainting_end: float = 15.0,
        inference_steps: int = 8,
        batch_size: int = 1,
        audio_format: str = "mp3",
    ) -> dict:
        """Repaint/remix a section of existing audio (demo section 8).

        Uploads the source audio and replaces a time range with new style.
        """
        params = {
            "prompt": prompt,
            "task_type": "repaint",
            "repainting_start": repainting_start,
            "repainting_end": repainting_end,
            "inference_steps": inference_steps,
            "batch_size": batch_size,
            "audio_format": audio_format,
            "_src_audio_path": str(src_audio_path),  # handled by submit_task
        }
        return await self.generate_music(params)

    async def style_transfer(
        self,
        ref_audio_path: str | Path,
        prompt: str,
        lyrics: str = "",
        audio_cover_strength: float = 0.2,
        audio_duration: float = 30,
        inference_steps: int = 8,
        batch_size: int = 1,
        audio_format: str = "mp3",
    ) -> dict:
        """Style transfer using a reference audio (demo section 9).

        Uses one audio file as style reference to influence generation.
        Lower audio_cover_strength = more subtle transfer.
        """
        params = {
            "prompt": prompt,
            "lyrics": lyrics,
            "audio_cover_strength": audio_cover_strength,
            "audio_duration": min(audio_duration, 120),
            "inference_steps": inference_steps,
            "batch_size": batch_size,
            "audio_format": audio_format,
            "_ref_audio_path": str(ref_audio_path),  # handled by submit_task
        }
        return await self.generate_music(params)

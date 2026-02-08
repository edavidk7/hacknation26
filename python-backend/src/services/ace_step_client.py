"""HTTP client for the ACE-Step music generation REST API."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

import httpx

log = logging.getLogger(__name__)

DEFAULT_ACESTEP_URL = "http://localhost:8001"


def vibe_tree_to_ace_step_params(
    vibe_tree: dict,
    reference_audio_path: str | None = None,
) -> dict:
    """Convert a VibeTree JSON dict into ACE-Step /release_task parameters.

    Mirrors the frontend ``flattenTree()`` logic in ui/src/utils/flatten.ts.
    """
    root = vibe_tree.get("root", vibe_tree)
    sections = root.get("sections", [])
    global_cfg = root.get("global", {})

    # ── Tags → prompt (caption) ────────────────────────
    tags: list[str] = list(global_cfg.get("tags", []))
    for sec in sections:
        b = sec.get("branches", {})
        genre = b.get("genre", {})
        if genre.get("primary"):
            tags.append(genre["primary"])
        tags.extend(genre.get("influences", []))
        mood = b.get("mood", {})
        if mood.get("primary"):
            tags.append(mood["primary"])
        for inst in b.get("instruments", []):
            if inst.get("name"):
                tags.append(inst["name"])
    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_tags: list[str] = []
    for t in tags:
        if t and t not in seen:
            seen.add(t)
            unique_tags.append(t)
    prompt = ", ".join(unique_tags)

    # ── Lyrics (structural markers + sonic details) ────
    lyrics_lines: list[str] = []
    for sec in sections:
        name = sec.get("name", "section")
        section_label = name[0].upper() + name[1:] if name else "Section"
        lyrics_lines.append(f"[{section_label}]")

        b = sec.get("branches", {})
        details: list[str] = []
        for inst in b.get("instruments", []):
            character = inst.get("character", "")
            inst_name = inst.get("name", "")
            if character and inst_name:
                details.append(f"{character} {inst_name}")
            elif inst_name:
                details.append(inst_name)
        details.extend(b.get("sonic_details", []))
        nuances = b.get("mood", {}).get("nuances", [])
        if nuances:
            details.append(", ".join(nuances))

        if details:
            lyrics_lines.append(f"({', '.join(details)})")
        lyrics_lines.append("")
    lyrics = "\n".join(lyrics_lines).strip()

    # ── Metadata (first non-null across sections) ──────
    bpm: int | None = None
    key_scale: str = ""
    time_signature: str = ""

    for sec in sections:
        m = sec.get("branches", {}).get("metadata", {})
        if bpm is None and m.get("suggested_bpm") is not None:
            bpm = int(m["suggested_bpm"])
        if not key_scale and m.get("key"):
            key_scale = m["key"]
        if not time_signature and m.get("time_signature"):
            # ACE-Step expects just the numerator: "4/4" → "4"
            raw = m["time_signature"]
            time_signature = raw.split("/")[0] if "/" in raw else raw

    duration = global_cfg.get("duration_seconds")

    params: dict[str, Any] = {
        "prompt": prompt,
        "lyrics": lyrics,
        "thinking": True,
        "task_type": "text2music",
        "inference_steps": 8,
        "audio_format": "mp3",
    }

    if bpm is not None:
        params["bpm"] = bpm
    if key_scale:
        params["key_scale"] = key_scale
    if time_signature:
        params["time_signature"] = time_signature
    if duration is not None:
        params["audio_duration"] = float(duration)
    if reference_audio_path:
        params["reference_audio_path"] = reference_audio_path

    return params


class AceStepClient:
    """Async client for the ACE-Step REST API."""

    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self.base_url = (
            base_url
            or os.environ.get("ACESTEP_API_URL")
            or DEFAULT_ACESTEP_URL
        )
        self.api_key = api_key or os.environ.get("ACESTEP_API_KEY")

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def submit_task(self, params: dict) -> str:
        """Submit a music generation task. Returns the task_id."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/release_task",
                json=params,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json().get("data", resp.json())
            task_id = data.get("task_id")
            if not task_id:
                raise ValueError(f"No task_id in response: {resp.json()}")
            log.info("Submitted ACE-Step task %s", task_id)
            return task_id

    async def poll_result(
        self,
        task_id: str,
        timeout: float = 600,
        interval: float = 2.0,
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
                items = resp.json().get("data", [])
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
                        parsed = json.loads(result_raw) if isinstance(result_raw, str) else result_raw
                        if parsed and isinstance(parsed, list) and parsed[0].get("error"):
                            error_msg = parsed[0]["error"]
                    except Exception:
                        error_msg = str(result_raw)
                    raise RuntimeError(f"ACE-Step generation failed: {error_msg}")

                # status 0 → still running
                await asyncio.sleep(interval)
                elapsed += interval

        raise TimeoutError(f"ACE-Step task {task_id} timed out after {timeout}s")

    async def download_audio(self, audio_url_path: str) -> bytes:
        """Download an audio file from the ACE-Step /v1/audio endpoint."""
        # audio_url_path is like "/v1/audio?path=..."
        url = f"{self.base_url}{audio_url_path}"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.content

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
        }

        audio_format = params.get("audio_format", "mp3")

        return {
            "audio_bytes": audio_bytes,
            "audio_format": audio_format,
            "descriptions": descriptions,
        }

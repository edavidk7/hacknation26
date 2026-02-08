"""HTTP client for the ACE-Step music generation REST API."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

import httpx

from src.models.song_tree import SongCharacteristics, SongNode

log = logging.getLogger(__name__)

DEFAULT_ACESTEP_URL = "http://localhost:8001"


def song_characteristics_to_ace_step_params(
    song_chars: SongCharacteristics | dict,
    reference_audio_path: str | None = None,
) -> dict:
    """Convert a SongCharacteristics tree into ACE-Step /release_task parameters.
    
    This function extracts information from the hierarchical SongNode tree
    and transforms it into a prompt, lyrics, and metadata for ACE-Step.
    
    Args:
        song_chars: Either a SongCharacteristics object or its dict representation
        reference_audio_path: Optional path to reference audio
    
    Returns:
        Dictionary of ACE-Step parameters
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
        log.error(f"Could not find root in tree_dict. Keys: {list(tree_dict.keys())}")
        root = {}
    
    # Helper: flatten all leaf values and names from the tree
    def collect_all_text_values(node: dict | None, max_depth: int = 10) -> list[str]:
        """Recursively collect all meaningful text from a SongNode tree."""
        if node is None:
            return []
        
        values = []
        
        # Collect from this node
        if isinstance(node.get("value"), list):
            values.extend(str(v) for v in node["value"] if v)
        elif isinstance(node.get("value"), str) and node.get("value"):
            values.append(node["value"])
        
        # Collect from metadata
        metadata = node.get("metadata", {})
        if isinstance(metadata, dict):
            for v in metadata.values():
                if isinstance(v, (str, int, float)) and v:
                    values.append(str(v))
                elif isinstance(v, list):
                    values.extend(str(x) for x in v if x)
        
        # Recurse to children
        if max_depth > 0:
            for child in node.get("children", []):
                values.extend(collect_all_text_values(child, max_depth - 1))
        
        return values
    
    # Helper: extract emotional/mood info
    def extract_emotions(node: dict | None) -> list[str]:
        """Extract emotion keywords from Emotional Landscape branches."""
        emotions = []
        if node is None:
            return emotions
        
        if node.get("name") in ("Primary Emotions", "Emotional Landscape"):
            values = collect_all_text_values(node, max_depth=2)
            emotions.extend(values)
        
        for child in node.get("children", []):
            emotions.extend(extract_emotions(child))
        
        return emotions
    
    # Helper: extract instrument names
    def extract_instruments(node: dict | None) -> list[str]:
        """Extract instrument names from Instrumentation branches."""
        instruments = []
        if node is None:
            return instruments
        
        if node.get("name") == "Instrumentation":
            for child in node.get("children", []):
                inst_name = child.get("name")
                if inst_name and inst_name not in ("Instrumentation",):
                    instruments.append(inst_name)
        
        for child in node.get("children", []):
            instruments.extend(extract_instruments(child))
        
        return instruments
    
    # Helper: extract metadata (BPM, key, time signature)
    def extract_metadata(node: dict | None) -> dict:
        """Extract tempo, key, time signature from Temporal Dynamics."""
        meta = {}
        if node is None:
            return meta
        
        if node.get("name") == "Temporal Dynamics":
            for child in node.get("children", []):
                node_meta = child.get("metadata", {})
                if child.get("name") == "Tempo":
                    if "suggested_bpm" in node_meta:
                        meta["bpm"] = int(node_meta["suggested_bpm"])
                elif child.get("name") == "Meter":
                    if "time_signature" in node_meta:
                        ts = node_meta["time_signature"]
                        meta["time_signature"] = ts.split("/")[0] if "/" in ts else ts
        
        if node.get("name") == "Harmonic Language":
            for child in node.get("children", []):
                if child.get("name") == "Key Center" and child.get("value"):
                    meta["key"] = child.get("value")
        
        for child in node.get("children", []):
            child_meta = extract_metadata(child)
            meta.update(child_meta)
        
        return meta
    
    # Extract components
    all_text = collect_all_text_values(root)
    emotions = extract_emotions(root)
    instruments = extract_instruments(root)
    metadata = extract_metadata(root)
    
    # Build prompt from tags and key concepts
    prompt_parts = []
    if root.get("metadata", {}).get("tags"):
        prompt_parts.extend(root["metadata"]["tags"])
    prompt_parts.extend(emotions[:5])  # Top emotions
    prompt_parts.extend(instruments)
    
    # Deduplicate while preserving order
    seen = set()
    unique_prompt = []
    for part in prompt_parts:
        part_str = str(part).lower().strip()
        if part_str and part_str not in seen:
            seen.add(part_str)
            unique_prompt.append(str(part))
    
    prompt = ", ".join(unique_prompt) if unique_prompt else "music composition"
    
    # Build lyrics from emotional arc and structure
    lyrics_lines = []
    
    # Add narrative arc sections
    def collect_narrative(node: dict | None) -> list[str]:
        """Collect narrative turning points."""
        points = []
        if node is None:
            return points
        
        if node.get("name") == "Narrative Arc":
            for child in node.get("children", []):
                if child.get("name") == "Turning Points":
                    for tp in child.get("children", []):
                        tp_name = tp.get("name", "")
                        tp_value = tp.get("value", "")
                        if tp_name and tp_value:
                            points.append(f"[{tp_name}] {tp_value}")
        
        for child in node.get("children", []):
            points.extend(collect_narrative(child))
        
        return points
    
    narrative_points = collect_narrative(root)
    if narrative_points:
        lyrics_lines.extend(narrative_points)
    
    # Add emotional arc details
    def collect_emotional_arc(node: dict | None) -> list[str]:
        """Collect emotional arc transitions."""
        arc = []
        if node is None:
            return arc
        
        if node.get("name") == "Emotional Arc":
            metadata = node.get("metadata", {})
            for phase in ("intro", "peak", "resolution"):
                if phase in metadata:
                    arc.append(f"[{phase.title()}] {metadata[phase]}")
        
        for child in node.get("children", []):
            arc.extend(collect_emotional_arc(child))
        
        return arc
    
    emotional_arc = collect_emotional_arc(root)
    if emotional_arc:
        lyrics_lines.extend(emotional_arc)
    
    # Add instrumentation details
    lyrics_lines.append("[Instrumentation]")
    for inst in instruments:
        lyrics_lines.append(f"  - {inst}")
    
    lyrics = "\n".join(lyrics_lines).strip() if lyrics_lines else "instrumental music composition"
    
    # Build ACE-Step params
    params: dict[str, Any] = {
        "prompt": prompt,
        "lyrics": lyrics,
        "thinking": True,
        "task_type": "text2music",
        "inference_steps": 8,
        "audio_format": "mp3",
    }
    
    # Add optional metadata
    if metadata.get("bpm"):
        params["bpm"] = metadata["bpm"]
    if metadata.get("key"):
        params["key_scale"] = metadata["key"]
    if metadata.get("time_signature"):
        params["time_signature"] = metadata["time_signature"]
    
    # Add duration if available
    if root.get("metadata", {}).get("duration_seconds"):
        params["audio_duration"] = float(root["metadata"]["duration_seconds"])
    
    if reference_audio_path:
        params["reference_audio_path"] = reference_audio_path
    
    log.info(f"Converted SongCharacteristics to ACE-Step params: prompt='{prompt[:80]}...'")
    
    return params


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

from __future__ import annotations

from typing import Protocol, runtime_checkable

from src.models.music_prompt import MusicPrompt


@runtime_checkable
class MusicService(Protocol):
    """Interface for music generation backends.

    Implement this protocol with your own service. The only requirement
    is an async `generate` method that takes a MusicPrompt and returns audio bytes.
    """

    async def generate(self, prompt: MusicPrompt) -> bytes: ...


class StubMusicService:
    """Placeholder that prints the prompt instead of generating audio."""

    async def generate(self, prompt: MusicPrompt) -> bytes:
        print(f"[StubMusicService] Would generate: {prompt.text_prompt}")
        return b""

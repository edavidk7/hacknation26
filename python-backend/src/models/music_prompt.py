from pydantic import BaseModel, Field


class MusicPrompt(BaseModel):
    """Structured music generation parameters derived from a memory/moment."""

    title: str = Field(description="Evocative title for the piece")
    mood: list[str] = Field(
        description="Primary moods/emotions, e.g. ['nostalgic', 'hopeful', 'bittersweet']"
    )
    genre: str = Field(description="Musical genre or style, e.g. 'ambient electronic'")
    tempo_bpm: int = Field(ge=40, le=220, description="Tempo in BPM")
    energy_curve: list[float] = Field(
        description="Energy trajectory over time, each value 0.0-1.0, e.g. [0.3, 0.6, 0.9, 0.5]"
    )
    instruments: list[str] = Field(
        description="Key instruments or sound sources, e.g. ['piano', 'strings', 'soft synth pad']"
    )
    narrative: str = Field(
        description="Brief narrative arc the music should follow, describing the emotional journey"
    )
    text_prompt: str = Field(
        description=(
            "Natural language prompt for the music generation model, "
            "combining all the above into a cohesive generation instruction"
        )
    )

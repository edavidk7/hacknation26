from pydantic import BaseModel, ConfigDict, Field


class Tempo(BaseModel):
    """Tempo specification."""
    value: int = Field(ge=40, le=220, description="Tempo in BPM")
    unit: str = Field(default="bpm", description="Unit of measurement")


class Instrument(BaseModel):
    """Individual instrument specification."""
    name: str = Field(description="Instrument name, e.g. 'piano', 'strings'")
    role: str = Field(description="Role in composition, e.g. 'primary', 'supporting', 'ambient'")
    characteristics: list[str] = Field(description="List of tonal/playing characteristics")


class StructureSection(BaseModel):
    """Musical section (intro, verse, chorus, etc)."""
    duration: str = Field(description="Duration, e.g. '8 bars', '16 beats'")
    energy: float = Field(ge=0.0, le=1.0, description="Energy level from 0.0 (quiet) to 1.0 (intense)")
    description: str = Field(description="What happens in this section")


class Composition(BaseModel):
    """Structural and instrumental composition details."""
    tempo: Tempo
    instruments: list[Instrument]
    structure: dict[str, StructureSection | list[StructureSection]] = Field(
        description="Song sections keyed by name (intro, verse, chorus, outro, etc)"
    )


class NarrativeArcPoint(BaseModel):
    """Emotional journey point in the song."""
    section: str = Field(description="Section name (intro, verse, chorus, etc)")
    emotion: str = Field(description="Emotion at this point, e.g. 'longing', 'catharsis'")
    intensity: float = Field(ge=0.0, le=1.0, description="Emotional intensity")


class EmotionalProfile(BaseModel):
    """Emotional and narrative content."""
    moods: list[str] = Field(description="Primary moods/emotions")
    narrative: str = Field(description="Brief narrative arc description")
    narrative_arc: list[NarrativeArcPoint] = Field(description="Emotional journey through the song")


class SongMetadata(BaseModel):
    """Basic song metadata."""
    title: str = Field(description="Song title")
    genre: str = Field(description="Musical genre or style")


class SongCharacteristics(BaseModel):
    """Complete tree-structured song characteristics for frontend editing and markdown conversion."""
    metadata: SongMetadata
    composition: Composition
    emotional: EmotionalProfile
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "metadata": {
                    "title": "A Moment's Echo",
                    "genre": "ambient electronic"
                },
                "composition": {
                    "tempo": {
                        "value": 80,
                        "unit": "bpm"
                    },
                    "instruments": [
                        {
                            "name": "piano",
                            "role": "primary",
                            "characteristics": ["warm", "reverberant"]
                        }
                    ],
                    "structure": {
                        "intro": {
                            "duration": "8 bars",
                            "energy": 0.2,
                            "description": "minimal piano entrance"
                        },
                        "verse": {
                            "duration": "16 bars",
                            "energy": 0.5,
                            "description": "strings fade in"
                        },
                        "chorus": {
                            "duration": "8 bars",
                            "energy": 0.8,
                            "description": "full instrumentation"
                        },
                        "outro": {
                            "duration": "12 bars",
                            "energy": 0.1,
                            "description": "fade to silence"
                        }
                    }
                },
                "emotional": {
                    "moods": ["nostalgic", "hopeful"],
                    "narrative": "A gentle journey through memories",
                    "narrative_arc": [
                        {"section": "intro", "emotion": "longing", "intensity": 0.3},
                        {"section": "chorus", "emotion": "catharsis", "intensity": 0.9}
                    ]
                }
            }
        }
    )

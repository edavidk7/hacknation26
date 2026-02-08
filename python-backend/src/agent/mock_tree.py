"""Mock vibe tree data for development and testing."""

from src.models.song_tree import SongCharacteristics, SongNode


def get_mock_vibe_tree() -> SongCharacteristics:
    """Return a mock vibe tree matching the arbitrary structure expected by the frontend."""
    root = SongNode(
        name="A Moment's Echo",
        value=None,
        children=[
            SongNode(
                name="Emotional Landscape",
                value=None,
                children=[
                    SongNode(
                        name="Primary Emotions",
                        value=["nostalgia", "warmth", "longing"],
                    ),
                    SongNode(
                        name="Emotional Arc",
                        value=None,
                        metadata={
                            "intro": "gentle awakening",
                            "peak": "bittersweet realization",
                            "resolution": "peaceful acceptance",
                        },
                    ),
                    SongNode(
                        name="Color Palette",
                        value=["golden", "amber", "soft white", "dusty rose"],
                    ),
                ],
            ),
            SongNode(
                name="Instrumentation",
                value=None,
                children=[
                    SongNode(
                        name="Piano",
                        value=None,
                        metadata={
                            "characteristics": ["warm", "reverberant", "slightly detuned"],
                            "role": "foundation",
                            "presence": "throughout",
                        },
                    ),
                    SongNode(
                        name="Strings",
                        value=None,
                        metadata={
                            "characteristics": ["sustained", "distant", "mournful"],
                            "role": "emotional underscore",
                        },
                    ),
                    SongNode(
                        name="Ambient Pads",
                        value=None,
                        metadata={
                            "characteristics": ["ethereal", "evolving", "subtle"],
                            "role": "spatial context",
                        },
                    ),
                ],
            ),
            SongNode(
                name="Sonic Production",
                value=None,
                children=[
                    SongNode(
                        name="Aesthetic",
                        value="vintage tape warmth with modern clarity",
                    ),
                    SongNode(
                        name="Spatial Characteristics",
                        value=None,
                        metadata={
                            "reverb": "minimal, room-like",
                            "space": "intimate but open",
                            "width": "natural stereo spread",
                        },
                    ),
                    SongNode(
                        name="Processing",
                        value=["gentle EQ", "subtle compression", "light delay"],
                    ),
                ],
            ),
            SongNode(
                name="Temporal Dynamics",
                value=None,
                children=[
                    SongNode(
                        name="Tempo",
                        value=None,
                        metadata={
                            "suggested_bpm": 80,
                            "range": [75, 90],
                            "feel": "breathing, unhurried",
                        },
                    ),
                    SongNode(
                        name="Meter",
                        value=None,
                        metadata={
                            "time_signature": "4/4",
                            "subdivision": "triplet feel at times",
                            "regularity": "generally steady with slight rubato",
                        },
                    ),
                    SongNode(
                        name="Structure",
                        value=None,
                        metadata={
                            "intro": "8 bars minimal",
                            "verse": "16 bars with building layers",
                            "chorus": "12 bars expansive",
                            "bridge": "8 bars intimate",
                            "outro": "12 bars fade",
                        },
                    ),
                ],
            ),
            SongNode(
                name="Harmonic Language",
                value=None,
                children=[
                    SongNode(
                        name="Key Center",
                        value="D major with frequent minor iv coloring",
                    ),
                    SongNode(
                        name="Progressions",
                        value=[
                            "I - vi - IV - V (cinematic)",
                            "i - VII - VI - VII (dark reflection)",
                            "I - IV - I - V/ii (questioning)",
                        ],
                    ),
                    SongNode(
                        name="Tension Points",
                        value=["sus chords", "unresolved sevenths", "parallel motion"],
                    ),
                ],
            ),
            SongNode(
                name="Narrative Arc",
                value=None,
                children=[
                    SongNode(
                        name="Story",
                        value="A solitary figure stumbling upon an old memory, examining it from different angles",
                    ),
                    SongNode(
                        name="Thematic Elements",
                        value=["memory", "passage of time", "bittersweet acceptance"],
                    ),
                    SongNode(
                        name="Turning Points",
                        value=None,
                        children=[
                            SongNode(
                                name="Discovery (Intro)",
                                value="from stillness to awareness",
                            ),
                            SongNode(
                                name="Immersion (Chorus)",
                                value="from curiosity to deep feeling",
                            ),
                            SongNode(
                                name="Acceptance (Bridge)",
                                value="from nostalgia to acceptance",
                            ),
                        ],
                    ),
                ],
            ),
        ],
        metadata={
            "overall_arc": "gentle exploration of memory moving from discovery through immersion to peaceful acceptance",
            "duration_seconds": 240,
            "tags": ["nostalgic", "piano-driven", "ambient", "introspective", "lo-fi"],
        },
    )

    return SongCharacteristics(root=root)

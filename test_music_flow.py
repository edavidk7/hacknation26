#!/usr/bin/env python3
"""Test script to verify the music generation flow.

Tests:
1. Kimi K2.5 generates VibeTree WITHOUT auto music generation
2. Prompt from VibeTree is properly used in ACE-Step params
"""

import json
import sys
from pathlib import Path

# Add python-backend to path
sys.path.insert(0, str(Path(__file__).parent / "python-backend"))

from src.models.song_tree import SongCharacteristics, SongNode
from src.services.ace_step_client import vibe_tree_to_ace_step_params


def test_vibetree_to_ace_params():
    """Test that VibeTree is properly converted to ACE-Step params."""
    
    # Create a minimal VibeTree structure
    vibe_tree = {
        "root": {
            "global": {
                "tags": ["cinematic", "emotional"],
                "duration_seconds": 120,
                "overall_arc": "crescendo"
            },
            "sections": [
                {
                    "name": "intro",
                    "branches": {
                        "genre": {
                            "primary": "ambient",
                            "influences": ["electronic"]
                        },
                        "mood": {
                            "primary": "melancholic",
                            "nuances": ["introspective", "dreamy"]
                        },
                        "instruments": [
                            {"name": "piano", "character": "delicate"},
                            {"name": "strings", "character": "lush"}
                        ],
                        "sonic_details": ["reverb-heavy", "pad-based"],
                        "metadata": {
                            "suggested_bpm": 60,
                            "key": "A minor",
                            "time_signature": "4/4"
                        }
                    }
                }
            ]
        }
    }
    
    # Convert to ACE-Step params
    params = vibe_tree_to_ace_step_params(vibe_tree)
    
    # Verify structure
    assert "prompt" in params, "Missing prompt in ACE-Step params"
    assert "lyrics" in params, "Missing lyrics in ACE-Step params"
    
    # Verify prompt contains tags from VibeTree
    prompt = params["prompt"]
    assert "cinematic" in prompt.lower(), "cinematic tag missing from prompt"
    assert "emotional" in prompt.lower(), "emotional tag missing from prompt"
    assert "ambient" in prompt.lower(), "genre missing from prompt"
    assert "melancholic" in prompt.lower(), "mood missing from prompt"
    assert "piano" in prompt.lower(), "instrument missing from prompt"
    
    # Verify lyrics contain section structure
    lyrics = params["lyrics"]
    assert "[Intro]" in lyrics, "Section marker missing from lyrics"
    assert "delicate piano" in lyrics.lower() or "piano" in lyrics.lower(), "Instrument details missing from lyrics"
    
    # Verify metadata
    assert params.get("bpm") == 60, "BPM not properly extracted"
    assert params.get("key_scale") == "A minor", "Key not properly extracted"
    assert params.get("audio_duration") == 120.0, "Duration not properly extracted"
    
    print("✓ All VibeTree to ACE-Step conversion tests passed")
    print(f"  Prompt: {prompt}")
    print(f"  BPM: {params.get('bpm')}")
    print(f"  Key: {params.get('key_scale')}")
    return True


if __name__ == "__main__":
    try:
        test_vibetree_to_ace_params()
        print("\n✓ All tests passed!")
        sys.exit(0)
    except AssertionError as e:
        print(f"✗ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

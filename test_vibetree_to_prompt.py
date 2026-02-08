#!/usr/bin/env python3
"""
Test script to generate a music prompt from a vibetree structure using Claude.
This demonstrates the JSON-to-LLM workflow for creating music generation prompts.
"""

import json
import os
import sys
from pathlib import Path

# Example vibetree structure
EXAMPLE_VIBETREE = {
    "root": {
        "concept": "Urban Midnight Drive",
        "image_interpretation": "Neon-lit city streets at 3am, rain-slicked asphalt, solitary driver",
        "sections": [
            {
                "name": "intro",
                "weight": 0.15,
                "branches": {
                    "mood": {
                        "primary": "contemplative",
                        "secondary": "melancholic"
                    },
                    "genre": {
                        "primary": "synthwave",
                        "secondary": "lo-fi hip hop"
                    },
                    "instruments": [
                        {"name": "ambient synth pad", "role": "atmosphere"},
                        {"name": "vinyl crackle", "role": "texture"}
                    ],
                    "tempo_bpm": 85,
                    "sonic_characteristics": ["reverb-heavy", "breathy", "sparse"]
                }
            },
            {
                "name": "build",
                "weight": 0.35,
                "branches": {
                    "mood": {
                        "primary": "introspective",
                        "secondary": "driving"
                    },
                    "genre": {
                        "primary": "synthwave",
                        "secondary": "darkwave"
                    },
                    "instruments": [
                        {"name": "analog synthesizer", "role": "lead"},
                        {"name": "drum machine", "role": "rhythm"},
                        {"name": "bass synth", "role": "foundation"}
                    ],
                    "tempo_bpm": 95,
                    "texture": ["layered", "gated", "pulsing"],
                    "dynamics": "gradually intensifying"
                }
            },
            {
                "name": "peak",
                "weight": 0.35,
                "branches": {
                    "mood": {
                        "primary": "energetic",
                        "secondary": "hypnotic"
                    },
                    "genre": {
                        "primary": "synthwave",
                        "secondary": "electronic"
                    },
                    "instruments": [
                        {"name": "arpeggiated lead synth", "role": "main"},
                        {"name": "4-on-floor kick", "role": "groove"},
                        {"name": "filtered bassline", "role": "depth"}
                    ],
                    "tempo_bpm": 105,
                    "effects": ["chorus", "reverb", "compression"],
                    "energy": "maximum"
                }
            },
            {
                "name": "outro",
                "weight": 0.15,
                "branches": {
                    "mood": {
                        "primary": "wistful",
                        "secondary": "fading"
                    },
                    "genre": {
                        "primary": "synthwave",
                        "secondary": "ambient"
                    },
                    "instruments": [
                        {"name": "reverb tail decay", "role": "texture"},
                        {"name": "ambient pad", "role": "fade"}
                    ],
                    "tempo_bpm": 75,
                    "characteristics": ["minimal", "echo-laden", "sparse"]
                }
            }
        ],
        "global": {
            "overall_arc": "A solitary drive through the neon-lit city, building from contemplation to intensity, then fading into nocturnal haze",
            "duration_seconds": 240,
            "tags": ["synthwave", "cinematic", "nocturnal", "atmospheric", "introspective"]
        }
    }
}


def vibetree_to_json(vibetree: dict) -> dict:
    """Convert vibetree to JSON structure for LLM processing."""
    root = vibetree["root"]
    return {
        "concept": root["concept"],
        "image_interpretation": root.get("image_interpretation"),
        "overall_arc": root["global"].get("overall_arc"),
        "duration_seconds": root["global"].get("duration_seconds"),
        "tags": root["global"].get("tags", []),
        "sections": [
            {
                "name": section["name"],
                "weight": section["weight"],
                "branches": section["branches"],
            }
            for section in root["sections"]
        ],
    }


def generate_music_prompt_from_vibetree(vibetree_json: dict, api_key: str) -> str:
    """
    Send vibetree JSON to Claude for LLM-based prompt refinement.
    Returns a high-quality music generation prompt.
    """
    import httpx

    system_prompt = """You are a music production expert specializing in creating detailed, 
evocative prompts for music generation models. You will receive a structured "vibe tree" 
that describes a musical concept with sections, moods, genres, instruments, and other attributes.

Your task is to synthesize this structured data into a single, cohesive music generation prompt 
that:
1. Captures the essence of the concept
2. Incorporates the arc/progression described
3. Highlights key moods, genres, and instruments from each section
4. Maintains consistency across the piece
5. Is poetic and inspiring while remaining technically descriptive

Return ONLY the final prompt text, no explanations or metadata."""

    user_message = f"""Create a music generation prompt from this vibe tree structure:

{json.dumps(vibetree_json, indent=2)}"""

    client = httpx.Client()

    try:
        response = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-3-5-sonnet-20241022",
                "max_tokens": 1024,
                "system": system_prompt,
                "messages": [
                    {
                        "role": "user",
                        "content": user_message,
                    }
                ],
            },
        )

        if response.status_code != 200:
            raise Exception(f"Claude API error: {response.status_code} {response.text}")

        data = response.json()
        text_content = next(
            (c["text"] for c in data["content"] if c["type"] == "text"), None
        )

        if not text_content:
            raise Exception("No text content in Claude response")

        return text_content.strip()

    finally:
        client.close()


def main():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)

    print("=" * 80)
    print("VIBETREE TO MUSIC PROMPT TEST")
    print("=" * 80)

    # Step 1: Show the vibetree structure
    print("\n1. VIBETREE STRUCTURE:")
    print("-" * 80)
    print(json.dumps(EXAMPLE_VIBETREE, indent=2))

    # Step 2: Convert to JSON
    print("\n2. CONVERTED TO JSON (what goes to Claude):")
    print("-" * 80)
    vibe_json = vibetree_to_json(EXAMPLE_VIBETREE)
    print(json.dumps(vibe_json, indent=2))

    # Step 3: Generate prompt with Claude
    print("\n3. CLAUDE-GENERATED MUSIC PROMPT:")
    print("-" * 80)
    try:
        prompt = generate_music_prompt_from_vibetree(vibe_json, api_key)
        print(prompt)
        print("\n" + "=" * 80)
        print("✓ Prompt generation successful!")
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

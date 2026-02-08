"""
Test script to generate a music prompt from a vibetree structure using Kimi K2.5 via OpenRouter.
"""

import json
import os
from openai import OpenAI

# OpenRouter config
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
KIMI_MODEL = "moonshotai/kimi-k2.5"

# Example vibetree structure
EXAMPLE_VIBETREE = {
    "concept": "Urban Midnight Drive",
    "image_interpretation": "Neon-lit city streets at 3am, rain-slicked asphalt, solitary driver",
    "overall_arc": "A solitary drive through the neon-lit city, building from contemplation to intensity, then fading into nocturnal haze",
    "duration_seconds": 240,
    "tags": ["synthwave", "cinematic", "nocturnal", "atmospheric", "introspective"],
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
    ]
}


def generate_music_prompt_from_vibetree(vibetree_json: dict) -> str:
    """
    Send vibetree JSON to Kimi K2.5 via OpenRouter for LLM-based prompt refinement.
    Returns a high-quality music generation prompt.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY not set")
    
    client = OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
    )

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

    response = client.chat.completions.create(
        model=KIMI_MODEL,
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_message,
            }
        ],
        temperature=0.6,
    )

    return response.choices[0].message.content.strip()


def main():
    print("=" * 80)
    print("VIBETREE TO MUSIC PROMPT TEST (using Kimi K2.5)")
    print("=" * 80)

    # Step 1: Show the vibetree structure
    print("\n1. VIBETREE STRUCTURE:")
    print("-" * 80)
    print(json.dumps(EXAMPLE_VIBETREE, indent=2))

    # Step 2: Generate prompt with Kimi K2.5
    print("\n2. KIMI K2.5-GENERATED MUSIC PROMPT:")
    print("-" * 80)
    try:
        prompt = generate_music_prompt_from_vibetree(EXAMPLE_VIBETREE)
        print(prompt)
        print("\n" + "=" * 80)
        print("✓ Prompt generation successful!")
    except Exception as e:
        print(f"✗ Error: {e}")
        raise


if __name__ == "__main__":
    main()

# Vibe Tree Specification

## Overview

The vibe tree is a hierarchical decomposition of a multimodal input (text prompt + optional image) into a structured representation that ultimately gets flattened into an ACE-Step music generation prompt. It is the core novel component of this project.

## Architecture

```
User Input (text + image)
        │
        ▼
   Kimi K2.5 (multimodal understanding)
        │
        ▼
   Vibe Tree (JSON, hierarchical)
        │
        ▼
   Prompt Assembly (flatten tree → ACE-Step format)
        │
        ▼
   ACE-Step 1.5 (music generation)
        │
        ▼
   [Optional] Audio Understanding → Kimi feedback → refined tree → regenerate
```

## Tree Structure

The tree decomposes top-down: abstract mood → genre/style conventions → concrete sonic details. It also has a temporal dimension — songs are split into sections before branching into sonic attributes.

### Schema (JSON)

```json
{
  "root": {
    "concept": "string — the core idea/mood derived from user input",
    "image_interpretation": "string | null — what Kimi extracted from the image, if provided",
    "sections": [
      {
        "name": "intro | body | outro | bridge | etc.",
        "weight": "float 0-1 — proportion of total duration",
        "branches": {
          "mood": {
            "primary": "string — e.g. 'melancholy', 'euphoric', 'tense'",
            "nuances": ["string — secondary emotional colors"]
          },
          "genre": {
            "primary": "string — e.g. 'ambient', 'lo-fi', 'orchestral'",
            "influences": ["string — secondary genre touches"]
          },
          "instruments": [
            {
              "name": "string — e.g. 'pad synth', 'acoustic guitar'",
              "role": "string — e.g. 'lead', 'texture', 'rhythm', 'bass'",
              "character": "string — e.g. 'warm', 'distant', 'gritty'"
            }
          ],
          "texture": {
            "density": "sparse | moderate | dense",
            "movement": "static | slow-evolving | dynamic",
            "space": "intimate | open | vast"
          },
          "sonic_details": [
            "string — fine-grained sound descriptors, e.g. 'subtle wind whoosh', 'distant thunder rumble', 'vinyl crackle'"
          ],
          "metadata": {
            "tempo_feel": "string — e.g. 'slow and breathing', 'steady pulse'",
            "suggested_bpm": "int | null",
            "key": "string | null — e.g. 'C minor', 'F# major'",
            "time_signature": "string | null — e.g. '4/4', '3/4'"
          }
        }
      }
    ],
    "global": {
      "overall_arc": "string — describes how the piece evolves across sections",
      "tags": ["string — high-level tags for ACE-Step, derived from full tree"],
      "duration_seconds": "int — target total duration"
    }
  }
}
```

### Example

Input: "a photo of a frozen Norwegian fjord at dawn" + text "make it feel lonely but hopeful"

```json
{
  "root": {
    "concept": "solitary beauty of a frozen fjord at first light, loneliness giving way to quiet hope",
    "image_interpretation": "steep snow-covered cliffs, still dark water, pale orange light on horizon, mist",
    "sections": [
      {
        "name": "intro",
        "weight": 0.25,
        "branches": {
          "mood": {
            "primary": "isolation",
            "nuances": ["stillness", "cold", "awe"]
          },
          "genre": {
            "primary": "ambient",
            "influences": ["nordic folk", "drone"]
          },
          "instruments": [
            {"name": "bowed pad", "role": "texture", "character": "glacial, sustained"},
            {"name": "sub bass", "role": "bass", "character": "barely audible, felt more than heard"}
          ],
          "texture": {
            "density": "sparse",
            "movement": "static",
            "space": "vast"
          },
          "sonic_details": [
            "faint wind across ice",
            "distant low drone",
            "silence as an instrument"
          ],
          "metadata": {
            "tempo_feel": "no perceptible pulse",
            "suggested_bpm": null,
            "key": "D minor",
            "time_signature": null
          }
        }
      },
      {
        "name": "body",
        "weight": 0.5,
        "branches": {
          "mood": {
            "primary": "melancholy",
            "nuances": ["longing", "emerging warmth"]
          },
          "genre": {
            "primary": "ambient",
            "influences": ["post-rock", "modern classical"]
          },
          "instruments": [
            {"name": "bowed pad", "role": "texture", "character": "warmer, slowly brightening"},
            {"name": "piano", "role": "lead", "character": "sparse, reverberant, high register"},
            {"name": "field recording", "role": "texture", "character": "ice cracking, water dripping"}
          ],
          "texture": {
            "density": "moderate",
            "movement": "slow-evolving",
            "space": "vast"
          },
          "sonic_details": [
            "piano notes echoing across open space",
            "harmonic shift from minor to ambiguous",
            "gradual introduction of organic textures"
          ],
          "metadata": {
            "tempo_feel": "slow and breathing",
            "suggested_bpm": 60,
            "key": "D minor → D major (gradual)",
            "time_signature": "4/4"
          }
        }
      },
      {
        "name": "outro",
        "weight": 0.25,
        "branches": {
          "mood": {
            "primary": "quiet hope",
            "nuances": ["acceptance", "light"]
          },
          "genre": {
            "primary": "ambient",
            "influences": ["modern classical"]
          },
          "instruments": [
            {"name": "piano", "role": "lead", "character": "gentle, resolving"},
            {"name": "strings", "role": "texture", "character": "distant, warm, sustained"},
            {"name": "choir pad", "role": "texture", "character": "soft, angelic, barely present"}
          ],
          "texture": {
            "density": "moderate",
            "movement": "slow-evolving",
            "space": "open"
          },
          "sonic_details": [
            "strings swelling gently",
            "final piano phrase hanging in reverb",
            "fade to silence with faint wind"
          ],
          "metadata": {
            "tempo_feel": "slow and breathing",
            "suggested_bpm": 60,
            "key": "D major",
            "time_signature": "4/4"
          }
        }
      }
    ],
    "global": {
      "overall_arc": "begins in frozen stillness, slowly thaws into warmth, resolves with quiet acceptance",
      "tags": ["ambient", "nordic", "cinematic", "emotional", "piano", "atmospheric", "slow"],
      "duration_seconds": 180
    }
  }
}
```

## Prompt Assembly

The tree must be flattened into ACE-Step's expected input format. ACE-Step accepts:

- **Tags**: comma-separated genre/style/instrument/mood descriptors
- **Lyrics**: optional, can include structural markers like `[Intro]`, `[Verse]`, `[Chorus]`
- **Metadata**: BPM, key, time signature, duration

### Flattening rules

1. Collect all `tags` from `global.tags`
2. Add all unique instrument names
3. Add primary genre + influences from each section
4. Add primary mood descriptors
5. Resolve cross-section tensions (e.g. if sections disagree on tempo, pick a coherent compromise or use ACE-Step's section-based generation)
6. Use section names as structural markers in the lyrics field even for instrumental music: `[Intro] ... [Body] ... [Outro]`
7. Place sonic_details as descriptive text within each section's lyrics block
8. Set metadata from the most prominent section, or from `global` values

### Example flattened output

```
Tags: ambient, nordic, cinematic, emotional, piano, atmospheric, slow, drone, post-rock, modern classical, bowed pad, strings, choir pad

Lyrics:
[Intro]
(glacial bowed pad, faint wind across ice, distant low drone, vast silence)

[Body]
(sparse reverberant piano, ice cracking, water dripping, harmonic shift from minor toward major, slowly brightening)

[Outro]
(gentle resolving piano, distant warm strings swelling, soft choir pad, fade to silence with faint wind)

BPM: 60
Key: D minor
Time Signature: 4/4
Duration: 180s
```

## Feedback Loop (optional, implement if time permits)

1. After generation, feed the audio back into ACE-Step's audio understanding
2. ACE-Step returns: extracted BPM, key, time signature, and a text caption
3. Send the caption + extracted metadata + original vibe tree to Kimi
4. Kimi compares what was intended vs what was produced
5. Kimi outputs a delta — specific tree nodes to modify
6. Re-run prompt assembly and generation with the updated tree

## UI Requirements

- Text input field for prompt
- Image upload (optional)
- Vibe tree visualization: collapsible tree view rendered from the JSON. Users should be able to click nodes to inspect/edit values before generation.
- Generate button
- Audio player for output
- (Optional) Feedback loop button: "Refine" that triggers the feedback cycle

## Implementation Notes

- Kimi K2.5 handles: image understanding, vibe tree generation, feedback loop reasoning
- ACE-Step 1.5 handles: query rewriting (its built-in LM), music generation, audio understanding
- The vibe tree is a UI/reasoning abstraction — ACE-Step never sees the tree directly, only the flattened prompt
- Use ACE-Step's turbo model for speed during demos
- For the hackathon, generating the full song at once (not per-section) is acceptable. Per-section generation with stitching is a stretch goal.

import type { VibeTree } from "./types";

export const FJORD_EXAMPLE: VibeTree = {
  root: {
    concept:
      "solitary beauty of a frozen fjord at first light, loneliness giving way to quiet hope",
    image_interpretation:
      "steep snow-covered cliffs, still dark water, pale orange light on horizon, mist",
    sections: [
      {
        name: "intro",
        weight: 0.25,
        branches: {
          mood: {
            primary: "isolation",
            nuances: ["stillness", "cold", "awe"],
          },
          genre: {
            primary: "ambient",
            influences: ["nordic folk", "drone"],
          },
          instruments: [
            { name: "bowed pad", role: "texture", character: "glacial, sustained" },
            { name: "sub bass", role: "bass", character: "barely audible, felt more than heard" },
          ],
          texture: { density: "sparse", movement: "static", space: "vast" },
          sonic_details: [
            "faint wind across ice",
            "distant low drone",
            "silence as an instrument",
          ],
          metadata: {
            tempo_feel: "no perceptible pulse",
            suggested_bpm: null,
            key: "D minor",
            time_signature: null,
          },
        },
      },
      {
        name: "body",
        weight: 0.5,
        branches: {
          mood: {
            primary: "melancholy",
            nuances: ["longing", "emerging warmth"],
          },
          genre: {
            primary: "ambient",
            influences: ["post-rock", "modern classical"],
          },
          instruments: [
            { name: "bowed pad", role: "texture", character: "warmer, slowly brightening" },
            { name: "piano", role: "lead", character: "sparse, reverberant, high register" },
            { name: "field recording", role: "texture", character: "ice cracking, water dripping" },
          ],
          texture: { density: "moderate", movement: "slow-evolving", space: "vast" },
          sonic_details: [
            "piano notes echoing across open space",
            "harmonic shift from minor to ambiguous",
            "gradual introduction of organic textures",
          ],
          metadata: {
            tempo_feel: "slow and breathing",
            suggested_bpm: 60,
            key: "D minor to D major (gradual)",
            time_signature: "4/4",
          },
        },
      },
      {
        name: "outro",
        weight: 0.25,
        branches: {
          mood: {
            primary: "quiet hope",
            nuances: ["acceptance", "light"],
          },
          genre: {
            primary: "ambient",
            influences: ["modern classical"],
          },
          instruments: [
            { name: "piano", role: "lead", character: "gentle, resolving" },
            { name: "strings", role: "texture", character: "distant, warm, sustained" },
            { name: "choir pad", role: "texture", character: "soft, angelic, barely present" },
          ],
          texture: { density: "moderate", movement: "slow-evolving", space: "open" },
          sonic_details: [
            "strings swelling gently",
            "final piano phrase hanging in reverb",
            "fade to silence with faint wind",
          ],
          metadata: {
            tempo_feel: "slow and breathing",
            suggested_bpm: 60,
            key: "D major",
            time_signature: "4/4",
          },
        },
      },
    ],
    global: {
      overall_arc:
        "begins in frozen stillness, slowly thaws into warmth, resolves with quiet acceptance",
      tags: ["ambient", "nordic", "cinematic", "emotional", "piano", "atmospheric", "slow"],
      duration_seconds: 180,
    },
  },
};

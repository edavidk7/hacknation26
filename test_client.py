#!/usr/bin/env python3
"""Test the AceStepClient."""

import sys
import asyncio
sys.path.insert(0, "/home/fkmjec/projects/2026_hacknation/code/hacknation26/python-backend")

from src.services.ace_step_client import AceStepClient

async def test_submit():
    """Test submitting a task."""
    client = AceStepClient()
    
    params = {
        "prompt": "upbeat indie pop",
        "lyrics": "A cheerful song",
        "task_type": "text2music",
        "inference_steps": 8,
        "audio_format": "mp3",
    }
    
    try:
        task_id = await client.submit_task(params)
        print(f"✓ Task submitted successfully")
        print(f"  Task ID: {task_id}")
        return task_id
    except Exception as e:
        print(f"✗ Task submission failed: {e}")
        raise

async def main():
    print("Testing AceStepClient...\n")
    try:
        task_id = await test_submit()
        print("\n✓ Client test passed!")
    except Exception as e:
        print(f"\n✗ Client test failed")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())

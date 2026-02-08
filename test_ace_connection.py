#!/usr/bin/env python3
"""Simple test to verify ACE-Step connection."""

import sys
import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "https://abox-noneruptive-felisha.ngrok-free.dev"
AUTH = HTTPBasicAuth("admin", "goldenhands")

def test_health():
    """Test health endpoint."""
    try:
        resp = requests.get(
            f"{BASE_URL}/health",
            headers={"ngrok-skip-browser-warning": "true"},
            auth=AUTH,
            verify=False,
            timeout=10,
        )
        resp.raise_for_status()
        print("✓ Health check passed")
        print(f"  Response: {resp.json()}")
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False

def test_models():
    """Test models endpoint."""
    try:
        resp = requests.get(
            f"{BASE_URL}/v1/models",
            headers={"ngrok-skip-browser-warning": "true"},
            auth=AUTH,
            verify=False,
            timeout=10,
        )
        resp.raise_for_status()
        print("✓ Models endpoint passed")
        return True
    except Exception as e:
        print(f"✗ Models endpoint failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing ACE-Step connection...")
    print(f"URL: {BASE_URL}\n")
    
    health_ok = test_health()
    models_ok = test_models()
    
    if health_ok and models_ok:
        print("\n✓ All tests passed!")
        sys.exit(0)
    else:
        print("\n✗ Some tests failed")
        sys.exit(1)

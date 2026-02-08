"""API server entry point."""

from __future__ import annotations

import logging
import sys

import uvicorn

from src.api.routes import create_app

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stderr,
)


def main() -> None:
    """Run the API server."""
    app = create_app()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )


if __name__ == "__main__":
    main()

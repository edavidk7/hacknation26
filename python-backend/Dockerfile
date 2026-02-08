FROM python:3.12-slim

WORKDIR /app

# Install system deps for opencv-python-headless and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install wheel for faster builds
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy and install dependencies with increased timeout
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=1000 --retries=5 -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

CMD ["python", "api_server.py"]

# API Integration Setup

This document describes how the UI connects to the agentic loop via a REST API.

## Architecture

```
┌─────────────────────────┐
│   UI (React)            │
│  - Upload files         │
│  - Enter prompt         │
│  - Render VibeTree      │
└────────┬────────────────┘
         │ POST /api/generate (FormData)
         │ GET /api/status/:job_id (polling)
         ↓
┌─────────────────────────┐
│   API Server            │
│  (FastAPI + Uvicorn)    │
│  - Handle uploads       │
│  - Queue jobs           │
│  - Return status        │
└────────┬────────────────┘
         │ Async background task
         ↓
┌─────────────────────────┐
│   Agentic Loop          │
│  (music_agent.py)       │
│  - Process multimodal   │
│  - Call LLM             │
│  - Return result        │
└─────────────────────────┘
```

## Quick Start (All-in-One)

From the root directory:

```bash
# Create .env file with your API key
echo 'OPENROUTER_API_KEY=your-openrouter-key' > python-backend/.env

# Start both API and UI
./start_dev.sh
```

This will start:
- API on `http://127.0.0.1:8000` (with docs at `/docs`)
- UI on `http://localhost:5173`

## Manual Start

### Backend API

From the `python-backend/` directory:

```bash
# Install dependencies (first time only)
uv sync

# Set environment variable
export OPENROUTER_API_KEY="your-openrouter-key"

# Start the API server
uv run api_server.py
```

The server will start on `http://127.0.0.1:8000`.

Check health: `curl http://127.0.0.1:8000/api/health`

### UI

From the `ui/` directory:

```bash
# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

The UI will run on `http://localhost:5173` (default Vite port).

## API Endpoints

### POST /api/generate

Generate a vibe tree from multimodal inputs.

**Request:**
- Content-Type: `multipart/form-data`
- Fields:
  - `text` (string, required): Text description/prompt
  - `files` (file[], optional): Images, audio, or video files
  - `model_name` (string, optional): OpenRouter model ID
  - `max_video_frames` (number, optional): Max keyframes from videos (default: 6)
  - `disable_web_search` (boolean, optional): Disable web search (default: false)

**Response:**
```json
{
  "job_id": "uuid-string",
  "status": "processing"
}
```

### GET /api/status/:job_id

Get the status of a generation job.

**Response:**
```json
{
  "job_id": "uuid-string",
  "status": "processing|completed|failed",
  "result": { /* MusicPrompt JSON */ } or null,
  "error": "error message" or null
}
```

**Statuses:**
- `processing`: Still generating
- `completed`: Done, `result` contains the output
- `failed`: Error occurred, `error` contains message

### GET /api/health

Health check.

**Response:**
```json
{
  "status": "ok"
}
```

## How the UI Calls the API

1. **Submit**: User uploads files and enters text, clicks "Generate Vibe Tree"
2. **UI sends POST** to `/api/generate` with FormData
3. **Server returns** `job_id` and starts background task
4. **UI polls** `/api/status/{job_id}` every 1 second
5. **When completed**, UI receives result and renders tree

See `ui/src/App.tsx` `handleGenerate()` for implementation details.

## File Handling

- Uploaded files are saved to `/tmp/hacknation_uploads/{job_id}/`
- After generation completes (or fails), files are automatically cleaned up
- Max file size depends on FastAPI/server config (default ~25MB per file)

## Production Considerations

1. **Job Storage**: Currently uses in-memory dict; switch to Redis/database for persistence
2. **CORS**: Currently allows all origins (`allow_origins=["*"]`); restrict in production
3. **Authentication**: Add bearer token or API key validation
4. **Rate Limiting**: Add rate limiting per IP/user
5. **File Cleanup**: Use scheduled tasks (Celery/APScheduler) for timeout cleanup
6. **Logging**: Configure structured logging for monitoring
7. **Error Tracking**: Integrate Sentry or similar for error monitoring

## Troubleshooting

### "Connection refused" when UI tries to call API

- Check API server is running: `curl http://127.0.0.1:8000/api/health`
- Check CORS: API should respond with `Access-Control-Allow-Origin` header
- Check firewall: Port 8000 should be accessible

### Generation times out

- Check API server logs for errors
- Increase `maxAttempts` in UI `handleGenerate()` if needed
- Check OPENROUTER_API_KEY is set and valid

### Files not being saved

- Check `/tmp/hacknation_uploads/` directory exists and is writable
- Check file sizes (shouldn't exceed 25MB without config)
- Check API server logs for errors

## Next Steps

1. Transform `MusicPrompt` output to `VibeTree` format in the API
2. Add progress tracking (e.g., "extracting frames" → "calling LLM" → "parsing result")
3. Add WebSocket support for real-time progress updates
4. Store job results in database for audit trail
5. Add authentication and rate limiting

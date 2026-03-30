import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

from routers import analyze

app = FastAPI(title="Rumi API", version="0.2.0")

# Serve saved audio files
_storage_path = Path(__file__).parent / "storage"
_storage_path.mkdir(exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(_storage_path)), name="storage")

_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/version")
def get_version():
    """Return current deployment version"""
    version_file = Path(__file__).parent / "version.txt"
    try:
        version = version_file.read_text().strip()
        return {"version": version}
    except FileNotFoundError:
        return {"version": "unknown"}


# ── Flomo proxy (CORS fallback) ───────────────────────────────────────────────

class FlomoProxyBody(BaseModel):
    webhook: str
    content: str


@app.post("/api/flomo/proxy")
async def flomo_proxy(body: FlomoProxyBody):
    """
    Thin pass-through so the browser can reach Flomo without CORS issues.
    Only forwards to flomoapp.com to prevent SSRF.
    """
    if not body.webhook.startswith("https://flomoapp.com/"):
        return {"ok": False, "error": "Invalid webhook URL"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(body.webhook, json={"content": body.content})
            return {"ok": resp.status_code == 200, "status": resp.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}

#!/usr/bin/env python3
"""A speech engine for Presmium in front of Microsoft Edge's online voices (edge-tts), in the shape of the OpenAI
audio API that Presmium's speech service speaks (packages/addon-speech/src/node/engines/openai.ts).

    pnpm speech                      # in papers/: uv run --with edge-tts python -I tools/edge-speech.py
    PRESMIUM_SPEECH_EDGE_URL=http://127.0.0.1:47231/v1 PRESMIUM_SPEECH_EDGE_PROVIDER='Microsoft Edge' \\
      PRESMIUM_SPEECH_EDGE_MODEL=edge-tts presmium serve .

Routes, all under /v1:
  GET  audio/voices             the voices, each with its locale
  POST audio/speech/timestamps  {voice, input, speed?} -> {audio: base64 Ogg/Opus, words: [{text, start, end}]}
  POST audio/speech             the same audio, as bytes

The voices cost nothing and need no key. The port is fixed (47231, or --port) because the address is part of the
engine's identity in the speech cache: synthesized audio stays valid only while the engine is defined the same way.
Audio is converted to Ogg/Opus with FFmpeg (PRESMIUM_FFMPEG, else ffmpeg on the path), the format Presmium labels.
"""
import argparse
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import edge_tts

FFMPEG = os.environ.get("PRESMIUM_FFMPEG") or "ffmpeg"
_voices: list | None = None


def voices() -> list:
    global _voices
    if _voices is None:
        listed = asyncio.run(edge_tts.list_voices())
        _voices = [{"id": v["ShortName"], "label": f"{v['ShortName']} ({v['Gender']})", "lang": [v["Locale"]]} for v in listed]
    return _voices


async def synthesize(text: str, voice: str, speed: float | None) -> tuple[bytes, list]:
    rate = f"{round((speed - 1) * 100):+d}%" if speed else "+0%"
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    audio, words = bytearray(), []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            start = chunk["offset"] / 1e7
            words.append({"text": chunk["text"], "start": round(start, 3), "end": round(start + chunk["duration"] / 1e7, 3)})
    return bytes(audio), words


def to_ogg(mp3: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "in.mp3"), os.path.join(tmp, "out.ogg")
        with open(src, "wb") as f:
            f.write(mp3)
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "64k", dst], check=True)
        with open(dst, "rb") as f:
            return f.read()


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, kind: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, value) -> None:
        self._send(status, json.dumps(value, ensure_ascii=False).encode(), "application/json")

    def do_GET(self) -> None:
        if self.path.split("?")[0] == "/v1/audio/voices":
            return self._json(200, {"voices": voices()})
        self._json(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:
        route = self.path.split("?")[0]
        if route not in ("/v1/audio/speech", "/v1/audio/speech/timestamps"):
            return self._json(404, {"error": {"message": "not found"}})
        try:
            request = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            text, voice = str(request.get("input") or "").strip(), str(request.get("voice") or "")
            if not text or not voice:
                return self._json(400, {"error": {"message": "input and voice are required"}})
            mp3, words = asyncio.run(synthesize(text, voice, request.get("speed")))
            ogg = to_ogg(mp3)
        except Exception as error:  # the engine's own failure, reported to Presmium as the provider's error
            print(f"synthesis failed: {error}", file=sys.stderr, flush=True)
            return self._json(502, {"error": {"message": str(error)}})
        print(f"{voice}: {len(text)} characters, {words[-1]['end'] if words else 0:.1f} s", file=sys.stderr, flush=True)
        if route.endswith("/timestamps"):
            return self._json(200, {"audio": base64.b64encode(ogg).decode(), "words": words})
        self._send(200, ogg, "audio/ogg")

    def log_message(self, *_args) -> None:
        pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=47231)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    server = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"edge speech engine at http://{a.host}:{a.port}/v1", flush=True)
    server.serve_forever()

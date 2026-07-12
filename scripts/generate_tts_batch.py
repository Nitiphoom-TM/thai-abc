#!/usr/bin/env python3
"""
Pre-generates static MP3 narration files using Microsoft Edge Neural TTS (via the
`edge-tts` library) for every fixed, spoken phrase in the app.

Why pre-generate instead of calling Edge TTS live from the browser:
  - The live WebSocket endpoint is unofficial/reverse-engineered; browsers enforce
    CORS/Origin checks that can block it, it requires network on every tap, and on
    iOS Safari `audio.play()` must fire within the same user-gesture tick — an async
    network round trip usually breaks that. Pre-generated files sidestep all of this:
    they're self-hosted, load once, and play instantly offline afterward.

Usage:
    python3 -m venv .venv && .venv/bin/pip install edge-tts
    .venv/bin/python3 scripts/generate_tts_batch.py

Output:
    tts/th/<slug>.mp3, tts/en/<slug>.mp3
    tts/manifest.json   -- {"th": {"<exact text>": "<slug>.mp3"}, "en": {...}}

Re-run any time app content changes; existing files are skipped (only new/changed
text gets synthesized), so it's safe and cheap to run repeatedly.
"""
import asyncio
import hashlib
import json
import os
import sys

try:
    import edge_tts
except ImportError:
    sys.exit("Missing dependency. Run: pip install edge-tts")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTS_JSON = os.path.join(ROOT, "scripts", "tts_texts.json")
OUT_DIR = os.path.join(ROOT, "tts")
MANIFEST_PATH = os.path.join(OUT_DIR, "manifest.json")

VOICE = {"th": "th-TH-PremwadeeNeural", "en": "en-US-AnaNeural"}
RATE = "-12%"   # slightly slower, friendlier pace for toddlers
PITCH = "+20Hz"  # a touch higher/warmer, kid-friendly

MAX_RETRIES = 2
CONCURRENCY = 3


def slug_for(text: str) -> str:
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
    return h + ".mp3"


async def _synthesize(lang: str, text: str) -> bytes:
    communicate = edge_tts.Communicate(text, VOICE[lang], rate=RATE, pitch=PITCH)
    chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    return b"".join(chunks)


def save_manifest(manifest: dict):
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = MANIFEST_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    os.replace(tmp, MANIFEST_PATH)   # atomic swap so a partial write is never read


async def synth_one(lang: str, text: str, sem: asyncio.Semaphore, manifest: dict, stats: dict):
    fname = slug_for(text)
    out_path = os.path.join(OUT_DIR, lang, fname)
    if os.path.exists(out_path) and os.path.getsize(out_path) > 500:
        manifest[lang][text] = fname
        stats["skipped"] += 1
        return
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    async with sem:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                data = await asyncio.wait_for(_synthesize(lang, text), timeout=12)
                if len(data) < 200:
                    raise edge_tts.exceptions.NoAudioReceived("too short")
                with open(out_path, "wb") as f:
                    f.write(data)
                manifest[lang][text] = fname
                stats["ok"] += 1
                if stats["ok"] % 10 == 0:
                    save_manifest(manifest)   # checkpoint progress periodically
                print(f"  [{lang}] OK  ({len(data):>6}B)  {text!r}")
                return
            except Exception as e:  # noqa: BLE001 - retry on any transient failure
                if attempt == MAX_RETRIES:
                    stats["failed"] += 1
                    stats["failed_texts"].append((lang, text, str(e)))
                    print(f"  [{lang}] FAIL after {MAX_RETRIES} tries: {text!r} ({e})")
                else:
                    await asyncio.sleep(0.6 * attempt)


async def main():
    with open(TEXTS_JSON, "r", encoding="utf-8") as f:
        texts = json.load(f)

    manifest = {"th": {}, "en": {}}
    stats = {"ok": 0, "skipped": 0, "failed": 0, "failed_texts": []}
    sem = asyncio.Semaphore(CONCURRENCY)

    tasks = []
    for lang in ("th", "en"):
        for text in texts.get(lang, []):
            tasks.append(synth_one(lang, text, sem, manifest, stats))

    print(f"Synthesizing {len(tasks)} phrases (th={len(texts.get('th', []))}, en={len(texts.get('en', []))})...")
    await asyncio.gather(*tasks)
    save_manifest(manifest)

    print(f"\nDONE  ok={stats['ok']}  skipped(cached)={stats['skipped']}  failed={stats['failed']}")
    if stats["failed_texts"]:
        print("Failed phrases (app will fall back to on-device speech for these):")
        for lang, text, err in stats["failed_texts"]:
            print(f"  [{lang}] {text!r} - {err}")


if __name__ == "__main__":
    asyncio.run(main())

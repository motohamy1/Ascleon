#!/usr/bin/env python3
"""Download + bundle the brand fonts for the Ascleon showcase video.

Remotion renders offline, so every face must be a local woff2 in public/fonts/.
Google Fonts is queried with a Chrome UA to get woff2 (not ttf) URLs.
"""
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "fonts")
APP_FONTS = os.path.join(HERE, "..", "..", "public", "fonts")
os.makedirs(OUT, exist_ok=True)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# family -> list of (weight, subset)
FAMILIES = {
    "Mona+Sans": [("400", "latin"), ("600", "latin"), ("700", "latin"), ("800", "latin")],
    "IBM+Plex+Serif": [("400", "latin"), ("600", "latin"), ("700", "latin")],
    "Caveat": [("500", "latin"), ("600", "latin"), ("700", "latin")],
    "Marhey": [("400", "arabic"), ("600", "arabic"), ("700", "arabic")],
}

# Local fonts that already ship with the app.
LOCAL = {"tanker-400.woff2": os.path.join(APP_FONTS, "tanker-400.woff2")}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def download(url: str, dest: str) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        f.write(r.read())
    print(f"  {os.path.basename(dest)}  {os.path.getsize(dest)} bytes")


def slug(family: str) -> str:
    return family.replace("+", "").lower()


def main() -> int:
    # 1. Copy local fonts
    for name, src in LOCAL.items():
        if os.path.exists(src):
            dest = os.path.join(OUT, name)
            with open(src, "rb") as f:
                data = f.read()
            with open(dest, "wb") as f:
                f.write(data)
            print(f"  {name}  {len(data)} bytes (copied)")
        else:
            print(f"  MISSING local font: {src}", file=sys.stderr)

    # 2. Download Google fonts
    for family, weights in FAMILIES.items():
        for weight, subset in weights:
            css_url = (
                f"https://fonts.googleapis.com/css2?family={family}:wght@{weight}"
                f"&display=swap"
            )
            try:
                css = fetch(css_url)
            except Exception as e:  # noqa: BLE001
                print(f"  CSS FAIL {family} {weight}: {e}", file=sys.stderr)
                continue

            # Find the @font-face block whose unicode-range matches the subset.
            blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
            chosen = None
            for label, body in blocks:
                if label == subset:
                    chosen = body
                    break
            if chosen is None and blocks:
                # fall back to the last block (usually latin)
                chosen = blocks[-1][1]
            if chosen is None:
                print(f"  NO BLOCK {family} {weight}", file=sys.stderr)
                continue

            m = re.search(r"url\((https://[^)]+\.woff2)\)", chosen)
            if not m:
                print(f"  NO WOFF2 {family} {weight}", file=sys.stderr)
                continue

            name = f"{slug(family)}-{weight}-{subset}.woff2"
            download(m.group(1), os.path.join(OUT, name))

    print("\nFonts in public/fonts:")
    for f in sorted(os.listdir(OUT)):
        print(" ", f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

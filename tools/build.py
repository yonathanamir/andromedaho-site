"""Builds privacy/index.html from index.html.

index.html is the single source. The privacy page is the same page with the privacy modal
already open, so the full policy is in the static HTML (readable without JavaScript, for
example by Google Play's policy check). Run after every change to index.html:

    python tools/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPLACEMENTS = [
    ('<title>Andromeda, Ho!</title>', '<title>Privacy Policy · Andromeda, Ho!</title>'),
    ('<link rel="canonical" href="https://andromedaho.com/">', '<link rel="canonical" href="https://andromedaho.com/privacy/">'),
    ('<body>', '<body class="pp-open">'),
    ('<div id="privacy" class="pp" hidden>', '<div id="privacy" class="pp">'),
]


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for old, new in REPLACEMENTS:
        if html.count(old) != 1:
            raise SystemExit(f"build.py: expected exactly one {old!r} in index.html")
        html = html.replace(old, new)
    out = ROOT / "privacy" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8", newline="\n")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Convert the bundled PGR competency checklist PDF into a structured JSON bundle.

The generated bundle mirrors the structure consumed by the roster tool:
- ``template`` defines the competency sections/items.
- ``dataset`` provides defaults and optional starter-specific progress (none in the PDF).

The parser is intentionally deterministic and conservative. It uses explicit section
headings from the PDF and a set of heuristics to stitch multi-line checklist items
that are wrapped in the PDF layout (e.g. lines that continue with brackets or lower-
case starts). The resulting JSON is written next to the input PDF so that it can be
served by the static application without requiring PDF parsing in the browser.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

try:
    from pypdf import PdfReader
except ModuleNotFoundError as exc:  # pragma: no cover - guard for clearer error message
    raise SystemExit("pypdf is required. Install with `pip install pypdf`.") from exc

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "(5) PGR Competancy Checklist.pdf"
OUTPUT_PATH = ROOT / "data" / "pgr_competency_checklist_bundle.json"
LEGACY_BUNDLE_PATH = ROOT / "data" / "(5) PGR Competency Checklist.txt"

SECTION_PATTERNS = [
    ("STARTING SHIFT", "Starting Shift"),
    ("IMPORTANT LOCATIONS", "Important Locations"),
    ("BEPOZ/CASH HANDLING", "Bepoz & Cash Handling"),
    ("BARS", "Bars"),
    ("BAR KNOWLEDGE", "Bar Knowledge"),
    ("FOOD OFFERINGS", "Food Offerings"),
    ("FLOOR", "Floor"),
    ("BOH CLEANING/DUTIES", "BOH Cleaning & Duties"),
]

SKIP_TOKENS = {"TRAINER", "SUPERVISOR", "FROM", "OASIS", "SOVEREIGN", "S", "DISP", "NORTH", "SOUTH"}
CONTINUATION_SUFFIXES = {
    "and",
    "of",
    "the",
    "for",
    "to",
    "with",
    "on",
    "into",
    "between",
    "from",
    "all",
}


def extract_lines(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    raw_lines = [re.sub(r"\s+", " ", line.strip()) for line in text.splitlines()]
    cleaned: list[str] = []
    for line in raw_lines:
        if not line:
            cleaned.append("")
            continue
        upper = line.upper()
        if re.match(r"^\d+\s*\|\s*P A G E$", upper):
            continue
        if upper.startswith("WELCOME TO PGR"):
            continue
        if upper.startswith("PGR COMPETENCY CHECKLIST"):
            continue
        if upper.startswith("NAME:") or upper.startswith("DATE:"):
            continue
        if line == "09/11/24 PP":
            continue
        cleaned.append(line)
    return cleaned


def is_section_header(line: str) -> tuple[bool, str | None]:
    upper = line.upper()
    for prefix, title in SECTION_PATTERNS:
        if upper.startswith(prefix):
            return True, title
    return False, None


def normalise_item_text(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\s+NA$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*–\s*", " - ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def should_continue(previous: str, current: str) -> bool:
    if not previous:
        return False
    if not current:
        return True
    if current.startswith("(") or current[0].islower():
        return True
    words = previous.split()
    if words and words[-1].lower() in CONTINUATION_SUFFIXES:
        return True
    if "between" in (w.lower() for w in words) and len(current.split()) <= 2:
        return True
    if len(current.split()) == 1 and current.upper() == current:
        return True
    return False


def parse_sections(lines: list[str]) -> list[dict[str, list[str]]]:
    sections: list[dict[str, list[str]]] = []
    current_section: dict[str, list[str]] | None = None
    buffer: list[str] = []

    def flush_buffer():
        nonlocal buffer
        if current_section is None or not buffer:
            buffer = []
            return
        text = normalise_item_text(" ".join(buffer))
        if text:
            current_section["items"].append(text)
        buffer = []

    for line in lines:
        if not line:
            flush_buffer()
            continue
        is_header, title = is_section_header(line)
        if is_header:
            flush_buffer()
            if current_section and current_section.get("title") == title:
                # Same heading repeated on a new page – keep appending.
                pass
            else:
                current_section = {"title": title or line, "items": []}
                sections.append(current_section)
            continue
        tokens = set(line.upper().split())
        if tokens and tokens.issubset(SKIP_TOKENS):
            continue
        cleaned = normalise_item_text(line)
        if not cleaned:
            flush_buffer()
            continue
        if buffer:
            if should_continue(buffer[-1], cleaned):
                buffer.append(cleaned)
                continue
            flush_buffer()
        buffer.append(cleaned)
    flush_buffer()
    return sections


def slugify(text: str, seen: dict[str, int]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    if not base:
        base = "item"
    count = seen[base]
    seen[base] += 1
    if count:
        return f"{base}-{count}"
    return base


def build_bundle(sections: list[dict[str, list[str]]]) -> dict:
    slug_counts: defaultdict[str, int] = defaultdict(int)
    template_sections = []
    for section in sections:
        items = []
        for item_text in section["items"]:
            item_id = slugify(item_text, slug_counts)
            items.append({
                "id": item_id,
                "label": item_text,
                "defaultStatus": "Not Started",
            })
        template_sections.append({
            "title": section["title"],
            "description": "",
            "items": items,
        })
    bundle = {
        "bundle": "PGR Competency Checklist (PDF)",
        "source": PDF_PATH.name,
        "generated": True,
        "template": {
            "title": "PGR Competency Checklist",
            "version": "2024.11",
            "statusOptions": ["Not Started", "In Progress", "Complete"],
            "defaultStatus": "Not Started",
            "metadataFields": [
                {"key": "name", "label": "Team Member"},
                {"key": "staffId", "label": "Staff ID"},
                {"key": "role", "label": "Role"},
                {"key": "mentor", "label": "Assigned Mentor"},
                {"key": "startDateDisplay", "label": "Start Date"},
            ],
            "sections": template_sections,
        },
        "dataset": {
            "templateVersion": "2024.11",
            "updated": "2024-11-09",
            "defaults": {
                "role": "Private Gaming Host",
                "department": "Private Gaming Rooms",
                "mentor": "To Be Confirmed",
                "context": {"brand": "PGR"},
                "statusOptions": ["Not Started", "In Progress", "Complete"],
                "defaultStatus": "Not Started",
            },
            "people": [],
        },
    }
    return bundle


def main() -> None:
    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found at {PDF_PATH}")
    lines = extract_lines(PDF_PATH)
    sections = parse_sections(lines)
    bundle = build_bundle(sections)
    if LEGACY_BUNDLE_PATH.exists():
        try:
            legacy = json.loads(LEGACY_BUNDLE_PATH.read_text())
        except json.JSONDecodeError:
            legacy = {}
        legacy_dataset = legacy.get("dataset", {}) if isinstance(legacy, dict) else {}
        legacy_defaults = legacy_dataset.get("defaults")
        if isinstance(legacy_defaults, dict):
            bundle["dataset"]["defaults"].update(legacy_defaults)
    OUTPUT_PATH.write_text(json.dumps(bundle, indent=2, ensure_ascii=False))
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {len(sections)} sections")


if __name__ == "__main__":
    main()

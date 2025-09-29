"""Generate a formatted competency tracking workbook from the bundled dataset."""
from __future__ import annotations

import argparse
import json
from itertools import cycle
from pathlib import Path
from typing import Dict, Iterable, Tuple

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

DEFAULT_INPUT_PATH = Path("data/pgr_competency_checklist_bundle.json")
DEFAULT_OUTPUT_PATH = Path("data/PGR_Competency_Checklist.xlsx")

KNOWN_SECTION_COLOURS: Dict[str, Tuple[str, str]] = {
    "Orientation & Foundations": ("EDF2FB", "1B4F72"),
    "Outlet Competencies": ("E8F5E9", "1B5E20"),
    "Compliance & Guest Care": ("FFF4E6", "E65100"),
}

SECTION_COLOUR_FALLBACKS: Tuple[Tuple[str, str], ...] = (
    ("E8ECFF", "1F3B70"),
    ("E8F5E9", "1B5E20"),
    ("FFF4E5", "8E4B10"),
    ("FCE4EC", "6A1B4D"),
    ("F1F8E9", "33691E"),
)

STATUS_COLOUR_PRESETS = {
    "Not Started": "E0E0E0",
    "In Progress": "FFF3CD",
    "Complete": "D4EDDA",
}

STATUS_COLOUR_FALLBACKS = ("E2E8F0", "FFEFD5", "E3F2FD", "F8D7DA")

BORDER_THIN = Border(
    left=Side(border_style="thin", color="D0D7DE"),
    right=Side(border_style="thin", color="D0D7DE"),
    top=Side(border_style="thin", color="D0D7DE"),
    bottom=Side(border_style="thin", color="D0D7DE"),
)


def make_fill(colour: str) -> PatternFill:
    """Return a solid PatternFill for a given hex colour string."""

    return PatternFill(start_color=colour, end_color=colour, fill_type="solid")


def compute_section_styles(template: dict) -> Dict[str, Tuple[str, str]]:
    """Assign fills and text colours for each template section."""

    resolved: Dict[str, Tuple[str, str]] = {}
    fallback_cycle = cycle(SECTION_COLOUR_FALLBACKS)
    for section in template.get("sections", []):
        title = section.get("title", "")
        if not title:
            continue
        if title not in resolved:
            resolved[title] = KNOWN_SECTION_COLOURS.get(title, next(fallback_cycle))
    return resolved


def compute_status_fills(status_options: Iterable[str]) -> Dict[str, PatternFill]:
    """Return PatternFill instances keyed by each possible status option."""

    fills: Dict[str, PatternFill] = {}
    fallback_cycle = cycle(STATUS_COLOUR_FALLBACKS)
    for option in status_options:
        colour = STATUS_COLOUR_PRESETS.get(option, next(fallback_cycle))
        fills[option] = make_fill(colour)
    return fills


def build_workbook(dataset: dict, template: dict) -> Workbook:
    wb = Workbook()
    overview = wb.active
    overview.title = "Overview"

    section_styles = compute_section_styles(template)
    status_options = template.get("statusOptions") or list(STATUS_COLOUR_PRESETS.keys())
    status_fills = compute_status_fills(status_options)

    build_overview_sheet(overview, dataset, template, section_styles)
    build_matrix_sheet(wb, dataset, template, section_styles, status_options, status_fills)
    build_progress_sheet(wb, dataset, template)

    return wb


def build_overview_sheet(
    ws, dataset: dict, template: dict, section_styles: Dict[str, Tuple[str, str]]
) -> None:
    ws.sheet_view.showGridLines = False
    ws.merge_cells("A1:F1")
    ws["A1"] = template["title"]
    ws["A1"].font = Font(size=20, bold=True, color="1F2933")
    ws["A1"].alignment = Alignment(horizontal="center")

    ws.merge_cells("A2:F2")
    ws["A2"] = f"Version {template['version']} | Dataset updated {dataset['updated']}"
    ws["A2"].font = Font(size=11, color="52606D")
    ws["A2"].alignment = Alignment(horizontal="center")

    ws["A4"] = "How to use this workbook"
    ws["A4"].font = Font(size=14, bold=True, color="1F2933")

    instructions = [
        "Review the Competency Matrix tab to track each team member's progress.",
        "Update the Status column using the drop-down menu for each competency.",
        "Record completion dates and any coaching notes for full transparency.",
        "Use the TM/Manager sign-off columns to capture verification at key milestones.",
        "Refer to the Progress Summary tab for at-a-glance completion metrics by area.",
    ]

    for idx, item in enumerate(instructions, start=5):
        ws[f"A{idx}"] = f"• {item}"
        ws[f"A{idx}"].alignment = Alignment(horizontal="left")
        ws[f"A{idx}"].font = Font(size=11)

    ws["A11"] = "Colour legend"
    ws["A11"].font = Font(size=14, bold=True, color="1F2933")

    ws["A12"] = "Area"
    ws["B12"] = "Description"
    ws["C12"] = "Colour"
    for cell in ws["12:12"]:
        cell.font = Font(bold=True, color="1F2933")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.fill = PatternFill(start_color="E5E9F0", end_color="E5E9F0", fill_type="solid")
        cell.border = BORDER_THIN

    row = 13
    for section in template["sections"]:
        title = section["title"]
        fill_colour, _ = section_styles.get(title, ("F8FAFC", "1F2933"))
        colour_fill = make_fill(fill_colour)

        ws[f"A{row}"] = title
        ws[f"A{row}"].font = Font(bold=True, color="1F2933")
        ws[f"B{row}"] = section.get("description", "")
        ws[f"B{row}"].alignment = Alignment(wrap_text=True)
        ws[f"C{row}"].fill = colour_fill
        for col in "ABC":
            ws[f"{col}{row}"].border = BORDER_THIN
        row += 1

    ws.column_dimensions["A"].width = 35
    ws.column_dimensions["B"].width = 60
    ws.column_dimensions["C"].width = 18


def build_matrix_sheet(
    wb: Workbook,
    dataset: dict,
    template: dict,
    section_styles: Dict[str, Tuple[str, str]],
    status_options: Iterable[str],
    status_fills: Dict[str, PatternFill],
) -> None:
    status_options = list(status_options)
    ws = wb.create_sheet(title="Competency Matrix")
    ws.sheet_view.showGridLines = False
    headers = [
        "Team Member",
        "Staff ID",
        "Role",
        "Assigned Mentor",
        "Start Date",
        "Area",
        "Competency",
        "Details",
        "Status",
        "Completed On",
        "Notes",
        "TM Sign-Off",
        "Manager Sign-Off",
    ]

    ws.append(headers)
    for cell in ws["1:1"]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1F2933", end_color="1F2933", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER_THIN

    template_defaults = dataset.get("defaults", {})
    default_status = template_defaults.get("defaultStatus", status_options[0] if status_options else "")

    row_idx = 2
    for person in dataset.get("people", []):
        meta_notes = person.get("notes", "")
        for section in template["sections"]:
            section_title = section["title"]
            fill_colour, text_colour = section_styles.get(
                section_title, ("F8FAFC", "1F2933")
            )
            section_fill = make_fill(fill_colour)
            for item in section["items"]:
                competency_data = person.get("competencies", {}).get(item["id"], {})
                status = competency_data.get(
                    "status", item.get("defaultStatus", default_status)
                )
                completed_on = competency_data.get("completedOn", "")
                item_notes = competency_data.get("notes", "")

                ws.append(
                    [
                        person.get("name", ""),
                        person.get("staffId", ""),
                        person.get("role", template_defaults.get("role", "")),
                        person.get("mentor", template_defaults.get("mentor", "")),
                        person.get("startDateDisplay", template_defaults.get("startDateDisplay", "")),
                        section_title,
                        item["label"],
                        item.get("description", ""),
                        status,
                        completed_on,
                        build_notes(meta_notes, item_notes),
                        "",
                        "",
                    ]
                )

                for col_idx in range(1, len(headers) + 1):
                    cell = ws.cell(row=row_idx, column=col_idx)
                    cell.border = BORDER_THIN
                    if col_idx == 6:
                        cell.fill = section_fill
                        cell.font = Font(bold=True, color=text_colour)
                        cell.alignment = Alignment(horizontal="center", vertical="center")
                    elif col_idx == 8:
                        cell.alignment = Alignment(wrap_text=True, vertical="top")
                    elif col_idx == 9:
                        cell.alignment = Alignment(horizontal="center")
                    else:
                        cell.alignment = Alignment(vertical="center")
                row_idx += 1

    column_widths = {
        "A": 22,
        "B": 12,
        "C": 20,
        "D": 20,
        "E": 14,
        "F": 24,
        "G": 34,
        "H": 48,
        "I": 16,
        "J": 16,
        "K": 30,
        "L": 16,
        "M": 18,
    }
    for col, width in column_widths.items():
        ws.column_dimensions[col].width = width

    ws.freeze_panes = "A2"

    if row_idx == 2:
        return

    status_range = f"I2:I{row_idx - 1}"
    status_validation = DataValidation(
        type="list",
        formula1="\"" + ",".join(status_options) + "\"",
        allow_blank=True,
    )
    ws.add_data_validation(status_validation)
    status_validation.add(status_range)

    for status, fill in status_fills.items():
        ws.conditional_formatting.add(
            status_range,
            CellIsRule(operator="equal", formula=["\"" + status + "\""], fill=fill),
        )


def build_progress_sheet(wb: Workbook, dataset: dict, template: dict) -> None:
    ws = wb.create_sheet(title="Progress Summary")
    ws.sheet_view.showGridLines = False

    headers = [
        "Team Member",
        *[section["title"] for section in template["sections"]],
        "Overall %",
        "Last Updated",
    ]
    ws.append(headers)
    for cell in ws["1:1"]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER_THIN

    updated = dataset.get("updated", "")
    for person in dataset.get("people", []):
        row = [person.get("name", "")]
        total_completed = 0
        total_items = 0
        for section in template["sections"]:
            items = section["items"]
            completed = 0
            for item in items:
                competency = person.get("competencies", {}).get(item["id"], {})
                if competency.get("status") == "Complete":
                    completed += 1
            total_items += len(items)
            total_completed += completed
            row.append(f"{completed} / {len(items)}")

        overall_percent = round((total_completed / total_items) * 100) if total_items else 0
        row.append(f"{overall_percent}%")
        row.append(updated)
        ws.append(row)

    for row in ws.iter_rows(min_row=2, max_col=len(headers)):
        for cell in row:
            cell.border = BORDER_THIN
            cell.alignment = Alignment(horizontal="center", vertical="center")
            if cell.column == 1:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    ws.freeze_panes = "A2"

    if ws.max_row >= 2:
        percent_col_letter = get_column_letter(len(headers) - 1)
        percent_range = f"{percent_col_letter}2:{percent_col_letter}{ws.max_row}"
        ws.conditional_formatting.add(
            percent_range,
            CellIsRule(
                operator="greaterThanOrEqual",
                formula=["90"],
                fill=PatternFill(
                    start_color="D4EDDA", end_color="D4EDDA", fill_type="solid"
                ),
            ),
        )
        ws.conditional_formatting.add(
            percent_range,
            CellIsRule(
                operator="between",
                formula=["60", "89"],
                fill=PatternFill(
                    start_color="FFF3CD", end_color="FFF3CD", fill_type="solid"
                ),
            ),
        )
        ws.conditional_formatting.add(
            percent_range,
            CellIsRule(
                operator="lessThan",
                formula=["60"],
                fill=PatternFill(
                    start_color="F8D7DA", end_color="F8D7DA", fill_type="solid"
                ),
            ),
        )

    column_widths = {
        "A": 24,
        "B": 24,
        "C": 24,
        "D": 26,
        "E": 16,
    }
    for col, width in column_widths.items():
        ws.column_dimensions[col].width = width


def build_notes(meta_notes: str, item_notes: str) -> str:
    notes = []
    if meta_notes:
        notes.append(meta_notes)
    if item_notes:
        notes.append(item_notes)
    return "\n\n".join(notes)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a formatted competency tracking workbook."
    )
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=DEFAULT_INPUT_PATH,
        help="Path to the competency bundle (JSON or TXT).",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Destination for the generated Excel workbook.",
    )
    return parser.parse_args()


def load_bundle(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Unable to locate competency bundle at {path}")

    with path.open("r", encoding="utf-8") as handle:
        try:
            payload = json.load(handle)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path} is not valid JSON: {exc}") from exc

    missing_keys = {"dataset", "template"} - payload.keys()
    if missing_keys:
        raise KeyError(
            f"Bundle at {path} is missing required keys: {', '.join(sorted(missing_keys))}"
        )

    return payload


def main() -> None:
    args = parse_args()
    bundle_path: Path = args.input

    if not bundle_path.exists() and bundle_path == DEFAULT_INPUT_PATH:
        legacy_path = Path("data/(5) PGR Competency Checklist.txt")
        if legacy_path.exists():
            bundle_path = legacy_path

    payload = load_bundle(bundle_path)

    dataset = payload["dataset"]
    template = payload["template"]

    workbook = build_workbook(dataset, template)

    output_path: Path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(output_path)
    print(f"Workbook written to {output_path}")


if __name__ == "__main__":
    main()

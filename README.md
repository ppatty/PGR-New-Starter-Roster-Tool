PGR Roster Creator - v12.0
Created by Patrick Price 2025

A professional, single-file web application designed to rapidly and intelligently generate training rosters for new team members in the Private Gaming Rooms (PGR) at The Star Gold Coast. This tool is built to be intuitive for supervisors, requiring no technical expertise to operate.

Overview
This application streamlines the complex process of scheduling new trainees across multiple outlets. It automates shift assignments based on a set of predefined rules, ensuring fairness, compliance, and operational readiness. The entire application runs directly in your web browser, requiring no installation or backend server.

Key Features
Intuitive Interface: A clean, modern, and user-friendly design themed with the official PGR branding.

Colour Themes: Switch between curated colour schemes, with your preference remembered for next time.

Team Member Management: Easily add new hires manually or bulk-import them from a CSV file.

Unavailability Management: A simple calendar interface allows you to mark any team member's unavailable days, which the roster builder will automatically respect.

Standardized Training Plan: Every starter completes five 8-hour training shifts, with Oasis Food trainees split across Oasis Food and either South Floor or Oasis Bar.

Intelligent Roster Generation: The core logic creates a balanced roster that matches the configured training plan, adhering to critical rules like days off, shift frequency, and outlet-specific constraints.

Flexible Workflow: Clear the generated roster with a single click to start over without losing your list of team members. The app also prompts for confirmation before overwriting an existing schedule.

Export Options: Export the final roster to both .csv and .xlsx formats for easy sharing and printing.

Competency Checklists: Load a competency template and dataset to automatically generate individualized onboarding checklists for each starter, with CSV/XLSX exports and a printable view.

Configurable Session Days: Choose which weekdays host Welcome Day and PGR Onboarding.

How to Use
  The application is designed around a simple, four-step workflow:

Step 1: Add New Team Members

Enter the team member's Full Name, Staff ID (optional), their First Day of Work, and optionally their Birth Date.

Click "Add Person".

Repeat for all new team members.

(Optional) Use the "Import from CSV" button to upload a list. The CSV file must have three columns: Name, StaffID, StartDate.

(Optional) Click the "Calendar" button next to any person's name to mark their specific unavailable days.

(Optional) Use the "Export Birthday List" button to add new team members' birth dates to the existing Birthday List file. When clicked:
  * You'll be prompted to select whether to merge with an existing birthday list or create a new one.
  * If merging, select the existing "(Birthday List PGR).xlsx" file.
  * The tool will automatically merge new birthdays with existing ones, remove duplicates, sort by month and day, and export the updated list.
  * Only team members with birth dates entered will be included in the export.

Step 2: Training Shifts

Each starter completes five training shifts of eight hours. Standard (Oasis Food) starters are automatically split between Oasis Food and either South Floor or Oasis Bar within each shift.

(Optional) Toggle the "Shuffle" button to ON if you want the order of the training blocks to be randomized for each person.

Step 3: Configure Competency Checklists

Use the "Use Default Template" button or import your own template/dataset JSON files.

Select a team member from the preview list to review their personalized competency checklist. Export all checklists (CSV/XLSX), download an individual checklist, or open a printable view that can be saved as PDF.

Step 4: Select Session Days

Use the dropdowns to choose which days Welcome Day and PGR Onboarding occur.

Step 5: Build & Export

Click the "Build Roster" button. The application will instantly generate the full schedule in the table at the bottom.

Review the roster. If you made a mistake, you can click "Clear Roster" to start again.

Once you are happy with the schedule, use the "Export CSV" or "Export Excel" buttons to save the file.

Competency Data Bundles
----------------------

The repository ships with a default competency bundle stored in `data/`:

* `pgr_competency_checklist_bundle.json` – auto-generated from the official PDF checklist and used as the default template/dataset bundle.
* `(5) PGR Competency Checklist.txt` – legacy bundle retained for historical reference.
* `data/competency-template.json` – legacy standalone template retained for backward compatibility.
* `data/competency-dataset.json` – legacy standalone dataset retained for backward compatibility.
* `data/PGR_Competency_Checklist.xlsx` – generated on demand by the tooling below for hands-on training sign-off (not version controlled).

### Generating the Excel workbook

The curated Excel workbook can be generated at any time to pull in the latest dataset updates:

```
python scripts/generate_competency_workbook.py
```

The script applies matched section colours, status drop-downs, conditional formatting, and summary analytics so the workbook is ready for supervisors to print or upload into a shared drive. Use `--input` and `--output` to point at alternate bundles or destinations. Install the Python dependency with `pip install openpyxl` if it is not already available in your environment.

If the PDF is updated, regenerate the bundle by running:

```
python scripts/convert_pdf_to_competency_bundle.py
```

The script parses `(5) PGR Competancy Checklist.pdf` and writes the refreshed JSON bundle to `data/pgr_competency_checklist_bundle.json`.
It requires the `pypdf` package (`pip install pypdf`).

Supervisors can import updated JSON files at runtime using the controls in **Step 3**. The importer expects valid JSON that follows the same structure as the bundled files. Each starter is matched by `staffId`, falling back to name matching when an ID is not supplied.

Deployment & Installation
This application is a self-contained web app and requires no complex setup.

Online (Recommended): The app is best used when deployed to a free web hosting service like Netlify Drop or GitHub Pages. Simply upload the project folder containing the three necessary files.

Local Use: You can also run the app directly from your computer by double-clicking the index.html file.

Deployment Readiness Checklist
------------------------------

To ensure the tool is ready for immediate deployment, verify the following before publishing a new build:

1. **Automated tests pass** – run `npm test` to confirm the scheduling engine, exports, and validation paths succeed without errors.
2. **Roster data reviewed** – confirm the default competency bundle and training rules reflect the latest operational requirements.
3. **Browser sanity check** – load `index.html` in a modern browser and walk through the five-step workflow to spot any regressions in the UI flow or exports.
4. **Deployment target prepared** – verify CDN caching or static hosting environments are configured to invalidate outdated assets when a new version is uploaded.

Completing this checklist guarantees the application is production-ready with no outstanding issues, matching the zero-defect standard expected for deployment.

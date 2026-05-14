---
name: add-projects
description: Incorporate new project folders dropped into `_projects-to-add/` into the home page. Mines descriptions from the portfolio PDFs in that folder (and optionally the works page at https://www.meltemsahin.rocks/works), appends one `project-row.html` include per project to the Projects section of `index.html`, then moves the folder to `images/projects/<slug>/`. Use whenever the user says "add the projects in _projects-to-add", "incorporate this new project", or just calls `/add-projects`.
---

# /add-projects

## Setup

`_projects-to-add/` is a gitignored staging folder. The user drops:

- One subfolder per project, named with the **slug** (folder name = slug used everywhere). Each contains at least a cover image — convention is `01.jpg`.
- The portfolio PDFs `Portfolio_MeltemSahinOzkoc.pdf` and `BPM_Compilement_MeltemSahinOzkoc.pdf`. These are the canonical metadata source. They stay in `_projects-to-add/` permanently.

The site has two project lists in `index.html`:
- **Side projects** — small linked cards. `_projects/<slug>.md` collection. Don't touch unless the slug is clearly an Instagram-style serial project.
- **Projects** — table of rows with cover + byline + description. **This is where new entries go.** Each row is a `{% include project-row.html %}` (see `_includes/project-row.html` for the shape).

## Steps

1. **List candidates.** Find every directory under `_projects-to-add/` (ignore the PDFs and `.DS_Store`). Skip any slug that already has a `project-row` in `index.html` — ask the user before updating an existing entry.

2. **Mine metadata** for each slug:
   - Extract text from both PDFs with `pypdf` (already available system-wide). Save the combined extract to `/tmp/` and grep / read for the slug name, the likely project title, course code (P.0x, C.0x, W.0x), and surrounding paragraphs.
   - If the slug name is ambiguous (e.g. `dl-facade-classification` could be either a DL project or a parametric facade study), trust the PDF over the slug name — the slug is just a folder convention.
   - For projects not found in the PDFs, optionally fetch https://www.meltemsahin.rocks/works for hints (titles only — the page has no descriptions).
   - For each project produce: `title`, `byline_html`, `year`, `description` (1–2 sentences, factual, no marketing language), and any external `links` (github, website, video, instagram).

3. **Render rows.** Append a `{% include project-row.html %}` block per slug inside the Projects section of `index.html`, **before** the closing `</tbody></table>` near the IAMINARCHITECTURE row. Order new rows most-recent year first. Shape:

   ```liquid
   {% include project-row.html
       title="..."
       cover="/images/projects/<slug>/01.jpg"
       byline_html="<em>Course or Venue</em>, Institution"
       links="github::https://...|website::https://..."
       tags="machine-learning,buildings-energy"
       year="2025"
       description="One or two sentences."
   %}
   ```

   Preserve the user's stylized capitalization (`BI-T-OWER`, `enCOunters`, `whynot?`). Use a regular comma between course and institution (matches existing rows). `links` is optional; omit it entirely if there are no external links.

   **`year` is required.** Either a single 4-digit year (e.g., `"2025"`) or year-with-season (e.g., `"2025 Spring"`, `"2024 Fall"`, `"2026 Summer"`). It renders as gray text in the bottom-right of the row and drives the year-range slider — the slider parses the first 4-digit number from the string. **Do not put the year inside `byline_html`** — keep the byline to course/venue only.

   **`featured="true"`** is optional. Marks a project as part of the curated "Selected" subset shown by default when the page loads. Apply sparingly — typically 5–8 projects across the portfolio. If the user hasn't said whether a new project is featured, omit the flag; they'll add it later if they want.

   **Tags are required.** Pick 1–3 of these five slugs (comma-separated, no spaces):

   | Slug | Display | Pill | When to use |
   |---|---|---|---|
   | `computer-vision` | Computer Vision | CV | image / point-cloud / video understanding |
   | `machine-learning` | Machine Learning | ML | predictive models, classical ML, deep learning |
   | `buildings-energy` | Buildings & Energy | B&E | building performance, energy modeling, retrofits, HVAC |
   | `software-development` | Software Development | Dev | apps, dashboards, platforms, IoT firmware, scripts |
   | `architecture-design` | Architecture & Design | A&D | studio projects, parametric design, construction docs |

   The filter UI at the top of the Projects section and the colored pill in the row's top-right corner are both driven by this `tags` value. If you genuinely can't pick, ask the user before guessing.

4. **Move folders.** For each processed slug:
   - `mkdir -p images/projects/<slug>/`
   - Delete any `.DS_Store` in the source first
   - Move every file from `_projects-to-add/<slug>/` to `images/projects/<slug>/`
   - `rmdir _projects-to-add/<slug>` — should succeed (folder is now empty)
   - **Don't rename images.** Keep `01.jpg` as `01.jpg`. The cover path in the row must match the actual file on disk.

5. **Verify.** The dev server should be running at `http://127.0.0.1:4000/` (start with `./dev.sh` if not).
   - Curl the home page — expect HTTP 200 and a higher project-row count than before.
   - Curl each new cover image — expect HTTP 200 and `image/jpeg`.

6. **Report.** Print a summary table: slugs added, rows inserted, files moved, image HTTP statuses. List the `git status` short output. **Do not commit** — the user reviews and commits.

## Conventions

- **Cover filename:** use `01.jpg` for new projects (the source already names it that way). Older projects use varied names (`cover.jpg`, `ashrae.jpg`, `01.png`) — don't rename those.
- **`_projects-to-add/` is gitignored.** Never `git add` anything inside it. After processing, the folder should contain only the PDFs.
- **Don't auto-commit.** The user reviews changes in their browser, then commits.
- **Don't delete the PDFs.** They're the metadata archive — re-mineable on future runs.
- **Existing slugs:** if a slug already appears in `index.html` or in `images/projects/`, stop and ask the user whether to update or skip.

## Quick reference

- Project-row include: `_includes/project-row.html`
- Projects section: `index.html`, the `<section class="narrow">` that contains the `<h2 id="projects">Projects</h2>` heading. New rows go inside the second `<table>` in that section, just before `</tbody></table>`.
- Dev server: `./dev.sh` → http://127.0.0.1:4000/. Auto-rebuilds on file change.
- Image folder root: `images/projects/<slug>/`.
- PDF metadata source: `_projects-to-add/*.pdf` (read with `pypdf`).

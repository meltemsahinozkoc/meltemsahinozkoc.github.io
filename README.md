# meltemsahinozkoc.github.io

Personal portfolio of Meltem Sahin Ozkoc — built with Jekyll, hosted on GitHub Pages.

## Local development

```sh
bundle install      # one-time
./dev.sh            # serves http://127.0.0.1:4000 with livereload
```

> **Don't use VSCode Live Preview.** It's a static file server and can't run
> Jekyll, so Liquid tags (`{% include ... %}`, `{{ ... }}`) will appear as
> raw text. Always preview through `./dev.sh`.

The script forces `LANG=en_US.UTF-8` because the GitHub Pages bundle of
`jekyll-sass-converter` crashes on non-ASCII chars under Ruby 3+ otherwise.

## Project structure

```
.
├── _config.yml                 Jekyll site config
├── _layouts/                   Page templates
│   ├── default.html            Outer chrome (head, nav, theme toggle, JS)
│   └── project.html            Inner template for /projects/<slug>/ pages
├── _includes/
│   └── project-row.html        Reusable home-page project row
├── _projects/                  Collection of project pages
│   ├── bitower.md
│   ├── blue-print-green-design.md
│   ├── enviro1.md
│   ├── ashrae-great-energy-predictor.md
│   ├── iaminarchitecture.md
│   └── foodiaries.md
├── side-projects/
│   └── oncekahvem.html         Instagram gallery page (Behold embed)
├── assets/
│   ├── css/main.css            Single stylesheet (cursor, theme, project rows)
│   └── js/main.js              Theme toggle + custom cursor + image hover
├── images/
│   ├── profile/                profile photo
│   ├── projects/<slug>/        per-project covers and gallery assets
│   └── side/                   miscellaneous
├── index.html                  Home page (uses project-row include)
└── dev.sh                      Local dev server wrapper
```

## Adding a new project

1. Create `_projects/<slug>.md` with front matter:
   ```yaml
   ---
   layout: project
   title: "Project Name"
   permalink: /projects/<slug>/
   subtitle: "..."
   year: "2025"
   image: "images/projects/<slug>/cover.jpg"
   authors: "<strong>Meltem Sahin Ozkoc</strong>"
   ---
   ```
2. Drop cover assets into `images/projects/<slug>/`.
3. Add a row to `index.html` using the `project-row.html` include.

## Instagram embed

The `/side-projects/oncekahvem/` page uses [Behold.so](https://behold.so/)
to render the latest @oncekahvem posts. To activate it, sign up at behold.so,
create a feed, and replace `YOUR_BEHOLD_FEED_ID` in
`side-projects/oncekahvem.html` with the real Feed ID.

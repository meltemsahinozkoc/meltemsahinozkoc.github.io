#!/usr/bin/env bash
# Local development server.
# Usage: ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

# Force UTF-8 — old jekyll-sass-converter (1.x, used by github-pages gem)
# crashes on non-ASCII chars in the Primer theme under Ruby 3+ otherwise.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

bundle exec jekyll serve --livereload "$@"
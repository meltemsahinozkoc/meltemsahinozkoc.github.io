#!/usr/bin/env bash
# Local development server.
# Usage: ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

# Force UTF-8 — old jekyll-sass-converter (1.x, used by github-pages gem)
# crashes on non-ASCII chars in the Primer theme under Ruby 3+ otherwise.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Skip Bundler / Gemfile resolution — the system Ruby has jekyll 4.3.4
# installed directly, and the Gemfile.lock pins gems that need Ruby 3.1+
# (nokogiri 1.18). We don't need github-pages locally; GitHub Pages builds
# server-side on push. To restore the bundled flow, install Ruby 3.1+ via
# rbenv and run `bundle install`, then revert this line.
export JEKYLL_NO_BUNDLER_REQUIRE=true
exec jekyll serve --livereload "$@"
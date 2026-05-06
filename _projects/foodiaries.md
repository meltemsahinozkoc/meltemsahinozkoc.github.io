---
layout: project
title: "Food Diaries"
permalink: /projects/foodiaries/
subtitle: "Sharing about specialty food & coffee @oncekahvem"
date: 2024-06-02
authors: "<strong>Meltem Sahin Ozkoc</strong>"
website: "https://www.instagram.com/oncekahvem/"
---

<section class="foodiaries"
         data-foodiaries="{{ '/assets/data/foodiaries.json' | relative_url }}">

  <!-- Posting density: years (rows) × months (cols) -->
  <div class="foodiaries__heatmap" data-heatmap aria-label="Posting density by month and year">
    <div class="foodiaries__heatmap-loading">Loading post density…</div>
  </div>

  <div class="foodiaries__filters" role="region" aria-label="Filters">

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">Year</span>
      <div class="foodiaries__year-range">
        <div class="foodiaries__dual-range">
          <input type="range" data-year-min aria-label="Minimum year">
          <input type="range" data-year-max aria-label="Maximum year">
        </div>
        <span class="foodiaries__year-display"></span>
      </div>
    </div>

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">Season</span>
      <div data-filter="season"></div>
    </div>

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">Type</span>
      <div data-filter="category"></div>
    </div>

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">Continent</span>
      <div data-filter="continent"></div>
    </div>

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">Country</span>
      <div data-filter="country"></div>
    </div>

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">City</span>
      <div data-filter="city"></div>
    </div>

    <div class="foodiaries__filter-row">
      <span class="foodiaries__label">Search</span>
      <input type="search" class="foodiaries__search" data-search
             placeholder="restaurant, dish, anything in the caption…"
             aria-label="Search captions">
    </div>

    <div class="foodiaries__filter-row">
      <button type="button" class="foodiaries__chip" data-reset>Reset filters</button>
    </div>

  </div>

  <p class="foodiaries__count" aria-live="polite"></p>

  <div class="foodiaries__grid" aria-live="polite"></div>

  <div class="foodiaries__empty" hidden>
    <p>No posts match the current filters.</p>
    <p style="margin-top: 18px;">
      <a href="https://www.instagram.com/oncekahvem/" target="_blank" rel="noopener">View @oncekahvem on Instagram →</a>
    </p>
  </div>

</section>

<script src="{{ '/assets/js/foodiaries.js' | relative_url }}" defer></script>

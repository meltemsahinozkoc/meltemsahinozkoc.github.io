---
layout: project
title: "Food & Coffee map"
permalink: /projects/food-coffee-map/
subtitle: "A traveler's map of places worth a detour"
date: 2026-05-15
authors: "<strong>Meltem Sahin Ozkoc</strong>"
---

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<link rel="stylesheet" href="{{ '/assets/css/food-coffee-map.css' | relative_url }}">

<section class="fcmap"
         data-fcmap-src="{{ '/assets/data/food-coffee-map/places.json' | relative_url }}">

  <div class="fcmap__cities" data-fcmap-cities role="tablist" aria-label="Cities"></div>

  <div class="fcmap__lists" data-fcmap-lists role="group" aria-label="List filter"></div>

  <div class="fcmap__toolbar">
    <div class="fcmap__types" data-fcmap-types role="group" aria-label="Type filter"></div>
    <label class="fcmap__search-wrap">
      <input type="search" class="fcmap__search" data-fcmap-search
             placeholder="Search places, notes, addresses…"
             aria-label="Search places">
    </label>
    <span class="fcmap__count" data-fcmap-count aria-live="polite"></span>
  </div>

  <div class="fcmap__body">
    <div class="fcmap__map" data-fcmap-map aria-label="Map of places"></div>
    <aside class="fcmap__list" data-fcmap-list aria-label="Places list"></aside>
  </div>

  <p class="fcmap__empty" data-fcmap-empty hidden>No places match the current filters.</p>
</section>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script src="{{ '/assets/js/food-coffee-map.js' | relative_url }}" defer></script>

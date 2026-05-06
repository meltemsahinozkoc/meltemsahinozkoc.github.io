---
layout: project
title: "Music"
permalink: /projects/music/
subtitle: "Selected covers"
date: 2024-01-01
authors: "<strong>Meltem Sahin Ozkoc</strong>"
website: "https://www.youtube.com/@meltemsahinozkoc"
---

<section class="music"
         data-music="{{ '/assets/data/music.json' | relative_url }}">

  <div class="music__filters" role="region" aria-label="Filters">
    <div class="music__filter-row">
      <span class="music__label">Type</span>
      <div data-filter="tag"></div>
    </div>
  </div>

  <p class="music__count" aria-live="polite"></p>
  <div class="music__grid" aria-live="polite"></div>
  <div class="music__empty" hidden>
    <p>No videos to show.</p>
    <p style="margin-top: 18px;">
      <a href="https://www.youtube.com/@meltemsahinozkoc" target="_blank" rel="noopener">Visit channel on YouTube →</a>
    </p>
  </div>

</section>

<script src="{{ '/assets/js/music.js' | relative_url }}" defer></script>

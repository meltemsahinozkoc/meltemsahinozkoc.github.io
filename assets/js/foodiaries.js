(function () {
  'use strict';

  const root = document.querySelector('[data-foodiaries]');
  if (!root) return;

  const dataUrl = root.dataset.foodiaries;
  const grid = root.querySelector('.foodiaries__grid');
  const empty = root.querySelector('.foodiaries__empty');
  const countEl = root.querySelector('.foodiaries__count');
  const heatmap = root.querySelector('[data-heatmap]');
  const continentRow = root.querySelector('[data-filter="continent"]');
  const countryRow = root.querySelector('[data-filter="country"]');
  const cityRow = root.querySelector('[data-filter="city"]');
  const seasonRow = root.querySelector('[data-filter="season"]');
  const categoryRow = root.querySelector('[data-filter="category"]');
  const dualRange = root.querySelector('.foodiaries__dual-range');
  const yearMin = root.querySelector('[data-year-min]');
  const yearMax = root.querySelector('[data-year-max]');
  const yearDisplay = root.querySelector('.foodiaries__year-display');
  const searchInput = root.querySelector('[data-search]');
  const resetBtn = root.querySelector('[data-reset]');

  let posts = [];
  let activeContinent = 'all';
  let activeCountry = 'all';
  let activeCity = 'all';
  let activeSeason = 'all';
  let activeCategory = 'all';
  let activeQuery = '';
  let activeYearMin = null;
  let activeYearMax = null;
  let absMinYear = null;
  let absMaxYear = null;

  fetch(dataUrl)
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => {
      posts = Array.isArray(data) ? data : [];
      if (!posts.length) {
        empty.hidden = false;
        return;
      }
      init();
      renderHeatmap();
      render();
    })
    .catch(() => {
      empty.hidden = false;
    });

  function init() {
    const years = posts.map((p) => p.year).filter(Boolean);
    absMinYear = Math.min(...years);
    absMaxYear = Math.max(...years);
    activeYearMin = absMinYear;
    activeYearMax = absMaxYear;

    [yearMin, yearMax].forEach((slider) => {
      slider.min = absMinYear;
      slider.max = absMaxYear;
      slider.step = 1;
    });
    yearMin.value = absMinYear;
    yearMax.value = absMaxYear;
    updateYearUI();

    yearMin.addEventListener('input', () => {
      activeYearMin = Math.min(+yearMin.value, +yearMax.value);
      yearMin.value = activeYearMin;
      updateYearUI();
      render();
    });
    yearMax.addEventListener('input', () => {
      activeYearMax = Math.max(+yearMax.value, +yearMin.value);
      yearMax.value = activeYearMax;
      updateYearUI();
      render();
    });

    if (searchInput) {
      let debounceId;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          activeQuery = searchInput.value.trim().toLowerCase();
          render();
        }, 120);
      });
    }

    // Season + category chips are simple, fixed lists. Counts use the full set.
    renderChips(
      seasonRow,
      ['all', 'Spring', 'Summer', 'Autumn', 'Winter'],
      (v) => { activeSeason = v; render(); },
      countByKey(posts, 'season'),
    );
    renderChips(
      categoryRow,
      ['all', 'coffee', 'food', 'dessert'],
      (v) => { activeCategory = v; render(); },
      countByCategories(posts),
    );

    rebuildLocationChips();

    resetBtn.addEventListener('click', () => {
      activeContinent = 'all';
      activeCountry = 'all';
      activeCity = 'all';
      activeSeason = 'all';
      activeCategory = 'all';
      activeQuery = '';
      activeYearMin = absMinYear;
      activeYearMax = absMaxYear;
      yearMin.value = absMinYear;
      yearMax.value = absMaxYear;
      if (searchInput) searchInput.value = '';
      updateYearUI();
      rebuildLocationChips();
      // Reset season/category chips' visual state too.
      [seasonRow, categoryRow].forEach((row) => {
        row.querySelectorAll('.foodiaries__chip').forEach((c) => {
          c.classList.toggle('is-active', c.dataset.value === 'all');
        });
      });
      render();
    });
  }

  // ----- Location chips (continent → country → city) -----

  function rebuildLocationChips() {
    const continents = unique(posts.map((p) => p.continent).filter(Boolean));
    renderChips(
      continentRow,
      ['all', ...continents],
      (val) => {
        activeContinent = val;
        activeCountry = 'all';
        activeCity = 'all';
        rebuildCountryAndCity();
        render();
      },
      countByKey(posts, 'continent'),
    );
    rebuildCountryAndCity();
  }

  function rebuildCountryAndCity() {
    const filteredForCountry = posts.filter(
      (p) => activeContinent === 'all' || p.continent === activeContinent
    );
    const countries = unique(
      filteredForCountry.map((p) => p.country).filter(Boolean)
    );
    renderChips(
      countryRow,
      ['all', ...countries],
      (val) => {
        activeCountry = val;
        activeCity = 'all';
        rebuildCity();
        render();
      },
      countByKey(filteredForCountry, 'country'),
    );
    rebuildCity();
  }

  function rebuildCity() {
    const filteredForCity = posts.filter((p) => {
      if (activeContinent !== 'all' && p.continent !== activeContinent) return false;
      if (activeCountry !== 'all' && p.country !== activeCountry) return false;
      return true;
    });
    const cities = unique(filteredForCity.map((p) => p.city).filter(Boolean));
    renderChips(
      cityRow,
      ['all', ...cities],
      (val) => { activeCity = val; render(); },
      countByKey(filteredForCity, 'city'),
    );
  }

  function renderChips(container, values, onPick, counts) {
    container.innerHTML = '';
    values.forEach((val, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'foodiaries__chip' + (i === 0 ? ' is-active' : '');
      btn.dataset.value = val;
      const label = val === 'all' ? 'All' : capitalise(val);
      const n = counts ? counts[val] : null;
      btn.innerHTML = n != null
        ? `${escape(label)}<span class="foodiaries__chip-count">${n}</span>`
        : escape(label);
      btn.addEventListener('click', () => {
        container.querySelectorAll('.foodiaries__chip').forEach((c) =>
          c.classList.remove('is-active')
        );
        btn.classList.add('is-active');
        onPick(val);
      });
      container.appendChild(btn);
    });
  }

  function countByKey(items, key) {
    const counts = { all: items.length };
    items.forEach((p) => {
      const v = p[key];
      if (v != null && v !== '') counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }

  function countByCategories(items) {
    // Posts can carry multiple categories; "all" stays unique post count.
    const counts = { all: items.length };
    items.forEach((p) => {
      (p.categories || []).forEach((c) => {
        counts[c] = (counts[c] || 0) + 1;
      });
    });
    return counts;
  }

  function capitalise(s) {
    if (!s || typeof s !== 'string') return s;
    if (s === 'all') return 'All';
    // Don't lower-case city names; just title-case category words.
    if (s === s.toLowerCase()) return s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  // ----- Year slider track -----

  function updateYearUI() {
    yearDisplay.textContent =
      activeYearMin === activeYearMax
        ? activeYearMin
        : `${activeYearMin} – ${activeYearMax}`;
    if (!dualRange) return;
    const span = absMaxYear - absMinYear || 1;
    const start = ((activeYearMin - absMinYear) / span) * 100;
    const end = ((activeYearMax - absMinYear) / span) * 100;
    dualRange.style.setProperty('--range-start', start + '%');
    dualRange.style.setProperty('--range-end', end + '%');
  }

  // ----- Heatmap (years × months) -----

  function renderHeatmap() {
    if (!heatmap) return;
    const counts = {};            // "year-month" -> n
    let max = 0;
    posts.forEach((p) => {
      if (!p.year || !p.month) return;
      const key = `${p.year}-${p.month}`;
      counts[key] = (counts[key] || 0) + 1;
      if (counts[key] > max) max = counts[key];
    });

    const years = [];
    for (let y = absMinYear; y <= absMaxYear; y++) years.push(y);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const cells = [];
    // Header row: blank corner + month names
    cells.push('<div class="foodiaries__hm-corner"></div>');
    months.forEach((m) => cells.push(`<div class="foodiaries__hm-month-label">${m}</div>`));
    // Year rows
    years.forEach((y) => {
      cells.push(`<div class="foodiaries__hm-year-label">${y}</div>`);
      for (let m = 1; m <= 12; m++) {
        const n = counts[`${y}-${m}`] || 0;
        const intensity = n === 0 ? 0 : Math.ceil((n / max) * 4);  // 0-4
        const title = n === 0
          ? `${months[m-1]} ${y} — no posts`
          : `${months[m-1]} ${y} — ${n} post${n === 1 ? '' : 's'}`;
        cells.push(
          `<button type="button" class="foodiaries__hm-cell" data-level="${intensity}" ` +
          `data-year="${y}" data-month="${m}" data-count="${n}" title="${title}" aria-label="${title}"></button>`
        );
      }
    });

    heatmap.innerHTML = `<div class="foodiaries__hm-grid">${cells.join('')}</div>`;

    // Click handlers: clicking a cell jumps the year-range slider to that year
    // and filters by that month. Click again on the same cell to clear.
    heatmap.querySelectorAll('.foodiaries__hm-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const y = +btn.dataset.year;
        const m = +btn.dataset.month;
        const alreadyActive = btn.classList.contains('is-selected');
        heatmap.querySelectorAll('.foodiaries__hm-cell').forEach((b) => b.classList.remove('is-selected'));
        if (alreadyActive) {
          // toggle off
          activeMonth = null;
          activeYearMin = absMinYear;
          activeYearMax = absMaxYear;
          yearMin.value = absMinYear;
          yearMax.value = absMaxYear;
        } else {
          btn.classList.add('is-selected');
          activeMonth = m;
          activeYearMin = y;
          activeYearMax = y;
          yearMin.value = y;
          yearMax.value = y;
        }
        updateYearUI();
        render();
      });
    });
  }

  // Click-driven month filter (set by heatmap cell click; null = all months).
  let activeMonth = null;

  // ----- Filter + render -----

  function render() {
    const filtered = posts.filter((p) => {
      if (p.year < activeYearMin || p.year > activeYearMax) return false;
      if (activeMonth && p.month !== activeMonth) return false;
      if (activeContinent !== 'all' && p.continent !== activeContinent) return false;
      if (activeCountry !== 'all' && p.country !== activeCountry) return false;
      if (activeCity !== 'all' && p.city !== activeCity) return false;
      if (activeSeason !== 'all' && p.season !== activeSeason) return false;
      if (activeCategory !== 'all' && !(p.categories || []).includes(activeCategory)) return false;
      if (activeQuery && !(p.caption || '').toLowerCase().includes(activeQuery)) return false;
      return true;
    });

    countEl.textContent =
      filtered.length === 1 ? '1 post' : `${filtered.length} posts`;

    if (!filtered.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = filtered.map(card).join('');
    wireCarousels();
  }

  function card(p) {
    const cityHtml = p.city
      ? `<span class="foodiaries__pill">${escape(p.city)}</span>`
      : '';
    const yearHtml = p.year
      ? `<span class="foodiaries__pill">${p.year}</span>`
      : '';
    const fullCaption = p.caption ? escape(p.caption) : '';
    const link = p.permalink || '#';
    const urls = (p.media_urls && p.media_urls.length) ? p.media_urls
      : (p.thumbnail_url ? [p.thumbnail_url] : []);
    const first = urls[0] || '';
    const hasMulti = urls.length > 1;
    const dataAttr = hasMulti ? `data-images='${escapeJsonAttr(JSON.stringify(urls))}'` : '';
    return `
      <div class="foodiaries__card-wrap">
        <a class="foodiaries__card" href="${escape(link)}" target="_blank" rel="noopener">
          <div class="foodiaries__media" ${dataAttr} data-idx="0">
            ${first ? `<img src="${escape(first)}" alt="" loading="lazy">` : ''}
            ${hasMulti ? `
              <button type="button" class="foodiaries__nav foodiaries__nav--prev" aria-label="Previous image" tabindex="-1">‹</button>
              <button type="button" class="foodiaries__nav foodiaries__nav--next" aria-label="Next image" tabindex="-1">›</button>
              <span class="foodiaries__counter">1 / ${urls.length}</span>
            ` : ''}
          </div>
          <div class="foodiaries__body">
            <div class="foodiaries__meta">${yearHtml}${cityHtml}</div>
          </div>
        </a>
        ${fullCaption ? `<div class="foodiaries__overlay" role="tooltip"><p>${fullCaption}</p></div>` : ''}
      </div>
    `;
  }

  // After render, wire up the < > buttons inside each multi-image media box.
  function wireCarousels() {
    grid.querySelectorAll('.foodiaries__media[data-images]').forEach((media) => {
      const urls = JSON.parse(media.dataset.images);
      const img = media.querySelector('img');
      const counter = media.querySelector('.foodiaries__counter');
      const advance = (delta, e) => {
        e.preventDefault();
        e.stopPropagation();
        let idx = (parseInt(media.dataset.idx, 10) || 0) + delta;
        if (idx < 0) idx = urls.length - 1;
        if (idx >= urls.length) idx = 0;
        media.dataset.idx = idx;
        img.src = urls[idx];
        counter.textContent = `${idx + 1} / ${urls.length}`;
      };
      media.querySelector('.foodiaries__nav--prev').addEventListener('click', (e) => advance(-1, e));
      media.querySelector('.foodiaries__nav--next').addEventListener('click', (e) => advance(+1, e));
    });
  }

  // ----- Helpers -----

  function unique(arr) {
    return Array.from(new Set(arr)).sort();
  }

  function escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeJsonAttr(s) {
    return escape(s).replace(/'/g, '&#39;');
  }
})();

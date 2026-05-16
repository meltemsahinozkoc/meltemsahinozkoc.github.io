(function () {
  'use strict';

  const root = document.querySelector('.fcmap');
  if (!root) return;

  const dataUrl = root.dataset.fcmapSrc;
  const citiesEl = root.querySelector('[data-fcmap-cities]');
  const listsEl = root.querySelector('[data-fcmap-lists]');
  const typesEl = root.querySelector('[data-fcmap-types]');
  const searchEl = root.querySelector('[data-fcmap-search]');
  const mapEl = root.querySelector('[data-fcmap-map]');
  const listEl = root.querySelector('[data-fcmap-list]');
  const countEl = root.querySelector('[data-fcmap-count]');
  const emptyEl = root.querySelector('[data-fcmap-empty]');

  const TILES = {
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  };

  const TYPE_META = {
    coffee: { label: 'Coffee', color: '#8b5a2b', icon: '☕' },
    food:   { label: 'Food',   color: '#007AFF', icon: '🍴' }
  };

  const TYPE_ORDER = ['all', 'food', 'coffee'];

  let data = { cities: [], places: [] };
  let activeCity = null;
  let activeList = null;    // null = all lists in the city
  let activeType = 'all';
  let query = '';
  let map = null;
  let tileLayer = null;
  let markerLayer = null;
  const markersById = new Map();
  let selectedPlaceId = null;

  fetch(dataUrl)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      data = json || { cities: [], places: [] };
      data.cities = data.cities || [];
      data.places = data.places || [];

      if (data.cities.length === 0) {
        listEl.innerHTML = '<p class="fcmap__error">No cities in the data yet. Run <code>scripts/process_takeout.py</code> to populate.</p>';
        return;
      }

      const firstWithPlaces = data.cities.find(function (c) {
        return data.places.some(function (p) { return p.city === c.id; });
      });
      activeCity = (firstWithPlaces || data.cities[0]).id;

      buildCityButtons();
      buildTypeChips();
      buildListChips();
      initMap();
      wireEvents();
      render();
      recenterMap();
    })
    .catch(function (err) {
      console.error('[food-coffee-map] failed to load data', err);
      listEl.innerHTML = '<p class="fcmap__error">Could not load places data.</p>';
    });

  function placesInCity(cityId) {
    return data.places.filter(function (p) { return p.city === cityId; });
  }

  function buildCityButtons() {
    citiesEl.innerHTML = '';
    const counts = new Map();
    data.places.forEach(function (p) {
      counts.set(p.city, (counts.get(p.city) || 0) + 1);
    });
    const sorted = data.cities.slice().sort(function (a, b) {
      const ca = counts.get(a.id) || 0;
      const cb = counts.get(b.id) || 0;
      if (ca !== cb) return cb - ca;
      return a.name.localeCompare(b.name);
    });
    sorted.forEach(function (city) {
      const count = counts.get(city.id) || 0;
      const btn = document.createElement('button');
      btn.className = 'fcmap__city-btn';
      btn.type = 'button';
      btn.dataset.city = city.id;
      btn.setAttribute('role', 'tab');
      btn.innerHTML =
        '<span class="fcmap__city-name">' + escapeHtml(city.name) + '</span>' +
        '<span class="fcmap__city-count">' + count + '</span>';
      btn.addEventListener('click', function () {
        if (activeCity === city.id) return;
        activeCity = city.id;
        activeList = null;
        selectedPlaceId = null;
        buildListChips();
        render();
        recenterMap();
      });
      citiesEl.appendChild(btn);
    });
  }

  function buildTypeChips() {
    typesEl.innerHTML = '';
    TYPE_ORDER.forEach(function (id) {
      const meta = id === 'all'
        ? { label: 'All', color: '#000', icon: '✦' }
        : TYPE_META[id];
      const btn = document.createElement('button');
      btn.className = 'fcmap__type-chip';
      btn.type = 'button';
      btn.dataset.type = id;
      btn.style.setProperty('--chip-color', meta.color);
      btn.innerHTML =
        '<span class="fcmap__type-icon" aria-hidden="true">' + meta.icon + '</span>' +
        '<span class="fcmap__type-label">' + meta.label + '</span>';
      btn.addEventListener('click', function () {
        if (activeType === id && id !== 'all') {
          activeType = 'all';
        } else {
          activeType = id;
        }
        render();
      });
      typesEl.appendChild(btn);
    });
  }

  function buildListChips() {
    if (!listsEl) return;
    listsEl.innerHTML = '';
    const city = data.cities.find(function (c) { return c.id === activeCity; });
    if (!city || !Array.isArray(city.lists) || city.lists.length < 2) {
      listsEl.hidden = true;
      return;
    }
    listsEl.hidden = false;

    const cityPlaces = placesInCity(activeCity);
    const totalCount = cityPlaces.length;

    function addChip(label, count, listKey, isTop) {
      const btn = document.createElement('button');
      btn.className = 'fcmap__list-chip';
      if (isTop) btn.classList.add('is-top');
      btn.type = 'button';
      btn.dataset.list = listKey == null ? '' : listKey;
      btn.innerHTML =
        (isTop ? '<span class="fcmap__list-star" aria-hidden="true">★</span>' : '') +
        '<span class="fcmap__list-label">' + escapeHtml(label) + '</span>' +
        '<span class="fcmap__list-count">' + count + '</span>';
      btn.addEventListener('click', function () {
        activeList = (listKey == null) ? null : (activeList === listKey ? null : listKey);
        render();
      });
      listsEl.appendChild(btn);
    }

    addChip('All', totalCount, null, false);
    city.lists.forEach(function (l) {
      const count = cityPlaces.filter(function (p) {
        return (p.lists || []).indexOf(l.label) !== -1;
      }).length;
      addChip(l.label, count, l.label, !!l.top);
    });
  }

  function initMap() {
    map = L.map(mapEl, { scrollWheelZoom: true, zoomControl: true });
    setTileLayer();
    markerLayer = L.layerGroup().addTo(map);

    const observer = new MutationObserver(setTileLayer);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  function setTileLayer() {
    if (!map) return;
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const cfg = TILES[theme];
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);
  }

  function recenterMap() {
    if (!map) return;
    const city = data.cities.find(function (c) { return c.id === activeCity; });
    if (!city || !city.center) return;
    map.setView([city.center.lat, city.center.lng], city.zoom || 13);
  }

  function wireEvents() {
    searchEl.addEventListener('input', function () {
      query = searchEl.value.trim().toLowerCase();
      render();
    });
  }

  function visiblePlaces() {
    return data.places.filter(function (p) {
      if (p.city !== activeCity) return false;
      if (activeList && (p.lists || []).indexOf(activeList) === -1) return false;
      if (activeType !== 'all' && p.type !== activeType) return false;
      if (query) {
        const hay = (
          (p.name || '') + ' ' +
          (p.note || '') + ' ' +
          (p.address || '') + ' ' +
          ((p.lists || []).join(' '))
        ).toLowerCase();
        if (hay.indexOf(query) === -1) return false;
      }
      return true;
    });
  }

  function render() {
    citiesEl.querySelectorAll('.fcmap__city-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.city === activeCity);
    });
    typesEl.querySelectorAll('.fcmap__type-chip').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.type === activeType);
    });
    if (listsEl) {
      listsEl.querySelectorAll('.fcmap__list-chip').forEach(function (b) {
        const k = b.dataset.list || null;
        b.classList.toggle('is-active', (activeList || null) === (k || null));
      });
    }

    const places = visiblePlaces();
    countEl.textContent = places.length + ' place' + (places.length === 1 ? '' : 's');
    emptyEl.hidden = places.length !== 0;

    listEl.innerHTML = '';
    places
      .slice()
      .sort(function (a, b) {
        if (a.top !== b.top) return a.top ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      })
      .forEach(function (p) {
        const meta = TYPE_META[p.type] || TYPE_META.food;
        const hasCoords = isFiniteNumber(p.lat) && isFiniteNumber(p.lng);
        const item = document.createElement('article');
        item.className = 'fcmap__item';
        if (p.top) item.classList.add('is-top');
        if (p.featured) item.classList.add('is-featured');
        if (!hasCoords) item.classList.add('is-no-coord');
        item.dataset.id = p.id;
        if (p.id === selectedPlaceId) item.classList.add('is-active');

        const lists = (p.lists || []).map(function (l) {
          return '<span class="fcmap__item-list">' + escapeHtml(l) + '</span>';
        }).join('');

        item.innerHTML =
          '<div class="fcmap__item-head">' +
            '<span class="fcmap__item-dot" style="background:' + meta.color + '"></span>' +
            (p.top ? '<span class="fcmap__item-star" title="Top pick" aria-label="Top pick">★</span>' : '') +
            '<h3 class="fcmap__item-name">' + escapeHtml(p.name) + '</h3>' +
            '<span class="fcmap__item-type">' + meta.label + '</span>' +
          '</div>' +
          (p.address ? '<p class="fcmap__item-addr">' + escapeHtml(p.address) + '</p>' : '') +
          (p.note ? '<p class="fcmap__item-note">' + escapeHtml(p.note) + '</p>' : '') +
          '<div class="fcmap__item-foot">' +
            lists +
            (!hasCoords ? '<span class="fcmap__item-warn" title="Could not place on map">no map pin</span>' : '') +
            (p.maps_url
              ? '<a class="fcmap__item-link" href="' + escapeAttr(p.maps_url) + '" target="_blank" rel="noopener">Open in Google Maps ↗</a>'
              : '') +
          '</div>';

        item.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          focusPlace(p.id, { fromList: true });
        });
        listEl.appendChild(item);
      });

    renderMarkers(places);
  }

  function renderMarkers(places) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersById.clear();

    places.forEach(function (p) {
      if (!isFiniteNumber(p.lat) || !isFiniteNumber(p.lng)) return;
      const meta = TYPE_META[p.type] || TYPE_META.food;
      const isSelected = p.id === selectedPlaceId;
      const classes = ['fcmap-marker'];
      if (isSelected) classes.push('is-active');
      if (p.top) classes.push('is-top');
      if (p.featured) classes.push('is-featured');
      const showStar = p.top || p.featured;
      const icon = L.divIcon({
        className: classes.join(' '),
        html:
          '<span class="fcmap-marker__dot" style="background:' + meta.color + '">' +
            '<span class="fcmap-marker__icon">' + meta.icon + '</span>' +
            (showStar ? '<span class="fcmap-marker__star" aria-hidden="true">★</span>' : '') +
          '</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const marker = L.marker([p.lat, p.lng], { icon: icon, title: p.name });
      marker.bindPopup(popupHtml(p), { className: 'fcmap-popup', maxWidth: 280 });
      marker.on('click', function () { focusPlace(p.id, { fromMarker: true }); });
      marker.addTo(markerLayer);
      markersById.set(p.id, marker);
    });
  }

  function popupHtml(p) {
    const meta = TYPE_META[p.type] || TYPE_META.food;
    return (
      '<div class="fcmap-popup__inner">' +
        '<p class="fcmap-popup__type" style="color:' + meta.color + '">' +
          (p.top ? '★ ' : '') + meta.label +
        '</p>' +
        '<h3 class="fcmap-popup__name">' + escapeHtml(p.name) + '</h3>' +
        (p.note ? '<p class="fcmap-popup__note">' + escapeHtml(p.note) + '</p>' : '') +
        (p.address ? '<p class="fcmap-popup__addr">' + escapeHtml(p.address) + '</p>' : '') +
        (p.maps_url
          ? '<a class="fcmap-popup__link" href="' + escapeAttr(p.maps_url) + '" target="_blank" rel="noopener">Open in Google Maps ↗</a>'
          : '') +
      '</div>'
    );
  }

  function focusPlace(id, opts) {
    selectedPlaceId = id;
    const p = data.places.find(function (x) { return x.id === id; });
    if (!p) return;
    const marker = markersById.get(id);
    if (marker && isFiniteNumber(p.lat) && isFiniteNumber(p.lng)) {
      if (!opts || !opts.fromMarker) {
        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
      }
      marker.openPopup();
    }
    listEl.querySelectorAll('.fcmap__item').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.id === selectedPlaceId);
    });
    if (opts && opts.fromMarker) {
      const el = listEl.querySelector('.fcmap__item[data-id="' + cssEscape(id) + '"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function isFiniteNumber(n) { return typeof n === 'number' && isFinite(n); }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/(["\\])/g, '\\$1');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(s) { return escapeHtml(s); }
})();

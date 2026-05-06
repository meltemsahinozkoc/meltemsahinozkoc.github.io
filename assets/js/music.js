(function () {
  'use strict';

  const root = document.querySelector('[data-music]');
  if (!root) return;

  const dataUrl = root.dataset.music;
  const grid = root.querySelector('.music__grid');
  const tagsRow = root.querySelector('[data-filter="tag"]');
  const countEl = root.querySelector('.music__count');
  const empty = root.querySelector('.music__empty');

  let videos = [];
  let activeTag = 'all';

  fetch(dataUrl)
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => {
      videos = Array.isArray(data) ? data : [];
      if (!videos.length) {
        empty.hidden = false;
        return;
      }
      renderTags();
      render();
    })
    .catch(() => { empty.hidden = false; });

  function renderTags() {
    const tags = unique(videos.map((v) => v.tag).filter(Boolean));
    const counts = { all: videos.length };
    videos.forEach((v) => { if (v.tag) counts[v.tag] = (counts[v.tag] || 0) + 1; });

    tagsRow.innerHTML = '';
    ['all', ...tags].forEach((val, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'foodiaries__chip' + (i === 0 ? ' is-active' : '');
      btn.dataset.value = val;
      const label = val === 'all' ? 'All' : val;
      const n = counts[val];
      btn.innerHTML = n != null
        ? `${escape(label)}<span class="foodiaries__chip-count">${n}</span>`
        : escape(label);
      btn.addEventListener('click', () => {
        tagsRow.querySelectorAll('.foodiaries__chip').forEach((c) => c.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeTag = val;
        render();
      });
      tagsRow.appendChild(btn);
    });
  }

  function render() {
    const filtered = videos.filter((v) => activeTag === 'all' || v.tag === activeTag);
    countEl.textContent = filtered.length === 1 ? '1 video' : `${filtered.length} videos`;

    if (!filtered.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = filtered.map(card).join('');
    wirePlay();
  }

  function card(v) {
    const thumb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
    const tagHtml = v.tag ? `<span class="music__pill">${escape(v.tag)}</span>` : '';
    const durHtml = v.duration ? `<span class="music__duration">${escape(v.duration)}</span>` : '';
    return `
      <div class="music__card" data-video-id="${escape(v.id)}">
        <div class="music__media">
          <img src="${escape(thumb)}" alt="${escape(v.title)}" loading="lazy">
          ${durHtml}
          <button type="button" class="music__play" aria-label="Play ${escape(v.title)}">
            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
              <circle cx="28" cy="28" r="28" fill="rgba(0,0,0,0.65)"/>
              <polygon points="22,18 22,38 40,28" fill="#fff"/>
            </svg>
          </button>
        </div>
        <div class="music__body">
          <p class="music__title">${escape(v.title)}</p>
          <div class="music__meta">${tagHtml}</div>
        </div>
      </div>
    `;
  }

  function wirePlay() {
    grid.querySelectorAll('.music__card').forEach((cardEl) => {
      const id = cardEl.dataset.videoId;
      const media = cardEl.querySelector('.music__media');
      const swap = () => {
        if (media.querySelector('iframe')) return;
        media.innerHTML = `
          <iframe src="https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0"
                  title="YouTube video player"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen></iframe>
        `;
      };
      cardEl.querySelector('.music__play').addEventListener('click', swap);
      media.addEventListener('click', (e) => {
        if (e.target.tagName !== 'IFRAME') swap();
      });
    });
  }

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
})();

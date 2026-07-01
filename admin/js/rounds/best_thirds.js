/**
 * TrendsFC Admin — Best Thirds Ranking virtual round editor
 * best_thirds.js — Step 6
 */
(function () {
  'use strict';

  const TIEBREAKER_OPTIONS = [
    { value: 'points',              label: 'Points' },
    { value: 'head_to_head_points', label: 'Head-to-head points' },
    { value: 'head_to_head_gd',     label: 'Head-to-head goal diff.' },
    { value: 'head_to_head_gf',     label: 'Head-to-head goals scored' },
    { value: 'goal_difference',     label: 'Goal difference' },
    { value: 'goals_scored',        label: 'Goals scored' },
    { value: 'away_goals',          label: 'Away goals' },
    { value: 'drawing_of_lots',     label: 'Drawing of lots' },
  ];

  function _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _int(v, min) {
    const n = parseInt(v, 10);
    return isNaN(n) ? min : Math.max(n, min);
  }

  function _linkedName(round) {
    if (typeof state === 'undefined' || !state.competition) return round.linked_to_round || '—';
    const linked = state.competition.rounds.find(r => r.id === round.linked_to_round);
    return linked ? linked.name : (round.linked_to_round || '—');
  }

  function _configChanged(round) {
    if (typeof setDirty === 'function') setDirty(true);
    const metaEl = document.querySelector(
      `[data-round-item="${round.id}"] .round-card-meta`
    );
    if (metaEl && typeof getRoundMeta === 'function') {
      metaEl.textContent = getRoundMeta(round);
    }
  }

  // ── Tiebreakers ──────────────────────────────────────────────

  function _renderTiebreakers(wrap, round) {
    const list = wrap.querySelector(`#bt-tb-list-${round.id}`);
    if (!list) return;
    const tbs = round.config.ranking_rules.tiebreakers;

    if (tbs.length === 0) {
      list.innerHTML = '<div class="text-muted small">No tiebreakers defined.</div>';
      _refreshTbSelect(wrap, round);
      return;
    }

    list.innerHTML = tbs.map((tb, i) => {
      const label = TIEBREAKER_OPTIONS.find(o => o.value === tb)?.label || tb;
      return `<div class="tb-item d-flex align-items-center gap-1 mb-1" data-idx="${i}">
        <span class="tb-rank">${i + 1}.</span>
        <span class="flex-grow-1 small">${_esc(label)}</span>
        <button class="btn btn-icon btn-sm" data-tb-up title="Move up"   ${i === 0               ? 'disabled' : ''}>↑</button>
        <button class="btn btn-icon btn-sm" data-tb-down title="Move down" ${i === tbs.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn btn-icon btn-icon-del btn-sm" data-tb-del title="Remove">✕</button>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-tb-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.closest('[data-idx]').dataset.idx;
        if (idx === 0) return;
        [tbs[idx - 1], tbs[idx]] = [tbs[idx], tbs[idx - 1]];
        _configChanged(round);
        _renderTiebreakers(wrap, round);
        _refreshTbSelect(wrap, round);
      });
    });
    list.querySelectorAll('[data-tb-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.closest('[data-idx]').dataset.idx;
        if (idx === tbs.length - 1) return;
        [tbs[idx], tbs[idx + 1]] = [tbs[idx + 1], tbs[idx]];
        _configChanged(round);
        _renderTiebreakers(wrap, round);
        _refreshTbSelect(wrap, round);
      });
    });
    list.querySelectorAll('[data-tb-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.closest('[data-idx]').dataset.idx;
        tbs.splice(idx, 1);
        _configChanged(round);
        _renderTiebreakers(wrap, round);
        _refreshTbSelect(wrap, round);
      });
    });

    _refreshTbSelect(wrap, round);
  }

  function _refreshTbSelect(wrap, round) {
    const sel = wrap.querySelector(`#bt-tb-sel-${round.id}`);
    if (!sel) return;
    const used = new Set(round.config.ranking_rules.tiebreakers);
    const opts = TIEBREAKER_OPTIONS.filter(o => !used.has(o.value));
    sel.innerHTML = opts.length
      ? opts.map(o => `<option value="${o.value}">${_esc(o.label)}</option>`).join('')
      : '<option value="" disabled>All tiebreakers added</option>';
  }

  // ── Build editor ─────────────────────────────────────────────

  function buildEditor(round) {
    const wrap = document.createElement('div');
    wrap.className = 'bt-editor';
    wrap.dataset.roundId = round.id;

    // Ensure config exists with defaults
    round.config = round.config || {};
    const cfg = round.config;
    cfg.num_qualifiers  = cfg.num_qualifiers  ?? 4;
    cfg.ranking_rules   = cfg.ranking_rules   || {};
    cfg.ranking_rules.tiebreakers = cfg.ranking_rules.tiebreakers
      || ['points', 'goal_difference', 'goals_scored'];
    cfg.mapping_file = cfg.mapping_file ?? 'data/source/wc26_third_place_mapping.csv';

    wrap.innerHTML = `
      <div class="bt-virtual-banner mb-3">
        <span class="bt-virtual-badge">VIRTUAL</span>
        <span class="bt-virtual-desc">
          Auto-managed — linked to <strong>${_esc(_linkedName(round))}</strong>.
          Disable <em>Best 3rds</em> in that round's config to remove this round.
        </span>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-md-3">
          <label class="form-label">Number of qualifiers</label>
          <input type="number" class="form-control" id="bt-nq-${round.id}"
                 value="${cfg.num_qualifiers}" min="1" max="48">
          <div class="form-hint">Best 3rd-place teams to advance</div>
        </div>
        <div class="col-md-9">
          <label class="form-label">Mapping file path</label>
          <input type="text" class="form-control bt-mono" id="bt-map-${round.id}"
                 value="${_esc(cfg.mapping_file)}"
                 placeholder="data/source/wc26_third_place_mapping.csv">
          <div class="form-hint">CSV that maps group combinations → slot positions for knockout draw</div>
        </div>
      </div>

      <div class="mb-2">
        <label class="form-label mb-1">Ranking tiebreakers</label>
        <div class="tb-list" id="bt-tb-list-${round.id}"></div>
        <div class="d-flex gap-2 mt-2">
          <select class="form-select form-select-sm flex-grow-1" id="bt-tb-sel-${round.id}"></select>
          <button class="btn btn-outline-secondary btn-sm" id="bt-tb-add-${round.id}">+ Add</button>
        </div>
      </div>
    `;

    _renderTiebreakers(wrap, round);

    // Bind events
    wrap.querySelector(`#bt-nq-${round.id}`).addEventListener('input', e => {
      cfg.num_qualifiers = _int(e.target.value, 1);
      _configChanged(round);
    });

    wrap.querySelector(`#bt-map-${round.id}`).addEventListener('input', e => {
      cfg.mapping_file = e.target.value;
      _configChanged(round);
    });

    wrap.querySelector(`#bt-tb-add-${round.id}`).addEventListener('click', () => {
      const sel = wrap.querySelector(`#bt-tb-sel-${round.id}`);
      if (sel && sel.value) {
        cfg.ranking_rules.tiebreakers.push(sel.value);
        _configChanged(round);
        _renderTiebreakers(wrap, round);
        _refreshTbSelect(wrap, round);
      }
    });

    return wrap;
  }

  // Expose
  window.BestThirdsEditor = { buildEditor };
})();

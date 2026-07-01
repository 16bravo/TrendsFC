/**
 * TrendsFC Admin — Competition Creator
 * app.js — Step 2: round management
 */

// ── Global application state ────────────────────────────────
const state = {
  competition: null,  // competition object being edited
  dirty: false,       // unsaved changes flag
  teams: [],          // loaded from countries_names.csv
};

// ── DOM references ───────────────────────────────────────────
const dom = {
  btnNew:           document.getElementById('btn-new'),
  btnLoad:          document.getElementById('btn-load'),
  btnSave:          document.getElementById('btn-save'),
  fileInput:        document.getElementById('file-input'),
  headerName:       document.getElementById('header-comp-name'),
  compId:           document.getElementById('comp-id'),
  compName:         document.getElementById('comp-name'),
  compYear:         document.getElementById('comp-year'),
  compHosts:        document.getElementById('comp-hosts'),
  btnAddRound:      document.getElementById('btn-add-round'),
  roundsList:       document.getElementById('rounds-list'),
  roundsEmpty:      document.getElementById('rounds-empty'),
  matchPreview:     document.getElementById('matches-preview'),
  matchCount:       document.getElementById('match-count'),
  jsonWrap:         document.getElementById('json-preview-wrap'),
  jsonContent:      document.getElementById('json-preview-content'),
  btnJsonToggle:    document.getElementById('btn-json-toggle'),
  btnJsonCopy:      document.getElementById('btn-json-copy'),
  btnJsonRefresh:   document.getElementById('btn-json-refresh'),
};

// ── Initialisation ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  _tryAutoLoadTeams();
  // Ctrl+S → save
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.competition) onSave();
    }
  });
});

function bindEvents() {
  // Header buttons
  dom.btnNew.addEventListener('click', onNew);
  dom.btnLoad.addEventListener('click', () => dom.fileInput.click());
  dom.btnSave.addEventListener('click', onSave);
  dom.fileInput.addEventListener('change', onFileSelected);

  // Competition info → update header title
  dom.compName.addEventListener('input', () => {
    const name = dom.compName.value.trim() || 'New competition';
    dom.headerName.textContent = name;
    setDirty(true);
  });
  dom.compId.addEventListener('input', () => setDirty(true));
  dom.compYear.addEventListener('input', () => setDirty(true));
  dom.compHosts.addEventListener('input', () => setDirty(true));

  // Add round button
  dom.btnAddRound.addEventListener('click', onAddRound);

  // JSON preview controls
  dom.btnJsonToggle?.addEventListener('click', () => {
    const visible = dom.jsonWrap.style.display !== 'none';
    dom.jsonWrap.style.display = visible ? 'none' : '';
    dom.btnJsonToggle.textContent = visible ? '\u25bc Show' : '\u25b2 Hide';
    if (!visible) renderJsonPreview();
  });
  dom.btnJsonRefresh?.addEventListener('click', renderJsonPreview);
  dom.btnJsonCopy?.addEventListener('click', () => {
    const text = dom.jsonContent?.textContent || '';
    navigator.clipboard.writeText(text).then(() => showToast('JSON copied to clipboard'));
  });

  // Modal: round type cards
  document.querySelectorAll('.round-type-card:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      bootstrap.Modal.getInstance(document.getElementById('modal-round-type'))?.hide();
      addRound(type);
    });
  });
}

// ── Teams auto-load ──────────────────────────────────────────────
async function _tryAutoLoadTeams() {
  if (typeof TeamsLoader === 'undefined') return;
  const teams = await TeamsLoader.tryAutoLoad();
  if (teams && teams.length > 0) {
    state.teams = teams;
    // Refresh any open assignment tabs
    document.querySelectorAll('.gs-assign-container').forEach(container => {
      const roundId = container.dataset.roundId;
      if (typeof GroupStageEditor !== 'undefined') {
        GroupStageEditor.refreshAssignment(roundId);
      }
    });
  }
}

// ── New competition ──────────────────────────────────────────
function onNew() {
  if (state.dirty && !confirm('Unsaved changes will be lost. Continue?')) return;

  state.competition = createEmptyCompetition();
  state.dirty = false;

  dom.compId.value    = '';
  dom.compName.value  = '';
  dom.compYear.value  = '';
  dom.compHosts.value = '';
  dom.headerName.textContent = 'New competition';

  renderRounds();
  renderMatches();
  dom.btnSave.disabled = false;
}

// ── Load competition ─────────────────────────────────────────
function onFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  state._loadedFilename = file.name;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      loadCompetition(data);
      const rounds  = (data.rounds || []).length;
      const matches = (data.rounds || []).flatMap(r => r.matches || []).length;
      showToast(`Loaded “${file.name}” — ${rounds} round${rounds !== 1 ? 's' : ''}, ${matches} match${matches !== 1 ? 'es' : ''}`);
    } catch (err) {
      console.error('Full loading error:', err);
      alert('Invalid JSON file or data error.\n\nDetails: ' + err.message);
    }
  };
  reader.readAsText(file);
  // Réinitialise l'input pour permettre de recharger le même fichier
  dom.fileInput.value = '';
}

function loadCompetition(data) {
  state.competition = data;
  state.dirty = false;

  dom.compId.value    = data.id    || '';
  dom.compName.value  = data.name  || '';
  dom.compYear.value  = data.year  || '';
  dom.compHosts.value = (data.hosts || []).join(', ');
  dom.headerName.textContent = data.name || 'Unnamed competition';

  renderRounds();
  renderMatches();
  renderJsonPreview();
  dom.btnSave.disabled = false;
}

// ── Save competition ─────────────────────────────────────────
function onSave() {
  if (!state.competition) return;

  // Sync info fields into the object
  state.competition.id    = dom.compId.value.trim();
  state.competition.name  = dom.compName.value.trim();
  state.competition.year  = parseInt(dom.compYear.value) || null;
  state.competition.hosts = dom.compHosts.value.split(',').map(s => s.trim()).filter(Boolean);

  // Validate
  if (!state.competition.id) {
    showToast('Please set a competition identifier before saving.', 'warning');
    dom.compId.focus();
    return;
  }
  if (!state.competition.name) {
    showToast('Please set a competition name before saving.', 'warning');
    dom.compName.focus();
    return;
  }

  const json = JSON.stringify(state.competition, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href     = url;
  a.download = state.competition.id + '.json';
  a.click();
  URL.revokeObjectURL(url);

  setDirty(false);
  renderJsonPreview();
  showToast(`Saved as \u201c${state.competition.id}.json\u201d`);
}

// ── Add round ────────────────────────────────────────────────
function onAddRound() {
  if (!state.competition) {
    state.competition = createEmptyCompetition();
    dom.btnSave.disabled = false;
  }
  const modal = new bootstrap.Modal(document.getElementById('modal-round-type'));
  modal.show();
}

function addRound(type) {
  if (!state.competition) {
    state.competition = createEmptyCompetition();
    dom.btnSave.disabled = false;
  }

  const defaultNames = {
    group_stage: 'Group Stage',
    knockout:    'Knockout',
  };

  const round = {
    id:      `r${Date.now()}`,
    type:    type,
    name:    defaultNames[type] || 'Round',
    config:  getDefaultConfig(type),
    matches: [],
  };

  if (type === 'group_stage') round.groups = {};

  state.competition.rounds.push(round);
  setDirty(true);
  renderRounds();
  renderMatches();

  // Auto-open the editor for the new round
  setTimeout(() => toggleRoundEditor(round.id, true), 50);
}

function getDefaultConfig(type) {
  if (type === 'group_stage') {
    return {
      num_groups:      4,
      teams_per_group: 4,
      ranking_rules: {
        points_win:  3,
        points_draw: 1,
        points_loss: 0,
        tiebreakers: ['points', 'goal_difference', 'goals_scored'],
      },
      qualifiers: {
        top_n_per_group:     2,
        best_thirds_enabled: false,
      },
    };
  }
  if (type === 'knockout') {
    return { legs: 1, extra_time: true, penalties: true, replay: false };
  }
  return {};
}

// ── Rendering ────────────────────────────────────────────────
function renderRounds() {
  const list  = dom.roundsList;
  const empty = dom.roundsEmpty;

  list.querySelectorAll('.round-item').forEach(el => el.remove());

  const rounds = state.competition?.rounds || [];

  if (rounds.length === 0) {
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  rounds.forEach((round, i) => {
    const item = document.createElement('div');
    item.className = 'round-item';
    item.dataset.roundItem = round.id;
    item.appendChild(buildRoundCard(round, i, rounds.length));
    item.appendChild(buildRoundEditorPanel(round));
    list.appendChild(item);
  });
}

function buildRoundCard(round, index, total) {
  const card = document.createElement('div');
  card.className = 'round-card';

  const typeLabel = {
    group_stage:         'Group Stage',
    knockout:            'Knockout',
    best_thirds_ranking: 'Best 3rds (virtual)',
  }[round.type] || round.type;

  const typeClass = round.type === 'knockout'            ? 'knockout'
                  : round.type === 'best_thirds_ranking' ? 'best_thirds'
                  : '';

  card.innerHTML = `
    <span class="round-card-order">${index + 1}</span>
    <span class="round-card-type-badge ${typeClass}">${typeLabel}</span>
    <span class="round-card-name" title="Double-click to rename">${escapeHtml(round.name || '—')}</span>
    <span class="round-card-meta">${getRoundMeta(round)}</span>
    <div class="round-card-actions">
      <button class="btn btn-icon" data-action="up"     title="Move up"   ${index === 0            ? 'disabled' : ''}>↑</button>
      <button class="btn btn-icon" data-action="down"   title="Move down" ${index === total - 1   ? 'disabled' : ''}>↓</button>
      <button class="btn btn-icon btn-icon-edit" data-action="edit"   title="Edit">✎</button>
      <button class="btn btn-icon btn-icon-del"  data-action="delete" title="${round.virtual ? 'Auto-managed' : 'Delete'}" ${round.virtual ? 'disabled' : ''}>✕</button>
    </div>
  `;

  card.querySelector('.round-card-name').addEventListener('dblclick', () =>
    startRename(round, card.querySelector('.round-card-name'))
  );
  card.querySelector('[data-action="up"]').addEventListener('click',     () => moveRound(round.id, -1));
  card.querySelector('[data-action="down"]').addEventListener('click',   () => moveRound(round.id,  1));
  card.querySelector('[data-action="edit"]').addEventListener('click',   () => toggleRoundEditor(round.id));
  if (!round.virtual) {
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteRound(round.id));
  }

  return card;
}

function renderMatches() {
  const preview = dom.matchPreview;
  const rounds  = state.competition?.rounds || [];
  const allMatches = rounds.flatMap(r => r.matches || []);
  const count = allMatches.length;

  dom.matchCount.textContent = `${count} match${count !== 1 ? 'es' : ''}`;

  if (count === 0) {
    preview.innerHTML = `<div class="empty-placeholder">Matches will appear here once rounds are configured and generated.</div>`;
    return;
  }

  // Summary table: group by round
  let html = `<table class="match-table w-100"><thead>
    <tr><th>Round</th><th>Group</th><th>Home</th><th class="match-vs"></th><th>Away</th><th>Date</th></tr>
  </thead><tbody>`;

  rounds.forEach(round => {
    const rMatches = round.matches || [];
    if (rMatches.length === 0) return;
    rMatches.forEach((m, i) => {
      const cls = m.cancelled ? ' class="match-cancelled"' : '';
      html += `<tr${cls}>
        ${i === 0 ? `<td rowspan="${rMatches.length}" class="match-round-cell">${_esc(round.name)}</td>` : ''}
        <td>${m.group ? `Grp ${_esc(m.group)}` : '—'}</td>
        <td class="match-team">${_slotDisplay(m, 'home')}</td>
        <td class="match-vs">\u2013</td>
        <td class="match-team">${_slotDisplay(m, 'away')}</td>
        <td class="match-date-preview">${
          m.cancelled
            ? '<span class="text-muted fst-italic">cancelled</span>'
            : (m.date || '<span class="text-muted">TBD</span>')
        }</td>
      </tr>`;
    });
  });

  html += '</tbody></table>';
  preview.innerHTML = html;
}

// ── Utilities ─────────────────────────────────────────────────
function createEmptyCompetition() {
  return {
    id:     '',
    name:   '',
    year:   null,
    hosts:  [],
    rounds: [],
  };}

// ── JSON preview panel ───────────────────────────────────
function renderJsonPreview() {
  if (!dom.jsonContent) return;
  if (!state.competition) {
    dom.jsonContent.textContent = '// No competition loaded.';
    return;
  }
  // Sync info fields first
  const snapshot = Object.assign({}, state.competition, {
    id:    dom.compId.value.trim()   || state.competition.id,
    name:  dom.compName.value.trim() || state.competition.name,
    year:  parseInt(dom.compYear.value) || state.competition.year,
    hosts: dom.compHosts.value ? dom.compHosts.value.split(',').map(s => s.trim()).filter(Boolean) : state.competition.hosts,
  });
  dom.jsonContent.textContent = JSON.stringify(snapshot, null, 2);
}

// ── Toast notification ───────────────────────────────────
function showToast(message, type = 'success') {
  const toastEl = document.getElementById('app-toast');
  const bodyEl  = document.getElementById('toast-body');
  if (!toastEl || !bodyEl) return;

  // Color by type
  toastEl.className = 'toast align-items-center border-0';
  toastEl.classList.add(
    type === 'warning' ? 'text-bg-warning' :
    type === 'danger'  ? 'text-bg-danger'  :
    'text-bg-success'
  );
  bodyEl.textContent = message;

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 });
  toast.show();
}

function setDirty(value) {
  state.dirty = value;
  document.title = value
    ? '* TrendsFC — Competition Creator'
    : 'TrendsFC — Competition Creator';
}

function deleteRound(roundId) {
  if (!confirm('Delete this round? Associated matches will be lost.')) return;
  // Also remove any virtual round linked to this round
  state.competition.rounds = state.competition.rounds.filter(
    r => r.id !== roundId && r.linked_to_round !== roundId
  );
  setDirty(true);
  renderRounds();
  renderMatches();
}

// ── Best thirds virtual round sync ───────────────────────────
function syncBestThirdsRound(gsRound) {
  const rounds = state.competition.rounds;
  const q = gsRound.config?.qualifiers || {};
  const existingIdx = rounds.findIndex(
    r => r.type === 'best_thirds_ranking' && r.linked_to_round === gsRound.id
  );

  if (q.best_thirds_enabled) {
    if (existingIdx === -1) {
      // Insert right after the group stage round
      const gsIdx = rounds.findIndex(r => r.id === gsRound.id);
      const virtualRound = {
        id:              `${gsRound.id}_thirds`,
        type:            'best_thirds_ranking',
        name:            `Best 3rds \u2014 ${gsRound.name}`,
        virtual:         true,
        linked_to_round: gsRound.id,
        config: {
          num_qualifiers: q.best_thirds_count || 4,
          ranking_rules:  { tiebreakers: ['points', 'goal_difference', 'goals_scored'] },
          mapping_file:   'data/source/wc26_third_place_mapping.csv',
        },
        matches: [],
      };
      rounds.splice(gsIdx + 1, 0, virtualRound);
    } else {
      // Keep num_qualifiers in sync with best_thirds_count
      rounds[existingIdx].config.num_qualifiers = q.best_thirds_count || 4;
    }
  } else {
    if (existingIdx !== -1) {
      rounds.splice(existingIdx, 1);
    }
  }

  setDirty(true);
  renderRounds();
  renderMatches();
}

function moveRound(id, direction) {
  const rounds = state.competition.rounds;
  const idx    = rounds.findIndex(r => r.id === id);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= rounds.length) return;
  [rounds[idx], rounds[newIdx]] = [rounds[newIdx], rounds[idx]];
  setDirty(true);
  renderRounds();
  renderMatches();
}

function toggleRoundEditor(roundId, forceOpen = false) {
  const panel = document.getElementById(`editor-${roundId}`);
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  const open   = forceOpen || !isOpen;
  panel.classList.toggle('open', open);

  // Sync edit button visual state
  const item    = dom.roundsList.querySelector(`[data-round-item="${roundId}"]`);
  const editBtn = item?.querySelector('[data-action="edit"]');
  if (editBtn) editBtn.classList.toggle('active', open);

  if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildRoundEditorPanel(round) {
  const panel = document.createElement('div');
  panel.className = 'round-editor-panel';
  panel.id = `editor-${round.id}`;

  if (round.type === 'group_stage' && typeof GroupStageEditor !== 'undefined') {
    panel.appendChild(GroupStageEditor.buildEditor(round));
  } else if (round.type === 'best_thirds_ranking' && typeof BestThirdsEditor !== 'undefined') {
    panel.appendChild(BestThirdsEditor.buildEditor(round));
  } else if (round.type === 'knockout' && typeof KnockoutEditor !== 'undefined') {
    panel.appendChild(KnockoutEditor.buildEditor(round));
  } else {
    panel.innerHTML = `
      <div class="editor-placeholder">
        <span class="editor-placeholder-type">${escapeHtml(round.type)}</span>
        Full editor coming in a future step.
      </div>
    `;
  }
  return panel;
}

function getRoundMeta(round) {
  const c = round.config || {};
  if (round.type === 'group_stage') {
    const g  = c.num_groups      || '?';
    const t  = c.teams_per_group || '?';
    const q  = c.qualifiers?.top_n_per_group     || '?';
    const b3 = c.qualifiers?.best_thirds_enabled ? ' + best 3rds' : '';
    return `${g} groups × ${t} teams · top ${q}${b3}`;
  }
  if (round.type === 'knockout') {
    const legs = c.legs === 2 ? '2 legs' : '1 leg';
    const et   = c.extra_time ? ' · ET'  : '';
    const pk   = c.penalties  ? ' · PKs' : '';
    return `${legs}${et}${pk}`;
  }
  if (round.type === 'best_thirds_ranking') {
    return `${c.num_qualifiers || '?'} qualifiers`;
  }
  return '—';
}

function startRename(round, el) {
  const current = round.name || '';
  const input   = document.createElement('input');
  input.type      = 'text';
  input.value     = current;
  input.className = 'round-name-input';
  el.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || current;
    round.name = newName;
    setDirty(true);
    const span = document.createElement('span');
    span.className = 'round-card-name';
    span.title     = 'Double-click to rename';
    span.textContent = newName;
    span.addEventListener('dblclick', () => startRename(round, span));
    input.replaceWith(span);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  input.blur();
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateRoundMeta(roundId) {
  const round = state.competition?.rounds.find(r => r.id === roundId);
  if (!round) return;
  const item   = dom.roundsList.querySelector(`[data-round-item="${roundId}"]`);
  const metaEl = item?.querySelector('.round-card-meta');
  if (metaEl) metaEl.textContent = getRoundMeta(round);
}

// Alias used by renderMatches (escaping is defined in group_stage.js but
// app.js needs its own copy for the global preview table)
function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Format a match side for the global preview table
function _slotDisplay(m, side) {
  const team = side === 'home' ? m.home : m.away;
  const slot = side === 'home' ? m.slot_home : m.slot_away;
  if (team) return _esc(team);
  if (!slot || !slot.round) return '<span class="text-muted">TBD</span>';

  const sourceRound = (state.competition?.rounds || []).find(r => r.id === slot.round);
  if (!sourceRound) return _esc(slot.round);

  if (sourceRound.type === 'group_stage') {
    const pos = slot.position || '?';
    const grp = slot.group    || '?';
    return _esc(`${pos} Grp ${grp}`);
  }
  if (sourceRound.type === 'best_thirds_ranking') {
    return _esc(slot.position || 'Best 3rd');
  }
  if (sourceRound.type === 'knockout') {
    const srcMatches = sourceRound.matches || [];
    const mIdx = srcMatches.findIndex(mx => mx.id === slot.match);
    const mLabel = mIdx >= 0 ? `M${mIdx + 1}` : '?';
    return _esc(`${slot.outcome === 'loser' ? 'Loser' : 'Winner'} ${mLabel}`);
  }
  return '?';
}

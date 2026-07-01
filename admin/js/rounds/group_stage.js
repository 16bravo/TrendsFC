/**
 * Group Stage Editor
 * Builds the configuration panel for a round of type "group_stage".
 * Two tabs: Configuration | Team Assignment
 * Exposed globally as GroupStageEditor.
 */
const GroupStageEditor = (() => {

  // ── Tiebreaker catalogue ─────────────────────────────────────
  const TB_LABELS = {
    points:              'Total points',
    head_to_head_points: 'H2H: points',
    head_to_head_gd:     'H2H: goal difference',
    head_to_head_gf:     'H2H: goals scored',
    goal_difference:     'Overall goal difference',
    goals_scored:        'Overall goals scored',
    away_goals:          'Away goals rule',
    drawing_of_lots:     'Drawing of lots (random)',
  };
  const ALL_TB_KEYS = Object.keys(TB_LABELS);

  // ── Public entry point ───────────────────────────────────────
  function buildEditor(round) {
    const wrap = document.createElement('div');
    wrap.className = 'gs-editor';
    wrap.dataset.roundId = round.id;
    _render(wrap, round);
    return wrap;
  }

  // Refresh the assignment tab (called externally when teams load)
  function refreshAssignment(roundId) {
    const wrap  = document.querySelector(`.gs-editor[data-round-id="${roundId}"]`);
    const round = (typeof state !== 'undefined')
      ? state.competition?.rounds.find(r => r.id === roundId)
      : null;
    if (wrap && round) {
      const container = wrap.querySelector('.gs-assign-container');
      if (container) _renderAssignment(container, round);
    }
  }

  // ── Full render (tabs) ───────────────────────────────────────
  function _render(wrap, round) {
    const id = round.id;
    wrap.innerHTML = `
      <ul class="nav nav-tabs gs-tabs" role="tablist">
        <li class="nav-item">
          <button class="nav-link active" data-bs-toggle="tab"
                  data-bs-target="#gs-config-${id}" type="button" role="tab">
            Configuration
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab"
                  data-bs-target="#gs-assign-${id}" type="button" role="tab">
            Team Assignment
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab"
                  data-bs-target="#gs-matches-${id}" type="button" role="tab">
            Matches
          </button>
        </li>
      </ul>
      <div class="tab-content gs-tab-content">
        <div class="tab-pane fade show active" id="gs-config-${id}" role="tabpanel">
          ${_configHTML(round)}
        </div>
        <div class="tab-pane fade" id="gs-assign-${id}" role="tabpanel">
        </div>
        <div class="tab-pane fade" id="gs-matches-${id}" role="tabpanel">
        </div>
      </div>
    `;

    _renderTiebreakers(wrap, round);
    _refreshTbSelect(wrap, round);
    _bindConfigEvents(wrap, round);

    const assignPane = wrap.querySelector(`#gs-assign-${id}`);
    const container  = document.createElement('div');
    container.className = 'gs-assign-container';
    container.dataset.roundId = id;
    assignPane.appendChild(container);
    _renderAssignment(container, round);

    const matchesPane = wrap.querySelector(`#gs-matches-${id}`);
    const matchCon    = document.createElement('div');
    matchCon.className    = 'gs-matches-container';
    matchCon.dataset.roundId = id;
    matchesPane.appendChild(matchCon);
    _renderMatchesTab(matchCon, round);
  }

  // ── Configuration tab HTML ───────────────────────────────────
  function _configHTML(round) {
    const c = round.config;
    const r = c.ranking_rules;
    const q = c.qualifiers;
    const id = round.id;
    return `
      <div class="editor-sections">
        <div class="editor-block">
          <div class="editor-block-title">Format</div>
          <div class="row g-3">
            <div class="col-6 col-sm-3">
              <label class="form-label">Groups</label>
              <input type="number" class="form-control form-control-sm"
                     id="gs-num-groups-${id}" value="${c.num_groups}" min="1" max="32">
            </div>
            <div class="col-6 col-sm-3">
              <label class="form-label">Teams per group</label>
              <input type="number" class="form-control form-control-sm"
                     id="gs-teams-${id}" value="${c.teams_per_group}" min="2" max="8">
            </div>
          </div>
        </div>
        <div class="editor-block">
          <div class="editor-block-title">Points system</div>
          <div class="row g-3">
            <div class="col-4 col-sm-2">
              <label class="form-label">Win</label>
              <input type="number" class="form-control form-control-sm"
                     id="gs-pts-win-${id}" value="${r.points_win}" min="0" max="9">
            </div>
            <div class="col-4 col-sm-2">
              <label class="form-label">Draw</label>
              <input type="number" class="form-control form-control-sm"
                     id="gs-pts-draw-${id}" value="${r.points_draw}" min="0" max="9">
            </div>
            <div class="col-4 col-sm-2">
              <label class="form-label">Loss</label>
              <input type="number" class="form-control form-control-sm"
                     id="gs-pts-loss-${id}" value="${r.points_loss}" min="0" max="9">
            </div>
          </div>
        </div>
        <div class="editor-block">
          <div class="editor-block-title">
            Tiebreakers <span class="editor-block-hint">in order of priority</span>
          </div>
          <div id="gs-tb-list-${id}" class="tiebreaker-list"></div>
          <div class="d-flex gap-2 mt-2">
            <select class="form-select form-select-sm" style="max-width:300px"
                    id="gs-tb-sel-${id}"></select>
            <button class="btn btn-outline-primary btn-sm" id="gs-tb-add-${id}">+ Add</button>
          </div>
        </div>
        <div class="editor-block">
          <div class="editor-block-title">Qualification</div>
          <div class="row g-3 align-items-center">
            <div class="col-6 col-sm-3">
              <label class="form-label">Top N per group</label>
              <input type="number" class="form-control form-control-sm"
                     id="gs-topn-${id}" value="${q.top_n_per_group}" min="1" max="8">
            </div>
            <div class="col-12 col-sm-6">
              <div class="form-check mt-1">
                <input class="form-check-input" type="checkbox"
                       id="gs-b3-${id}" ${q.best_thirds_enabled ? 'checked' : ''}>
                <label class="form-check-label" for="gs-b3-${id}">Best third-placed teams qualify</label>
              </div>
            </div>
          </div>
          <div id="gs-b3-block-${id}" class="mt-3 gs-b3-subblock ${q.best_thirds_enabled ? '' : 'd-none'}">
            <div class="row g-3 align-items-end">
              <div class="col-6 col-sm-3">
                <label class="form-label">No. of thirds</label>
                <input type="number" class="form-control form-control-sm"
                       id="gs-b3-count-${id}" value="${q.best_thirds_count || 4}" min="1" max="32">
              </div>
              <div class="col-12">
                <div class="editor-info-note">
                  i A <strong>Best 3rds (virtual)</strong> round will be added after this stage
                  in Step 6 to configure ranking rules and the correspondence table.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Tiebreaker list ──────────────────────────────────────────
  function _renderTiebreakers(wrap, round) {
    const list = wrap.querySelector(`#gs-tb-list-${round.id}`);
    if (!list) return;
    const tbs = round.config.ranking_rules.tiebreakers;
    if (tbs.length === 0) {
      list.innerHTML = '<div class="tb-empty">No tiebreakers defined.</div>';
      return;
    }
    list.innerHTML = '';
    tbs.forEach((key, i) => {
      const item = document.createElement('div');
      item.className = 'tb-item';
      item.innerHTML = `
        <span class="tb-order">${i + 1}</span>
        <span class="tb-label">${TB_LABELS[key] || key}</span>
        <div class="tb-actions">
          <button class="btn btn-icon tb-up"   title="Move up"   ${i === 0            ? 'disabled' : ''}>&#x2191;</button>
          <button class="btn btn-icon tb-down" title="Move down" ${i === tbs.length-1 ? 'disabled' : ''}>&#x2193;</button>
          <button class="btn btn-icon btn-icon-del tb-remove" title="Remove">&#x2715;</button>
        </div>
      `;
      item.querySelector('.tb-up').addEventListener('click',     () => _moveTb(round, i, -1, wrap));
      item.querySelector('.tb-down').addEventListener('click',   () => _moveTb(round, i,  1, wrap));
      item.querySelector('.tb-remove').addEventListener('click', () => _removeTb(round, i, wrap));
      list.appendChild(item);
    });
  }

  function _refreshTbSelect(wrap, round) {
    const sel = wrap.querySelector(`#gs-tb-sel-${round.id}`);
    if (!sel) return;
    const used = new Set(round.config.ranking_rules.tiebreakers);
    sel.innerHTML = ALL_TB_KEYS.filter(k => !used.has(k))
      .map(k => `<option value="${k}">${TB_LABELS[k]}</option>`).join('');
    const addBtn = wrap.querySelector(`#gs-tb-add-${round.id}`);
    if (addBtn) addBtn.disabled = sel.options.length === 0;
  }

  function _moveTb(round, idx, dir, wrap) {
    const tbs = round.config.ranking_rules.tiebreakers;
    const ni  = idx + dir;
    if (ni < 0 || ni >= tbs.length) return;
    [tbs[idx], tbs[ni]] = [tbs[ni], tbs[idx]];
    _configChanged(round); _renderTiebreakers(wrap, round); _refreshTbSelect(wrap, round);
  }

  function _removeTb(round, idx, wrap) {
    round.config.ranking_rules.tiebreakers.splice(idx, 1);
    _configChanged(round); _renderTiebreakers(wrap, round); _refreshTbSelect(wrap, round);
  }

  // ── Config event binding ─────────────────────────────────────
  function _bindConfigEvents(wrap, round) {
    const c = round.config, r = c.ranking_rules, q = c.qualifiers, id = round.id;

    _on(wrap, `#gs-num-groups-${id}`, 'input', e => {
      c.num_groups = _int(e.target.value, 1); _configChanged(round);
      _syncGroups(round);
      const con = wrap.querySelector('.gs-assign-container');
      if (con) _renderGroupsGrid(con, round);
    });
    _on(wrap, `#gs-teams-${id}`, 'input', e => {
      c.teams_per_group = _int(e.target.value, 2); _configChanged(round);
      _syncGroups(round);
      const con = wrap.querySelector('.gs-assign-container');
      if (con) _renderGroupsGrid(con, round);
    });
    _on(wrap, `#gs-pts-win-${id}`,  'input', e => { r.points_win  = _int(e.target.value); _configChanged(round); });
    _on(wrap, `#gs-pts-draw-${id}`, 'input', e => { r.points_draw = _int(e.target.value); _configChanged(round); });
    _on(wrap, `#gs-pts-loss-${id}`, 'input', e => { r.points_loss = _int(e.target.value); _configChanged(round); });
    _on(wrap, `#gs-tb-add-${id}`, 'click', () => {
      const sel = wrap.querySelector(`#gs-tb-sel-${id}`);
      if (sel && sel.value) {
        r.tiebreakers.push(sel.value); _configChanged(round);
        _renderTiebreakers(wrap, round); _refreshTbSelect(wrap, round);
      }
    });
    _on(wrap, `#gs-topn-${id}`, 'input', e => { q.top_n_per_group = _int(e.target.value, 1); _configChanged(round); });
    _on(wrap, `#gs-b3-${id}`, 'change', e => {
      q.best_thirds_enabled = e.target.checked;
      wrap.querySelector(`#gs-b3-block-${id}`)?.classList.toggle('d-none', !e.target.checked);
      _configChanged(round);
      // Create or remove the linked virtual round
      if (typeof syncBestThirdsRound === 'function') syncBestThirdsRound(round);
    });
    _on(wrap, `#gs-b3-count-${id}`, 'input', e => {
      q.best_thirds_count = _int(e.target.value, 1);
      _configChanged(round);
      // Keep virtual round in sync
      if (typeof syncBestThirdsRound === 'function' && q.best_thirds_enabled) syncBestThirdsRound(round);
    });
  }

  // ── Team Assignment tab ──────────────────────────────────────
  function _renderAssignment(container, round) {
    _syncGroups(round);
    const teams    = (typeof state !== 'undefined' ? state.teams : []) || [];
    const assigned = _assignedSet(round);
    const selected = container.dataset.selected || '';
    const search   = (container.dataset.search  || '').toLowerCase();
    const total    = round.config.num_groups * round.config.teams_per_group;

    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'assignment-toolbar';
    toolbar.innerHTML = `
      <input type="text" class="form-control form-control-sm assign-search"
             placeholder="Search teams..." style="max-width:200px" value="${_esc(search)}">
      <button class="btn btn-outline-secondary btn-sm assign-load-btn">Load teams CSV</button>
      <input type="file" class="assign-file-input" accept=".csv" style="display:none">
      <span class="assignment-status ms-auto">${assigned.size} / ${total} assigned</span>
    `;
    container.appendChild(toolbar);

    // Instruction bar
    if (selected) {
      const instr = document.createElement('div');
      instr.className = 'assign-instruction';
      instr.innerHTML = `Click an empty slot to assign <strong>${_esc(selected)}</strong>
        &nbsp;<button class="btn btn-sm btn-link p-0 assign-cancel-btn">Cancel</button>`;
      container.appendChild(instr);
    }

    // Team pool or no-teams message
    if (teams.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'assign-no-teams';
      msg.innerHTML = 'No teams loaded. Click <strong>Load teams CSV</strong> to continue.';
      container.appendChild(msg);
    } else {
      const pool = document.createElement('div');
      pool.className = 'team-pool';
      _fillTeamPool(pool, round, teams, assigned, selected, search);
      container.appendChild(pool);
    }

    // Groups grid
    const grid = document.createElement('div');
    grid.className = 'groups-grid';
    _fillGroupsGrid(grid, round, selected);
    container.appendChild(grid);

    _bindAssignmentEvents(container, round);
  }

  function _renderGroupsGrid(container, round) {
    const oldGrid = container.querySelector('.groups-grid');
    if (!oldGrid) return;
    const selected = container.dataset.selected || '';
    const newGrid  = document.createElement('div');
    newGrid.className = 'groups-grid';
    _fillGroupsGrid(newGrid, round, selected);
    oldGrid.replaceWith(newGrid);
    _bindGroupGridEvents(newGrid, container, round);
    _bindGroupDnD(newGrid, container, round);
  }

  function _fillGroupsGrid(grid, round, selected) {
    const t = round.config.teams_per_group;
    Object.entries(round.groups).forEach(([letter, members]) => {
      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `<div class="group-card-header">Group ${letter}</div>`;
      for (let i = 0; i < t; i++) {
        const team = members[i];
        const slot = document.createElement('div');
        if (team) {
          slot.className     = 'group-slot filled';
          slot.dataset.group = letter;
          slot.dataset.team  = team;
          slot.title         = 'Drag to move · click to remove';
          slot.textContent   = team;
          slot.draggable     = true;
        } else {
          slot.className    = 'group-slot empty' + (selected ? ' drop-target' : '');
          slot.dataset.group = letter;
          slot.textContent   = selected ? '<- assign' : '--';
        }
        card.appendChild(slot);
      }
      grid.appendChild(card);
    });
  }

  function _bindAssignmentEvents(container, round) {
    // Search: partial pool refresh only — preserves focus on the input
    container.querySelector('.assign-search')?.addEventListener('input', e => {
      container.dataset.search = e.target.value;
      _refreshTeamPool(container, round);
    });
    container.querySelector('.assign-load-btn')?.addEventListener('click', () => {
      container.querySelector('.assign-file-input').click();
    });
    container.querySelector('.assign-file-input')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (typeof state !== 'undefined') state.teams = await TeamsLoader.loadFromFile(file);
        _renderAssignment(container, round);
      } catch { alert('Failed to load teams CSV.'); }
      e.target.value = '';
    });
    container.querySelector('.assign-cancel-btn')?.addEventListener('click', () => {
      delete container.dataset.selected; _renderAssignment(container, round);
    });
    _bindPoolEvents(container.querySelector('.team-pool'), container, round);
    _bindGroupGridEvents(container.querySelector('.groups-grid'), container, round);
    _bindGroupDnD(container.querySelector('.groups-grid'), container, round);
  }

  function _bindGroupGridEvents(grid, container, round) {
    if (!grid) return;
    grid.addEventListener('click', e => {
      const slot     = e.target.closest('.group-slot');
      if (!slot) return;
      const group    = slot.dataset.group;
      const selected = container.dataset.selected;
      if (slot.classList.contains('filled')) {
        const arr = round.groups[group];
        const idx = arr.indexOf(slot.dataset.team);
        if (idx >= 0) arr.splice(idx, 1);
        delete container.dataset.selected;
        _assignmentChanged(round); _renderAssignment(container, round);
      } else if (selected) {
        if (!round.groups[group]) round.groups[group] = [];
        if (round.groups[group].length < round.config.teams_per_group) {
          round.groups[group].push(selected);
          delete container.dataset.selected;
          _assignmentChanged(round); _renderAssignment(container, round);
        }
      }
    });
  }

  // ── Pool helpers ─────────────────────────────────────────────

  function _fillTeamPool(pool, round, teams, assigned, selected, search) {
    pool.innerHTML = '';
    const filtered = search ? teams.filter(t => t.name.toLowerCase().includes(search)) : teams;
    filtered.forEach(t => {
      const isAssigned = assigned.has(t.name);
      const isSelected = t.name === selected;
      let groupLetter = '';
      if (isAssigned) {
        for (const [g, members] of Object.entries(round.groups)) {
          if (members.includes(t.name)) { groupLetter = g; break; }
        }
      }
      const chip = document.createElement('span');
      chip.className  = 'team-chip' + (isAssigned ? ' assigned' : '') + (isSelected ? ' selected' : '');
      chip.dataset.team = t.name;
      chip.draggable  = true;
      chip.title = isAssigned
        ? `Group ${groupLetter} — drag to move · click to remove`
        : 'Drag to a slot · click to select';
      chip.innerHTML = `<span class="tc-color" style="background:${_esc(t.color)}"></span>${_esc(t.name)}${isAssigned ? `<span class="tc-group">${groupLetter}</span>` : ''}`;
      pool.appendChild(chip);
    });
  }

  // Rebuild only the pool div — called from search handler so the input keeps focus
  function _refreshTeamPool(container, round) {
    const oldPool = container.querySelector('.team-pool');
    if (!oldPool) return;
    const teams    = (typeof state !== 'undefined' ? state.teams : []) || [];
    const assigned = _assignedSet(round);
    const selected = container.dataset.selected || '';
    const search   = (container.dataset.search  || '').toLowerCase();
    const newPool  = document.createElement('div');
    newPool.className = 'team-pool';
    _fillTeamPool(newPool, round, teams, assigned, selected, search);
    oldPool.replaceWith(newPool);
    _bindPoolEvents(newPool, container, round);
  }

  function _bindPoolEvents(pool, container, round) {
    if (!pool) return;
    // Click: select or remove
    pool.addEventListener('click', e => {
      const chip = e.target.closest('.team-chip');
      if (!chip) return;
      const team = chip.dataset.team;
      if (chip.classList.contains('assigned')) {
        for (const [, members] of Object.entries(round.groups)) {
          const idx = members.indexOf(team);
          if (idx >= 0) { members.splice(idx, 1); break; }
        }
        delete container.dataset.selected;
        _assignmentChanged(round);
      } else {
        container.dataset.selected = (container.dataset.selected === team) ? '' : team;
      }
      _renderAssignment(container, round);
    });
    // DnD sources: chips
    pool.querySelectorAll('.team-chip').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', chip.dataset.team);
        e.dataTransfer.setData('application/x-fromgroup',
          chip.classList.contains('assigned') ? _teamGroup(round, chip.dataset.team) : '');
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    });
    // DnD target: drop on pool removes team from group
    pool.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('application/x-fromgroup')) {
        e.preventDefault();
        pool.classList.add('drag-over');
      }
    });
    pool.addEventListener('dragleave', e => {
      if (!pool.contains(e.relatedTarget)) pool.classList.remove('drag-over');
    });
    pool.addEventListener('drop', e => {
      e.preventDefault();
      pool.classList.remove('drag-over');
      const team      = e.dataTransfer.getData('text/plain');
      const fromGroup = e.dataTransfer.getData('application/x-fromgroup');
      if (!fromGroup) return; // already unassigned
      for (const [, members] of Object.entries(round.groups)) {
        const idx = members.indexOf(team);
        if (idx >= 0) { members.splice(idx, 1); break; }
      }
      _assignmentChanged(round);
      _renderAssignment(container, round);
    });
  }

  function _bindGroupDnD(grid, container, round) {
    if (!grid) return;
    // Filled slots: drag source
    grid.querySelectorAll('.group-slot.filled').forEach(slot => {
      slot.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', slot.dataset.team);
        e.dataTransfer.setData('application/x-fromgroup', slot.dataset.group);
        e.dataTransfer.effectAllowed = 'move';
        slot.classList.add('dragging');
      });
      slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
    });
    // All slots: drop target
    grid.querySelectorAll('.group-slot').forEach(slot => {
      slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const team      = e.dataTransfer.getData('text/plain');
        const fromGroup = e.dataTransfer.getData('application/x-fromgroup');
        const toGroup   = slot.dataset.group;
        if (!team) return;
        if (slot.classList.contains('filled')) {
          const toTeam = slot.dataset.team;
          if (team === toTeam) return;
          // Remove dragged team from source
          for (const [, m] of Object.entries(round.groups)) {
            const i = m.indexOf(team); if (i >= 0) { m.splice(i, 1); break; }
          }
          // Place displaced team into source slot (swap)
          if (fromGroup && fromGroup !== toGroup) {
            (round.groups[fromGroup] = round.groups[fromGroup] || []).push(toTeam);
          }
          // Remove displaced team from target group, add dragged team
          const toArr = round.groups[toGroup] || [];
          const ti = toArr.indexOf(toTeam);
          if (ti >= 0) toArr.splice(ti, 1);
          toArr.push(team);
          round.groups[toGroup] = toArr;
        } else {
          // Empty slot
          if (fromGroup) {
            for (const [, m] of Object.entries(round.groups)) {
              const i = m.indexOf(team); if (i >= 0) { m.splice(i, 1); break; }
            }
          }
          const arr = round.groups[toGroup] || [];
          if (arr.length < round.config.teams_per_group) { arr.push(team); round.groups[toGroup] = arr; }
        }
        delete container.dataset.selected;
        _assignmentChanged(round);
        _renderAssignment(container, round);
      });
    });
  }

  function _teamGroup(round, team) {
    for (const [g, members] of Object.entries(round.groups)) {
      if (members.includes(team)) return g;
    }
    return '';
  }

  // ── Group sync ───────────────────────────────────────────────
  function _syncGroups(round) {
    const letters = _groupLetters(round.config.num_groups);
    if (!round.groups) round.groups = {};
    letters.forEach(l => { if (!round.groups[l]) round.groups[l] = []; });
    Object.keys(round.groups).forEach(k => { if (!letters.includes(k)) delete round.groups[k]; });
    const t = round.config.teams_per_group;
    letters.forEach(l => { round.groups[l] = (round.groups[l] || []).slice(0, t); });
  }

  function _groupLetters(n) {
    return Array.from({ length: n }, (_, i) =>
      i < 26 ? String.fromCharCode(65 + i)
             : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))
    );
  }

  function _assignedSet(round) {
    return new Set(Object.values(round.groups || {}).flat());
  }

  function _configChanged(round) {
    if (typeof setDirty        === 'function') setDirty(true);
    if (typeof updateRoundMeta === 'function') updateRoundMeta(round.id);
  }

  function _assignmentChanged(round) {
    if (typeof setDirty        === 'function') setDirty(true);
    if (typeof updateRoundMeta === 'function') updateRoundMeta(round.id);
  }

  function _matchesChanged(round) {
    if (typeof setDirty        === 'function') setDirty(true);
    if (typeof updateRoundMeta === 'function') updateRoundMeta(round.id);
    if (typeof renderMatches   === 'function') renderMatches();
  }

  // ── Match generation ─────────────────────────────────────────
  function _renderMatchesTab(container, round) {
    const matches = round.matches || [];
    const total   = matches.length;
    container.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'matches-tab-toolbar';
    const possible = _countPossibleMatches(round);
    toolbar.innerHTML = `
      <button class="btn btn-primary btn-sm gs-gen-btn">⚡ Generate matches</button>
      <span class="match-gen-info">
        ${total > 0 ? `${total} match${total !== 1 ? 'es' : ''} generated` : 'No matches yet'}
      </span>
      ${total > 0 ? '<button class="btn btn-outline-danger btn-sm gs-clear-btn">Clear</button>' : ''}
    `;
    container.appendChild(toolbar);

    toolbar.querySelector('.gs-gen-btn').addEventListener('click', () => {
      if (total > 0 && !confirm('Regenerate? Dates for existing pairs will be preserved.')) return;
      round.matches = _generateMatches(round);
      _matchesChanged(round);
      _renderMatchesTab(container, round);
    });
    toolbar.querySelector('.gs-clear-btn')?.addEventListener('click', () => {
      if (!confirm('Clear all matches and dates?')) return;
      round.matches = [];
      _matchesChanged(round);
      _renderMatchesTab(container, round);
    });

    if (total === 0) {
      const msg = document.createElement('div');
      msg.className = 'assign-no-teams mt-2';
      msg.innerHTML = possible > 0
        ? `${possible} match${possible !== 1 ? 'es' : ''} can be generated from current group assignments.`
        : 'Assign teams to groups first, then click <strong>Generate matches</strong>.';
      container.appendChild(msg);
      return;
    }

    // Group matches by letter
    const grouped = {};
    matches.forEach(m => { (grouped[m.group] = grouped[m.group] || []).push(m); });

    Object.entries(grouped).forEach(([letter, gMatches]) => {
      const section = document.createElement('div');
      section.className = 'match-group-section';

      const header = document.createElement('div');
      header.className = 'match-group-header';
      header.textContent = `Group ${letter} \u2014 ${gMatches.length} match${gMatches.length !== 1 ? 'es' : ''}`;
      section.appendChild(header);

      const table = document.createElement('table');
      table.className = 'match-table';
      table.innerHTML = '<thead><tr><th class="match-active-cell" title="Active"></th><th>Home</th><th class="match-vs"></th><th>Away</th><th>Date</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody');

      gMatches.forEach(m => {
        const tr = document.createElement('tr');
        if (m.cancelled) tr.classList.add('match-cancelled');
        tr.innerHTML = `
          <td class="match-active-cell">
            <input type="checkbox" class="match-active-chk" data-match-id="${m.id}"
                   ${m.cancelled ? '' : 'checked'}
                   title="${m.cancelled ? 'Reactivate match' : 'Deactivate match'}">
          </td>
          <td class="match-team">${_esc(m.home || '\u2014')}</td>
          <td class="match-vs">\u2013</td>
          <td class="match-team">${_esc(m.away || '\u2014')}</td>
          <td class="match-date-cell">
            <input type="date" class="form-control form-control-sm match-date-input"
                   data-match-id="${m.id}" value="${m.date || ''}" ${m.cancelled ? 'disabled' : ''}>
          </td>
        `;
        tbody.appendChild(tr);
      });

      table.querySelectorAll('.match-date-input').forEach(inp => {
        inp.addEventListener('change', e => {
          const match = (round.matches || []).find(mx => mx.id === e.target.dataset.matchId);
          if (match) { match.date = e.target.value || null; _matchesChanged(round); }
        });
      });

      table.querySelectorAll('.match-active-chk').forEach(chk => {
        chk.addEventListener('change', e => {
          const match = (round.matches || []).find(mx => mx.id === e.target.dataset.matchId);
          if (!match) return;
          match.cancelled = !e.target.checked;
          const row = e.target.closest('tr');
          row.classList.toggle('match-cancelled', match.cancelled);
          const dateInput = row.querySelector('.match-date-input');
          if (dateInput) dateInput.disabled = match.cancelled;
          e.target.title = match.cancelled ? 'Reactivate match' : 'Deactivate match';
          _matchesChanged(round);
        });
      });

      section.appendChild(table);
      container.appendChild(section);
    });
  }

  function _generateMatches(round) {
    // Preserve existing dates and cancelled status for unchanged home/away pairs
    const saved = {};
    (round.matches || []).forEach(m => {
      if (m.home && m.away)
        saved[`${m.group}|${m.home}|${m.away}`] = { date: m.date, cancelled: m.cancelled };
    });

    const matches = [];
    Object.entries(round.groups || {}).forEach(([letter, members]) => {
      const teams = members.filter(Boolean);
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          const home = teams[i], away = teams[j];
          const prev = saved[`${letter}|${home}|${away}`] || {};
          matches.push({
            id:        `${round.id}_g${letter}_${i}_${j}`,
            group:     letter,
            home,
            away,
            date:      prev.date      ?? null,
            cancelled: prev.cancelled ?? false,
          });
        }
      }
    });
    return matches;
  }

  function _countPossibleMatches(round) {
    return Object.values(round.groups || {}).reduce((sum, members) => {
      const n = members.filter(Boolean).length;
      return sum + (n * (n - 1)) / 2;
    }, 0);
  }

  // Refresh matches tab from outside (e.g. after loading competition)
  function refreshMatches(roundId) {
    const wrap  = document.querySelector(`.gs-editor[data-round-id="${roundId}"]`);
    const round = (typeof state !== 'undefined')
      ? state.competition?.rounds.find(r => r.id === roundId)
      : null;
    if (wrap && round) {
      const con = wrap.querySelector('.gs-matches-container');
      if (con) _renderMatchesTab(con, round);
    }
  }

  function _on(wrap, sel, event, handler) { wrap.querySelector(sel)?.addEventListener(event, handler); }
  function _int(val, fallback = 0) { const n = parseInt(val); return isNaN(n) ? fallback : n; }
  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { buildEditor, refreshAssignment, refreshMatches };

})();

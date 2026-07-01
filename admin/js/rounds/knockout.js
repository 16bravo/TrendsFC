/**
 * TrendsFC Admin — Knockout round editor
 * knockout.js — Step 7 (rev 2: match count, DnD, auto-fill, flags)
 */
(function () {
  'use strict';

  const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

  function _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _getPreviousRounds(round) {
    if (typeof state === 'undefined' || !state.competition) return [];
    const rounds = state.competition.rounds;
    const idx    = rounds.findIndex(r => r.id === round.id);
    return idx > 0 ? rounds.slice(0, idx) : [];
  }

  function _positions(gsRound) {
    const n = gsRound.config?.teams_per_group || 4;
    return Array.from({ length: n }, (_, i) => ORDINALS[i] || `${i + 1}th`);
  }

  function _changed(round) {
    if (typeof setDirty      === 'function') setDirty(true);
    if (typeof renderMatches === 'function') renderMatches();
    const metaEl = document.querySelector(`[data-round-item="${round.id}"] .round-card-meta`);
    if (metaEl && typeof getRoundMeta === 'function') metaEl.textContent = getRoundMeta(round);
  }

  // Tiny flag img — silently hidden if file is missing
  function _flagImg(teamName) {
    const teams = (typeof state !== 'undefined' ? state.teams : []) || [];
    const team  = teams.find(t => t.name === teamName);
    if (!team?.flag) return '';
    return `<img src="../img/flags/${_esc(team.flag)}" class="ko-flag-icon" alt="${_esc(teamName)}" title="${_esc(teamName)}" onerror="this.style.display='none'">`;
  }

  // ── Match count estimation ────────────────────────────────────

  function _estimateMatchCount(round) {
    const prev = _getPreviousRounds(round);
    // If previous round is a knockout, halve its match count
    const lastKo = [...prev].reverse().find(r => r.type === 'knockout');
    if (lastKo) return Math.max(1, Math.floor((lastKo.matches || []).length / 2));
    // Otherwise sum qualifiers from all group stages
    let total = 0;
    prev.forEach(r => {
      if (r.type === 'group_stage') {
        const q = r.config?.qualifiers || {};
        total += (q.top_n_per_group || 2) * (r.config?.num_groups || 0);
        if (q.best_thirds_enabled) total += (q.best_thirds_count || 0);
      }
    });
    if (total < 2) return 2;
    const pow2 = Math.pow(2, Math.ceil(Math.log2(total)));
    return pow2 / 2;
  }

  function _nearestPow2Half(n) {
    if (n < 1) return 1;
    const pow2 = Math.pow(2, Math.ceil(Math.log2(n * 2)));
    return pow2 / 2;
  }

  function _estimateFirstRoundSize(matches) {
    const total = (matches || []).filter(m => !m.id?.endsWith('_m3rd')).length;
    if (total <= 1) return total;
    const p = Math.floor(Math.log2(total));
    return Math.pow(2, p);
  }

  // ── Auto-generate matches ─────────────────────────────────────

  function _generateMatches(round, n) {
    const prev  = _getPreviousRounds(round);
    const lastKo = [...prev].reverse().find(r => r.type === 'knockout');
    const existing = round.matches || [];
    const matches  = [];

    for (let i = 0; i < n; i++) {
      const old = existing[i];
      // Preserve existing slot/date if present
      const slot_home = (old?.slot_home && Object.keys(old.slot_home).length)
        ? old.slot_home
        : lastKo ? { round: lastKo.id, match: (lastKo.matches[i * 2]?.id || undefined), outcome: 'winner' } : {};
      const slot_away = (old?.slot_away && Object.keys(old.slot_away).length)
        ? old.slot_away
        : lastKo ? { round: lastKo.id, match: (lastKo.matches[i * 2 + 1]?.id || undefined), outcome: 'winner' } : {};
      matches.push({
        id:   old?.id || `${round.id}_m${i}`,
        slot_home,
        slot_away,
        date: old?.date || null,
      });
    }
    round.matches = matches;
    // Auto-generate subsequent rounds
    _generateSubsequentRounds(round);
  }

  function _generateSubsequentRounds(round) {
    if (!round.matches || round.matches.length < 2) return;
    const firstRoundSize = _estimateFirstRoundSize(round.matches);
    // Only keep first round matches, delete any subsequent rounds
    round.matches = round.matches.slice(0, firstRoundSize);
    
    let idx = firstRoundSize;
    let prevSize = firstRoundSize;
    let sfMatch1, sfMatch2; // Track semifinal matches for 3rd place

    while (prevSize > 1) {
      const nextSize = prevSize / 2;
      for (let i = 0; i < nextSize; i++) {
        const homeMatchId = round.matches[idx - prevSize + i * 2]?.id;
        const awayMatchId = round.matches[idx - prevSize + i * 2 + 1]?.id;
        const matchObj = {
          id:        `${round.id}_m${idx + i}`,
          slot_home: homeMatchId ? { round: round.id, match: homeMatchId, outcome: 'winner' } : {},
          slot_away: awayMatchId ? { round: round.id, match: awayMatchId, outcome: 'winner' } : {},
          date:      null,
        };
        round.matches.push(matchObj);
        // Track semifinal matches (when nextSize === 1 and prevSize === 4)
        if (nextSize === 2 && prevSize === 4) {
          if (i === 0) sfMatch1 = matchObj;
          else sfMatch2 = matchObj;
        }
      }
      idx += nextSize;
      prevSize = nextSize;
    }

    // Add 3rd place match if enabled
    if (round.config?.third_place_match && sfMatch1 && sfMatch2) {
      round.matches.push({
        id:        `${round.id}_m3rd`,
        slot_home: { round: round.id, match: sfMatch1.id, outcome: 'loser' },
        slot_away: { round: round.id, match: sfMatch2.id, outcome: 'loser' },
        date:      null,
      });
    }
  }

  function _toggleThirdPlaceMatch(round) {
    if (!round.matches) return;
    
    const existingThirdPlace = round.matches.find(m => m.id?.endsWith('_m3rd'));
    
    if (round.config?.third_place_match && !existingThirdPlace) {
      // Find semifinal matches
      const firstRoundSize = _estimateFirstRoundSize(round.matches);
      let idx = firstRoundSize;
      let prevSize = firstRoundSize;
      let sfMatch1, sfMatch2;
      
      while (prevSize > 1) {
        const nextSize = prevSize / 2;
        if (nextSize === 2 && prevSize === 4) {
          const sfStart = idx;
          sfMatch1 = round.matches[sfStart];
          sfMatch2 = round.matches[sfStart + 1];
          break;
        }
        idx += prevSize / 2;
        prevSize /= 2;
      }
      
      if (sfMatch1 && sfMatch2) {
        round.matches.push({
          id:        `${round.id}_m3rd`,
          slot_home: { round: round.id, match: sfMatch1.id, outcome: 'loser' },
          slot_away: { round: round.id, match: sfMatch2.id, outcome: 'loser' },
          date:      null,
        });
      }
    } else if (!round.config?.third_place_match && existingThirdPlace) {
      // Remove 3rd place match
      round.matches = round.matches.filter(m => !m.id?.endsWith('_m3rd'));
    }
  }

  function _getRoundStages(matches) {
    if (!matches?.length) return [];
    const firstRoundSize = _estimateFirstRoundSize(matches);
    const stages = [];
    
    // Separate 3rd place match if present
    const thirdPlaceMatch = matches.find(m => m.id?.endsWith('_m3rd'));
    const regularMatches = matches.filter(m => !m.id?.endsWith('_m3rd'));
    
    let idx = firstRoundSize, stageSize = firstRoundSize / 2;
    stages.push({ name: 'First Round', matches: regularMatches.slice(0, firstRoundSize), startIdx: 0 });
    
    while (stageSize >= 1 && idx < regularMatches.length) {
      const end = Math.min(idx + stageSize, regularMatches.length);
      stages.push({ name: _stageName(end - idx), matches: regularMatches.slice(idx, end), startIdx: idx });
      idx = end;
      stageSize /= 2;
    }
    
    // Insert 3rd place match between semifinals and final
    if (thirdPlaceMatch) {
      const finalStageIdx = stages.length - 1;
      stages.splice(finalStageIdx, 0, {
        name: '3rd Place Match',
        matches: [thirdPlaceMatch],
        startIdx: -1,
        isThirdPlace: true
      });
    }
    
    return stages;
  }

  function _stageName(count) {
    if (count === 1) return 'Final';
    if (count === 2) return 'Semifinals';
    if (count === 4) return 'Quarterfinals';
    if (count === 8) return 'Round of 16';
    if (count === 16) return 'Round of 32';
    if (count === 32) return 'Round of 64';
    return `${count} matches`;
  }

  function _slotDisplay(slot, roundId) {
    if (!slot || !Object.keys(slot).length) return '<span class="text-muted">TBD</span>';
    if (slot.round === roundId && slot.match && slot.outcome) {
      const outcome = slot.outcome === 'loser' ? 'Loser' : 'Winner';
      return `<span class="ko-slot-readonly">${outcome} of</span>`;
    }
    return '<span class="text-muted">–</span>';
  }

  function _formatSlotRef(slot, round) {
    if (!slot || !Object.keys(slot).length) return '<span class="text-muted">TBD</span>';

    // Reference to own knockout round
    if (slot.round === round.id && slot.match) {
      const outcome = slot.outcome === 'loser' ? 'Loser' : 'Winner';
      const idx = (round.matches.findIndex(m => m.id === slot.match) + 1) || '?';
      return `<strong>${outcome} M${idx}</strong>`;
    }

    // Reference to previous round
    if (slot.round && slot.round !== round.id) {
      if (slot.group !== undefined && slot.position !== undefined) {
        return `<span class="text-muted">${slot.group}${slot.position}</span>`;
      }
      return `<span class="text-muted">Qualifier</span>`;
    }

    return '<span class="text-muted">—</span>';
  }

  // ── Slot sub-fields ──────────────────────────────────────────

  function _buildSubFields(container, slot, sourceRound, round) {
    container.innerHTML = '';
    if (!sourceRound) return;

    if (sourceRound.type === 'group_stage') {
      const groups    = Object.keys(sourceRound.groups || {}).sort();
      const positions = _positions(sourceRound);

      const groupSel = document.createElement('select');
      groupSel.className = 'form-select form-select-sm ko-slot-group';
      groupSel.innerHTML = '<option value="">Grp?</option>'
        + groups.map(g => `<option value="${g}" ${slot.group === g ? 'selected' : ''}>Group ${_esc(g)}</option>`).join('');

      const posSel = document.createElement('select');
      posSel.className = 'form-select form-select-sm ko-slot-pos';
      posSel.innerHTML = '<option value="">Pos?</option>'
        + positions.map(p => `<option value="${p}" ${slot.position === p ? 'selected' : ''}>${_esc(p)}</option>`).join('');

      // Flag preview row — shows mini flags for teams in selected group
      const flagRow = document.createElement('div');
      flagRow.className = 'ko-flag-row';

      function _updateFlags(letter) {
        flagRow.innerHTML = '';
        if (!letter) return;
        const members = sourceRound.groups[letter] || [];
        members.filter(Boolean).forEach(team => {
          const img = _flagImg(team);
          if (img) flagRow.insertAdjacentHTML('beforeend', img);
        });
      }
      _updateFlags(slot.group || '');

      container.appendChild(groupSel);
      container.appendChild(posSel);
      container.appendChild(flagRow);

      groupSel.addEventListener('change', e => {
        slot.group = e.target.value || undefined;
        _updateFlags(e.target.value);
        _changed(round);
      });
      posSel.addEventListener('change', e => { slot.position = e.target.value || undefined; _changed(round); });

    } else if (sourceRound.type === 'best_thirds_ranking') {
      const note = document.createElement('div');
      note.className = 'ko-slot-note';
      note.textContent = 'Resolved by mapping file';
      container.appendChild(note);
      delete slot.position;

    } else if (sourceRound.type === 'knockout') {
      const srcMatches = sourceRound.matches || [];
      const matchSel   = document.createElement('select');
      matchSel.className = 'form-select form-select-sm ko-slot-match';
      matchSel.innerHTML = '<option value="">Match?</option>'
        + srcMatches.map((sm, i) =>
            `<option value="${_esc(sm.id)}" ${slot.match === sm.id ? 'selected' : ''}>Match ${i + 1}</option>`
          ).join('');

      const outcomeSel = document.createElement('select');
      outcomeSel.className = 'form-select form-select-sm ko-slot-outcome';
      outcomeSel.innerHTML = `
        <option value="winner" ${(slot.outcome || 'winner') === 'winner' ? 'selected' : ''}>Winner</option>
        <option value="loser"  ${slot.outcome === 'loser' ? 'selected' : ''}>Loser</option>
      `;

      container.appendChild(matchSel);
      container.appendChild(outcomeSel);

      matchSel  .addEventListener('change', e => { slot.match   = e.target.value || undefined; _changed(round); });
      outcomeSel.addEventListener('change', e => { slot.outcome = e.target.value;               _changed(round); });
    }
  }

  // ── Slot picker cell ─────────────────────────────────────────

  function _buildSlotPicker(cell, match, slotKey, round) {
    const slot       = match[slotKey] = match[slotKey] || {};
    const prevRounds = _getPreviousRounds(round);

    const roundSel = document.createElement('select');
    roundSel.className = 'form-select form-select-sm ko-slot-round';
    roundSel.innerHTML = '<option value="">— source —</option>'
      + prevRounds.map(r =>
          `<option value="${_esc(r.id)}" ${r.id === slot.round ? 'selected' : ''}>${_esc(r.name)}</option>`
        ).join('');
    cell.appendChild(roundSel);

    const sub = document.createElement('div');
    sub.className = 'ko-slot-sub';
    cell.appendChild(sub);

    const selectedRound = prevRounds.find(r => r.id === slot.round);
    _buildSubFields(sub, slot, selectedRound, round);

    roundSel.addEventListener('change', e => {
      match[slotKey] = { round: e.target.value };
      const newSrc   = prevRounds.find(r => r.id === e.target.value);
      _buildSubFields(sub, match[slotKey], newSrc, round);
      _changed(round);
    });
  }

  // ── Match table ───────────────────────────────────────────────

  function _renderMatches(container, round) {
    container.innerHTML = '';
    const matches  = round.matches || [];
    const estimate = _estimateMatchCount(round);

    // ── Toolbar ──
    const toolbar = document.createElement('div');
    toolbar.className = 'ko-matches-toolbar mb-2';
    toolbar.innerHTML = `
      <span class="form-label mb-0">Matches</span>
      <div class="d-flex align-items-center gap-2">
        <input type="number" class="form-control form-control-sm ko-match-count"
               value="${matches.length || estimate}" min="1" max="128" style="width:70px"
               title="Number of matches">
        <button class="btn btn-outline-secondary btn-sm ko-estimate-btn"
                title="Suggest based on previous rounds">Estimate</button>
        <button class="btn btn-outline-primary btn-sm ko-generate-btn">Generate</button>
        <button class="btn btn-outline-secondary btn-sm ko-add-btn" title="Add one match">+ 1</button>
      </div>
    `;
    container.appendChild(toolbar);

    const countInput = toolbar.querySelector('.ko-match-count');

    toolbar.querySelector('.ko-estimate-btn').addEventListener('click', () => {
      countInput.value = _estimateMatchCount(round);
    });

    toolbar.querySelector('.ko-generate-btn').addEventListener('click', () => {
      const n = Math.max(1, parseInt(countInput.value) || 1);
      _generateMatches(round, n);
      _changed(round);
      _renderMatches(container, round);
    });

    toolbar.querySelector('.ko-add-btn').addEventListener('click', () => {
      round.matches = round.matches || [];
      round.matches.push({ id: `${round.id}_m${round.matches.length}`, slot_home: {}, slot_away: {}, date: null });
      countInput.value = round.matches.length;
      _changed(round);
      _renderMatches(container, round);
    });

    if (matches.length === 0) {
      const note = document.createElement('div');
      note.className = 'text-muted small mt-1';
      note.textContent = 'No matches yet. Set the count and click Generate, or use + 1.';
      container.appendChild(note);
      return;
    }

    // Render all stages
    const stages = _getRoundStages(matches);
    const firstRoundSize = stages.length > 0 ? stages[0].matches.length : matches.length;
    const firstRound = stages[0];
    const subseqStages = stages.slice(1);

    // ── First Round (Editable) ──
    const table1 = document.createElement('table');
    table1.className = 'match-table ko-match-table';
    table1.innerHTML = `<thead><tr>
      <th colspan="7" class="ko-stage-header">First Round (${firstRound.matches.length} matches)</th>
    </tr><tr>
      <th class="ko-drag-th"></th>
      <th class="ko-num">#</th>
      <th>Home slot</th>
      <th class="match-vs"></th>
      <th>Away slot</th>
      <th>Date</th>
      <th></th>
    </tr></thead><tbody></tbody>`;
    const tbody1 = table1.querySelector('tbody');

    firstRound.matches.forEach((m, i) => {
      const tr = document.createElement('tr');
      tr.dataset.matchId = m.id;
      tr.draggable = true;
      tr.innerHTML = `
        <td class="ko-drag-handle" title="Drag to reorder">⠿</td>
        <td class="ko-num text-muted">${i + 1}</td>
        <td class="ko-slot-cell" id="ko-home-${m.id}"></td>
        <td class="match-vs">–</td>
        <td class="ko-slot-cell" id="ko-away-${m.id}"></td>
        <td class="match-date-cell">
          <input type="date" class="form-control form-control-sm ko-date"
                 data-match-id="${_esc(m.id)}" value="${m.date || ''}">
        </td>
        <td class="text-end">
          <button class="btn btn-icon btn-icon-del ko-del-btn"
                  data-match-id="${_esc(m.id)}" title="Remove match">✕</button>
        </td>
      `;
      tbody1.appendChild(tr);
      _buildSlotPicker(tr.querySelector(`#ko-home-${m.id}`), m, 'slot_home', round);
      _buildSlotPicker(tr.querySelector(`#ko-away-${m.id}`), m, 'slot_away', round);
    });

    table1.querySelectorAll('.ko-date').forEach(inp => {
      inp.addEventListener('change', e => {
        const match = round.matches.find(mx => mx.id === e.target.dataset.matchId);
        if (match) { match.date = e.target.value || null; _changed(round); }
      });
    });

    table1.querySelectorAll('.ko-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        round.matches = round.matches.filter(mx => mx.id !== btn.dataset.matchId);
        _changed(round);
        _renderMatches(container, round);
      });
    });

    // Drag-to-reorder for first round
    let dragSrc = null;
    tbody1.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('dragstart', e => {
        dragSrc = tr;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tr.dataset.matchId);
        tr.classList.add('ko-row-dragging');
      });
      tr.addEventListener('dragend', () => {
        tbody1.querySelectorAll('tr').forEach(r => r.classList.remove('ko-row-drag-over', 'ko-row-dragging'));
        dragSrc = null;
      });
      tr.addEventListener('dragover', e => {
        if (!dragSrc || dragSrc === tr) return;
        e.preventDefault();
        tbody1.querySelectorAll('tr').forEach(r => r.classList.remove('ko-row-drag-over'));
        tr.classList.add('ko-row-drag-over');
      });
      tr.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragSrc || dragSrc === tr) return;
        const srcId = dragSrc.dataset.matchId;
        const tgtId = tr.dataset.matchId;
        const srcIdx = round.matches.findIndex(mx => mx.id === srcId);
        const tgtIdx = round.matches.findIndex(mx => mx.id === tgtId);
        if (srcIdx < 0 || tgtIdx < 0 || srcIdx >= firstRoundSize || tgtIdx >= firstRoundSize) return;
        const [moved] = round.matches.splice(srcIdx, 1);
        round.matches.splice(tgtIdx, 0, moved);
        _changed(round);
        _renderMatches(container, round);
      });
    });

    container.appendChild(table1);

    // ── Subsequent Rounds (Read-only slots, editable dates) ──
    subseqStages.forEach(stage => {
      const tableN = document.createElement('table');
      tableN.className = 'match-table ko-match-table ko-match-table-subseq';
      
      // Special handling for 3rd place match
      if (stage.isThirdPlace) {
        tableN.innerHTML = `<thead><tr>
          <th colspan="6" class="ko-stage-header">${_esc(stage.name)}</th>
        </tr><tr>
          <th class="ko-num">#</th>
          <th colspan="3" class="text-center">Matchup</th>
          <th>Date</th>
          <th></th>
        </tr></thead><tbody></tbody>`;
      } else {
        tableN.innerHTML = `<thead><tr>
          <th colspan="6" class="ko-stage-header">${_esc(stage.name)} (${stage.matches.length} matches)</th>
        </tr><tr>
          <th class="ko-num">#</th>
          <th colspan="3" class="text-center">Matchup</th>
          <th>Date</th>
          <th></th>
        </tr></thead><tbody></tbody>`;
      }
      
      const tbodyN = tableN.querySelector('tbody');

      stage.matches.forEach((m, i) => {
        const homeSlot = m.slot_home;
        const awaySlot = m.slot_away;
        const homeDisplay = _formatSlotRef(homeSlot, round);
        const awayDisplay = _formatSlotRef(awaySlot, round);
        
        const matchNum = stage.isThirdPlace ? '3rd' : (stage.startIdx + i + 1);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="ko-num text-muted">${matchNum}</td>
          <td class="ko-slot-ro text-end">${homeDisplay}</td>
          <td class="text-center ko-vs">vs</td>
          <td class="ko-slot-ro">${awayDisplay}</td>
          <td class="match-date-cell">
            <input type="date" class="form-control form-control-sm ko-date-subseq"
                   data-match-id="${_esc(m.id)}" value="${m.date || ''}">
          </td>
          <td class="text-end">
            <button class="btn btn-icon btn-icon-del ko-del-btn"
                    data-match-id="${_esc(m.id)}" title="Remove">✕</button>
          </td>
        `;
        tbodyN.appendChild(tr);
      });

      tableN.querySelectorAll('.ko-date-subseq').forEach(inp => {
        inp.addEventListener('change', e => {
          const match = round.matches.find(mx => mx.id === e.target.dataset.matchId);
          if (match) { match.date = e.target.value || null; _changed(round); }
        });
      });

      tableN.querySelectorAll('.ko-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          round.matches = round.matches.filter(mx => mx.id !== btn.dataset.matchId);
          _changed(round);
          _renderMatches(container, round);
        });
      });

      container.appendChild(tableN);
    });
  }

  // ── Build full editor ─────────────────────────────────────────

  function buildEditor(round) {
    const wrap = document.createElement('div');
    wrap.className = 'ko-editor';
    wrap.dataset.roundId = round.id;

    round.config  = round.config  || {};
    round.matches = round.matches || [];
    const cfg = round.config;
    cfg.legs       = cfg.legs       ?? 1;
    cfg.extra_time = cfg.extra_time ?? true;
    cfg.penalties  = cfg.penalties  ?? true;
    cfg.replay     = cfg.replay     ?? false;
    cfg.third_place_match = cfg.third_place_match ?? false;

    const id = round.id;

    wrap.innerHTML = `
      <div class="ko-config-bar mb-3">
        <div class="ko-config-group">
          <span class="form-label mb-0 me-2">Legs</span>
          <div class="btn-group btn-group-sm" role="group">
            <input type="radio" class="btn-check" name="ko-legs-${id}" id="ko-legs1-${id}" value="1" ${cfg.legs !== 2 ? 'checked' : ''}>
            <label class="btn btn-outline-secondary" for="ko-legs1-${id}">1 leg</label>
            <input type="radio" class="btn-check" name="ko-legs-${id}" id="ko-legs2-${id}" value="2" ${cfg.legs === 2 ? 'checked' : ''}>
            <label class="btn btn-outline-secondary" for="ko-legs2-${id}">2 legs</label>
          </div>
        </div>
        <div class="ko-config-group">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="ko-et-${id}" ${cfg.extra_time ? 'checked' : ''}>
            <label class="form-check-label" for="ko-et-${id}">Extra time</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="ko-pk-${id}" ${cfg.penalties ? 'checked' : ''}>
            <label class="form-check-label" for="ko-pk-${id}">Penalties</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="ko-rep-${id}" ${cfg.replay ? 'checked' : ''}>
            <label class="form-check-label" for="ko-rep-${id}">Replay</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="ko-3rd-${id}" ${cfg.third_place_match ? 'checked' : ''}>
            <label class="form-check-label" for="ko-3rd-${id}">3rd place match</label>
          </div>
        </div>
      </div>
      <div class="ko-matches-wrap" id="ko-mwrap-${id}"></div>
    `;

    wrap.querySelectorAll(`[name="ko-legs-${id}"]`).forEach(r =>
      r.addEventListener('change', e => { cfg.legs = parseInt(e.target.value); _changed(round); })
    );
    wrap.querySelector(`#ko-et-${id}` ).addEventListener('change', e => { cfg.extra_time = e.target.checked; _changed(round); });
    wrap.querySelector(`#ko-pk-${id}` ).addEventListener('change', e => { cfg.penalties  = e.target.checked; _changed(round); });
    wrap.querySelector(`#ko-rep-${id}`).addEventListener('change', e => { cfg.replay     = e.target.checked; _changed(round); });
    wrap.querySelector(`#ko-3rd-${id}`).addEventListener('change', e => {
      cfg.third_place_match = e.target.checked;
      _toggleThirdPlaceMatch(round);
      _changed(round);
      _renderMatches(wrap.querySelector(`#ko-mwrap-${id}`), round);
    });

    _renderMatches(wrap.querySelector(`#ko-mwrap-${id}`), round);

    return wrap;
  }

  window.KnockoutEditor = { buildEditor };
})();

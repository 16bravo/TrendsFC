/**
 * Tournament Simulation Engine
 * TrendsFC - 2024
 */

let realResults = {};
let knockoutOverrides = {};
let groupOverrides = {};
let currentCompetition = null;
let teamRankings = {}; // Cache for team historical data
let teamTricodes = {}; // Cache for mapping Name -> Tricode (flags)
let teamNameMapping = {}; // Cache for mapping historical names -> reference_team (for data loading)
let involvedTeams = new Set();
let allDates = []; // Array of YYYY-MM-DD strings for the slider

/**
 * CORE LOGIC: Score Prediction & Real Score Lookup
 */

/**
 * Load team tricode mapping and historical name mapping from teams.csv
 */
async function loadTeamTricodes() {
    try {
        const resp = await fetch('data/temp/teams.csv');
        if (!resp.ok) return;
        const text = await resp.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        const triIdx = headers.indexOf('tricode');
        const nameIdx = headers.indexOf('team');
        const refIdx = headers.indexOf('reference_team');
        
        lines.slice(1).forEach(line => {
            const values = line.split(',');
            if (values[nameIdx] && values[triIdx]) {
                teamTricodes[values[nameIdx].trim()] = values[triIdx].trim();
            }
            // Create mapping: historical_name -> reference_team (for data loading)
            if (values[nameIdx] && values[refIdx]) {
                const historicalName = values[nameIdx].trim();
                const referenceName = values[refIdx].trim();
                // Only add if they differ (to map historical names to current names)
                if (historicalName !== referenceName) {
                    teamNameMapping[historicalName] = referenceName;
                }
            }
        });
        console.log("Team tricodes and name mappings loaded.");
    } catch (e) {
        console.warn("Could not load tricode mapping:", e);
    }
}

/**
 * Normalize team name: map historical names to their current reference name for data loading
 * @param {string} teamName - The team name (possibly historical)
 * @returns {string} The normalized reference team name
 */
function getNormalizedTeamName(teamName) {
    return teamNameMapping[teamName] || teamName;
}

/**
 * Get team ratings at a specific date
 * @param {string} team 
 * @param {string} date 
 */
function getTeamRatingsAtDate(team, date) {
    // Normalize the team name (historical -> reference)
    const normalizedTeam = getNormalizedTeamName(team);
    const historical = teamRankings[normalizedTeam];
    if (!historical || historical.length === 0) return { off: 999, def: 999 };

    // Find the latest entry that is matching or before the target date
    // Rankings are stored in descending chronological order (newest first)
    for (let i = 0; i < historical.length; i++) {
        const entry = historical[i];
        if (entry.date <= date) {
            // User requested to take the "next" ranking in the list (the one after the match)
            // In a descending list, the "next" in chronological order is the PREVIOUS index (i-1)
            const nextEntry = (i > 0) ? historical[i - 1] : entry;
            
            return {
                rank: nextEntry.rank || 999,
                off: nextEntry.ranking_off || 999,
                def: nextEntry.ranking_def || 999
            };
        }
    }

    // Default to the oldest available if the date is very far in the past
    const oldest = historical[historical.length - 1];
    return { rank: oldest.rank || 999, off: oldest.ranking_off || 999, def: oldest.ranking_def || 999 };
}

/**
 * Predict match score based on TrendsFC formula
 */
function predictMatchScore(team1, team2, atDate) {
    const r1 = getTeamRatingsAtDate(team1, atDate);
    const r2 = getTeamRatingsAtDate(team2, atDate);

    // TrendsFC Formula: TRUNC((opponent_def - team_off) / 10) + 1
    let goals1 = Math.trunc((r2.def - r1.off) / 10) + 1;
    let goals2 = Math.trunc((r1.def - r2.off) / 10) + 1;

    goals1 = Math.max(0, goals1);
    goals2 = Math.max(0, goals2);

    // Bonus for top-5 offense
    if (r1.off <= 5) goals1 += 1;
    if (r2.off <= 5) goals2 += 1;

    // Polynomial Transformation: y = 0.0049*x^3 - 0.147*x^2 + 1.48*x - 0.39
    const transform = (x) => {
        if (x <= 0) return 0;
        let y = 0.0049 * Math.pow(x, 3) - 0.147 * Math.pow(x, 2) + 1.48 * x - 0.39;
        return Math.max(0, Math.round(y));
    };

    return {
        s1: transform(goals1),
        s2: transform(goals2),
        isPrediction: true
    };
}

/**
 * Get match result (Real if available and played, otherwise Predicted)
 */
function getMatchResult(match, atDate) {
    // 1. Is the match date in the past relative to the slider?
    const matchHasTechnicallyHappened = match.date <= atDate;

    // 2. Check if we have a real result for this match
    const tournamentNamesToTry = [
        currentCompetition.name,
        currentCompetition.name.replace(/ \d{4}$/, ''), 
        "World Cup",
        "World Cup qualifier"
    ];

    for (const compName of tournamentNamesToTry) {
        const dateResults = realResults[compName] ? realResults[compName][match.date] : null;
        if (dateResults && matchHasTechnicallyHappened) {
            // Try with original team names first
            let key = [match.home, match.away].sort().join('|');
            let real = dateResults[key];
            
            // If not found, try with normalized team names
            if (!real) {
                const normalizedHome = getNormalizedTeamName(match.home);
                const normalizedAway = getNormalizedTeamName(match.away);
                key = [normalizedHome, normalizedAway].sort().join('|');
                real = dateResults[key];
            }
            
            if (real) {
                const teams = [match.home, match.away].sort();
                const isHomeFirst = (match.home === teams[0]);
                return {
                    s1: isHomeFirst ? real.s1 : real.s2,
                    s2: isHomeFirst ? real.s2 : real.s1,
                    // On récupère les tirs au but réels s'ils existent dans le JSON (ex: p1, p2)
                    p1: isHomeFirst ? (real.p1 ?? null) : (real.p2 ?? null),
                    p2: isHomeFirst ? (real.p2 ?? null) : (real.p1 ?? null),
                    winner: real.winner || null,
                    matchDate: match.date,
                    isPrediction: false
                };
            }
        }
    }

    // 3. If no real result or match is in the future relative to the slider -> Predict
    return predictMatchScore(match.home, match.away, atDate);
}

/**
 * Initialize the simulation page
 */
async function init() {
    console.log("Initializing Simulation Engine...");

    try {
        await loadTeamTricodes();
        // 1. Load real results (generated by script 035)
        const response = await fetch('data/json/real_results.json');
        if (response.ok) {
            realResults = await response.json();
            console.log("Real results loaded.");
        } else {
            console.warn("Real results file not found. Simulation will rely on predictions only.");
        }

        // 1b. Load knockout overrides (shootout/penalty winners)
        const ovResp = await fetch('data/json/knockout_overrides.json');
        if (ovResp.ok) {
            knockoutOverrides = await ovResp.json();
            console.log("Knockout overrides loaded.");
        }

        // 1c. Load group overrides (fair-play tie-break, etc.)
        const grpResp = await fetch('data/json/group_overrides.json');
        if (grpResp.ok) {
            groupOverrides = await grpResp.json();
            console.log("Group overrides loaded.");
        }

        // 2. Populate Competition Selector
        const compSelect = document.getElementById('compSelect');
        const compResp = await fetch('data/json/competitions/competitions.json');
        if (compResp.ok) {
            const competitions = await compResp.json();
            competitions.forEach(comp => {
                const opt = document.createElement('option');
                opt.value = comp.id;
                opt.textContent = comp.name;
                compSelect.appendChild(opt);
            });
            
            // Auto-load the first one if needed
            if (competitions.length > 0) {
                compSelect.value = competitions[0].id;
                loadCompetition(competitions[0].id, competitions[0].name);
            }

            compSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    const selected = competitions.find(c => c.id === e.target.value);
                    loadCompetition(e.target.value, selected ? selected.name : null);
                }
            });
        }

    } catch (error) {
        console.error("Initialization error:", error);
    }
}

/**
 * Load competition structure and necessary team data
 * @param {string} filename
 * @param {string} [displayName] - Name from competitions.json manifest (e.g. "World Cup 2022")
 */
async function loadCompetition(filename, displayName) {
    console.log(`Loading competition: ${filename}`);
    
    try {
        const response = await fetch(`data/json/competitions/${filename}`);
        if (!response.ok) throw new Error("Failed to load competition JSON");
        
        currentCompetition = await response.json();
        // Use the manifest name (with year) if provided, fallback to internal name
        if (displayName) currentCompetition.name = displayName;
        involvedTeams.clear();

        // Identify all teams participating in the tournament
        if (currentCompetition.rounds) {
            currentCompetition.rounds.forEach(round => {
                if (round.matches) {
                    round.matches.forEach(match => {
                        if (match.home && !match.home.startsWith('_')) involvedTeams.add(match.home);
                        if (match.away && !match.away.startsWith('_')) involvedTeams.add(match.away);
                    });
                }
            });
        }

        console.log(`Involved teams: ${involvedTeams.size}`);

        // 3. Load historical ratings for all involved teams (parallel fetch)
        const teamLoadPromises = Array.from(involvedTeams).map(team => {
            // Normalize team name for file lookup
            const normalizedTeam = getNormalizedTeamName(team);
            return fetch(`data/json/matches/${normalizedTeam.replace(/&/g, '%26')}.json`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data) {
                        // Store under normalized name to ensure consistency
                        teamRankings[normalizedTeam] = data.matches;
                        console.log(`Loaded data for ${team}${team !== normalizedTeam ? ` (normalized: ${normalizedTeam})` : ''}`);
                    }
                })
                .catch(err => console.error(`Error loading data for ${team}:`, err))
        });

        await Promise.all(teamLoadPromises);
        console.log("All team ratings loaded.");

        setupTimeline();

    } catch (error) {
        alert("Error loading competition data.");
        console.error(error);
    }
}

/**
 * Calculate tournament date range and configure the slider
 */
function setupTimeline() {
    let matchDates = [];

    // Collect all dates from groups and knockout rounds
    if (currentCompetition.groups) {
        currentCompetition.groups.forEach(g => {
            if (g.matches) g.matches.forEach(m => matchDates.push(m.date));
        });
    }
    if (currentCompetition.rounds) {
        currentCompetition.rounds.forEach(r => {
            if (r.matches) r.matches.forEach(m => matchDates.push(m.date));
        });
    }

    if (matchDates.length === 0) return;

    matchDates.sort();
    
    // Define start as 1 day before first match, end as the day of the last match
    const startDate = new Date(matchDates[0]);
    startDate.setDate(startDate.getDate() - 1);
    const endDate = new Date(matchDates[matchDates.length - 1]);

    allDates = [];
    let current = new Date(startDate);
    while (current <= endDate) {
        allDates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }

    const slider = document.getElementById('dateRange');
    const display = document.getElementById('currentDateDisplay');
    const sliderGroup = document.getElementById('sliderGroup');
    const prevBtn = document.getElementById('prevDay');
    const nextBtn = document.getElementById('nextDay');

    slider.min = 0;
    slider.max = allDates.length - 1;
    slider.value = allDates.length - 1; // Default to the last date (Final)
    display.textContent = allDates[allDates.length - 1];
    sliderGroup.style.display = 'flex';

    const updateFromSlider = () => {
        display.textContent = allDates[slider.value];
        refreshSimulation();
    };

    slider.oninput = updateFromSlider;

    prevBtn.onclick = () => {
        if (parseInt(slider.value) > 0) {
            slider.value = parseInt(slider.value) - 1;
            updateFromSlider();
        }
    };

    nextBtn.onclick = () => {
        if (parseInt(slider.value) < allDates.length - 1) {
            slider.value = parseInt(slider.value) + 1;
            updateFromSlider();
        }
    };

    console.log(`Timeline established: ${allDates.length} days.`);
    renderTabs(); // Generate navigation tabs based on competition structure
    refreshSimulation();
}

/**
 * Generate navigation tabs based on competition structure
 */
function renderTabs() {
    const viewport = document.getElementById('simulator-viewport');
    viewport.innerHTML = `
        <ul class="nav nav-pills mb-4 justify-content-center" id="simTabs" role="tablist">
            <li class="nav-item">
                <a class="nav-link active" id="groups-tab" data-toggle="pill" href="#groups-view" role="tab">Group Stage</a>
            </li>
        </ul>
        <div class="tab-content" id="simTabsContent">
            <div class="tab-pane fade show active" id="groups-view" role="tabpanel"></div>
        </div>
    `;

    const tabsList = document.getElementById('simTabs');
    const tabsContent = document.getElementById('simTabsContent');

    // Add Best Thirds if enabled in config
    const groupRound = currentCompetition.rounds.find(r => r.type === 'group_stage');
    if (groupRound && groupRound.config && groupRound.config.qualifiers && groupRound.config.qualifiers.best_thirds_enabled) {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = '<a class="nav-link" id="thirds-tab" data-toggle="pill" href="#thirds-view" role="tab">Best 3rd Teams</a>';
        tabsList.appendChild(li);

        const pane = document.createElement('div');
        pane.className = 'tab-pane fade';
        pane.id = 'thirds-view';
        pane.role = 'tabpanel';
        tabsContent.appendChild(pane);
    }

    // Add Knockout Tab (Unified)
    const koRounds = currentCompetition.rounds.filter(r => r.type === 'knockout');
    if (koRounds.length > 0) {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = '<a class="nav-link" id="knockout-tab" data-toggle="pill" href="#knockout-view" role="tab">Knockout Phase</a>';
        tabsList.appendChild(li);

        const pane = document.createElement('div');
        pane.className = 'tab-pane fade';
        pane.id = 'knockout-view';
        pane.role = 'tabpanel';
        pane.innerHTML = '<div id="bracket-container" class="bracket-wrapper"></div>';
        tabsContent.appendChild(pane);
    }
}

/**
 * Main rendering loop
 */
async function refreshSimulation() {
    if (!currentCompetition) return;
    const atDate = allDates[document.getElementById('dateRange').value];
    
    // 1. Process Group Stage & Best Thirds
    const groupRound = currentCompetition.rounds.find(r => r.type === 'group_stage');
    let groupResults = null;
    if (groupRound) {
        groupResults = calculateGroupStage(groupRound, atDate);
        renderGroupStage(groupResults, atDate);
        
        if (groupRound.config.qualifiers.best_thirds_enabled) {
            const thirdsRound = currentCompetition.rounds.find(r => r.type === 'best_thirds_ranking');
            const numThirdsQualify = thirdsRound?.config?.num_qualifiers || 8;
            renderBestThirds(groupResults.thirds, groupRound.config, numThirdsQualify, atDate);
        }
    }
    
    // 2. Process Knockout Phase (Wait for it to finish)
    const koRounds = currentCompetition.rounds.filter(r => r.type === 'knockout');
    if (koRounds.length > 0) {
        await renderKnockoutPhase(koRounds, groupResults, atDate);
    }
}

/**
 * CALCULATION: Group Stage Logic
 */
function calculateGroupStage(round, atDate) {
    let groups = {};
    
    // Read points configuration from round config
    const pointsWin = round.config.ranking_rules.points_win ?? 3;
    const pointsDraw = round.config.ranking_rules.points_draw ?? 1;
    const pointsLoss = round.config.ranking_rules.points_loss ?? 0;
    
    // Initialize groups
    round.matches.forEach(m => {
        if (!groups[m.group]) {
            groups[m.group] = { id: m.group, matches: [], standings: {} };
        }
        groups[m.group].matches.push(m);
        [m.home, m.away].forEach(t => {
            if (!groups[m.group].standings[t]) {
                groups[m.group].standings[t] = { team: t, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
            }
        });
    });

    // Calculate outcomes
    Object.keys(groups).forEach(gKey => {
        const group = groups[gKey];
        group.matches.forEach(m => {
            const res = getMatchResult(m, atDate);
            m.tempResult = res; // Store for rendering

            const h = group.standings[m.home];
            const a = group.standings[m.away];
            h.mp++; a.mp++;
            h.gf += res.s1; h.ga += res.s2;
            a.gf += res.s2; a.ga += res.s1;
            h.gd = h.gf - h.ga;
            a.gd = a.gf - a.ga;

            if (res.s1 > res.s2) {
                h.pts += pointsWin;
                h.w++;
                a.pts += pointsLoss;
                a.l++;
            } else if (res.s1 < res.s2) {
                a.pts += pointsWin;
                a.w++;
                h.pts += pointsLoss;
                h.l++;
            } else {
                h.pts += pointsDraw;
                a.pts += pointsDraw;
                h.d++;
                a.d++;
            }
        });

        // Calculate head-to-head stats for each team
        Object.keys(group.standings).forEach(team => {
            const h2h = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
            group.matches.forEach(m => {
                if (m.date > atDate) return;
                const res = m.tempResult;
                if (m.home === team) {
                    h2h.mp++;
                    h2h.gf += res.s1; h2h.ga += res.s2;
                    if (res.s1 > res.s2) { h2h.pts += pointsWin; h2h.w++; }
                    else if (res.s1 < res.s2) { h2h.pts += pointsLoss; h2h.l++; }
                    else { h2h.pts += pointsDraw; h2h.d++; }
                } else if (m.away === team) {
                    h2h.mp++;
                    h2h.gf += res.s2; h2h.ga += res.s1;
                    if (res.s2 > res.s1) { h2h.pts += pointsWin; h2h.w++; }
                    else if (res.s2 < res.s1) { h2h.pts += pointsLoss; h2h.l++; }
                    else { h2h.pts += pointsDraw; h2h.d++; }
                }
            });
            h2h.gd = h2h.gf - h2h.ga;
            group.standings[team].h2h = h2h;
        });

        // Sort standings using tiebreaker rules from config
        const tiebreakers = round.config.ranking_rules?.tiebreakers || ['points', 'goal_difference', 'goals_scored'];
        group.sorted = Object.values(group.standings).sort((a, b) => {
            for (const rule of tiebreakers) {
                let cmp = 0;
                if (rule === 'points') {
                    cmp = b.pts - a.pts;
                } else if (rule === 'goal_difference') {
                    cmp = b.gd - a.gd;
                } else if (rule === 'goals_scored') {
                    cmp = b.gf - a.gf;
                } else if (rule === 'head_to_head_gd') {
                    // Calculate H2H only between these two teams
                    let h2h_a = { gf: 0, ga: 0 };
                    let h2h_b = { gf: 0, ga: 0 };
                    group.matches.forEach(m => {
                        if (m.date > atDate) return;
                        const res = m.tempResult;
                        if ((m.home === a.team && m.away === b.team) ||
                            (m.home === b.team && m.away === a.team)) {
                            if (m.home === a.team) {
                                h2h_a.gf += res.s1; h2h_a.ga += res.s2;
                                h2h_b.gf += res.s2; h2h_b.ga += res.s1;
                            } else {
                                h2h_a.gf += res.s2; h2h_a.ga += res.s1;
                                h2h_b.gf += res.s1; h2h_b.ga += res.s2;
                            }
                        }
                    });
                    const h2h_gd_a = h2h_a.gf - h2h_a.ga;
                    const h2h_gd_b = h2h_b.gf - h2h_b.ga;
                    cmp = h2h_gd_b - h2h_gd_a;
                } else if (rule === 'head_to_head_goals') {
                    // Calculate H2H goals only between these two teams
                    let h2h_a_gf = 0, h2h_b_gf = 0;
                    group.matches.forEach(m => {
                        if (m.date > atDate) return;
                        const res = m.tempResult;
                        if ((m.home === a.team && m.away === b.team) ||
                            (m.home === b.team && m.away === a.team)) {
                            if (m.home === a.team) {
                                h2h_a_gf += res.s1;
                                h2h_b_gf += res.s2;
                            } else {
                                h2h_a_gf += res.s2;
                                h2h_b_gf += res.s1;
                            }
                        }
                    });
                    cmp = h2h_b_gf - h2h_a_gf;
                } else if (rule === 'head_to_head_points') {
                    // Calculate H2H points only between these two teams
                    let h2h_a_pts = 0, h2h_b_pts = 0;
                    group.matches.forEach(m => {
                        if (m.date > atDate) return;
                        const res = m.tempResult;
                        if ((m.home === a.team && m.away === b.team) ||
                            (m.home === b.team && m.away === a.team)) {
                            if (m.home === a.team) {
                                if (res.s1 > res.s2) h2h_a_pts += 3;
                                else if (res.s1 === res.s2) h2h_a_pts += 1;
                                if (res.s2 > res.s1) h2h_b_pts += 3;
                                else if (res.s1 === res.s2) h2h_b_pts += 1;
                            } else {
                                if (res.s2 > res.s1) h2h_a_pts += 3;
                                else if (res.s1 === res.s2) h2h_a_pts += 1;
                                if (res.s1 > res.s2) h2h_b_pts += 3;
                                else if (res.s1 === res.s2) h2h_b_pts += 1;
                            }
                        }
                    });
                    cmp = h2h_b_pts - h2h_a_pts;
                }
                if (cmp !== 0) return cmp;
            }
            return 0;
        });

        // Apply group override only when all matches in the group are played
        const allGroupMatchesPlayed = group.matches.every(m => m.date <= atDate);
        if (allGroupMatchesPlayed) {
            const compName = currentCompetition.name;
            const compBase = compName.replace(/ \d{4}$/, '');
            const overrideOrder = groupOverrides[compName]?.[gKey] ?? groupOverrides[compBase]?.[gKey];
            if (overrideOrder) {
                const overrideSorted = overrideOrder
                    .map(teamName => group.standings[teamName])
                    .filter(Boolean);
                // Only apply if all teams in the override match the group
                if (overrideSorted.length === group.sorted.length) {
                    group.sorted = overrideSorted;
                    console.log(`[Group Override] Applied for group ${gKey}: ${overrideOrder.join(', ')}`);
                }
            }
        }

        // Sort matches chronologically
        group.matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    // Best Thirds
    let thirds = Object.values(groups).map(g => ({ ...g.sorted[2], group: g.id }));
    thirds.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });

    return { groups, thirds };
}

/**
 * RENDERING: Group Stage
 */
function renderGroupStage(data, atDate) {
    const container = document.getElementById('groups-view');
    if (!container) return; // Guard clause

    container.innerHTML = '<div class="row" id="groups-grid"></div>';
    const grid = document.getElementById('groups-grid');
    if (!grid) return; // Double check

    Object.keys(data.groups).sort().forEach(gKey => {
        const g = data.groups[gKey];
        const col = document.createElement('div');
        col.className = 'col-xl-4 col-md-6';
        
        let tableRows = g.sorted.map((t, idx) => {
            let zoneClass = idx < 2 ? 'qualify-zone' : (idx === 2 ? 'third-zone' : '');
            return `
                <tr>
                    <td class="${zoneClass}">${idx + 1}</td>
                    <td class="team-name">${t.team}</td>
                    <td class="text-center">${t.mp}</td>
                    <td class="text-center">${t.gd}</td>
                    <td class="pts">${t.pts}</td>
                </tr>`;
        }).join('');

        let matchRows = g.matches.map(m => {
            const res = m.tempResult;
            const isPlayed = m.date <= atDate;
            const scoreClass = res.isPrediction ? 'predicted' : 'real';
            const rowClass = isPlayed ? 'match-played' : 'match-future';
            
            return `
                <div class="match-row ${rowClass}">
                    <span class="match-team home">${m.home}</span>
                    <span class="match-score ${scoreClass}">${res.s1} - ${res.s2}</span>
                    <span class="match-team away">${m.away}</span>
                </div>`;
        }).join('');

        col.innerHTML = `
            <div class="group-card">
                <div class="group-title">Group ${g.id}</div>
                <table class="sim-table">
                    <thead><tr><th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <div class="group-matches">${matchRows}</div>
            </div>`;
        grid.appendChild(col);
    });
}

/**
 * RENDERING: Best Thirds
 */
function renderBestThirds(thirds, config, numToQualify, atDate) {
    const container = document.getElementById('thirds-view');

    let rows = thirds.map((t, idx) => {
        const isQualfied = idx < numToQualify;
        return `
            <tr style="${isQualfied ? 'background: rgba(76, 175, 80, 0.1);' : ''}">
                <td class="text-center ${isQualfied ? 'qualify-zone' : ''}">${idx + 1}</td>
                <td class="font-weight-bold">${t.team} (Gr. ${t.group})</td>
                <td class="text-center">${t.mp}</td>
                <td class="text-center">${t.gd}</td>
                <td class="text-center font-weight-bold" style="color:var(--primary-yellow)">${t.pts}</td>
            </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-lg-8">
                <div class="group-card">
                    <div class="group-title text-center">Best 3rd Place Teams Ranking</div>
                    <p class="text-muted text-center small">Top ${numToQualify} teams qualify for Knockout Phase</p>
                    <table class="table table-dark table-sm sim-table">
                        <thead><tr><th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

/**
 * RENDERING: Knockout Phase (Bracket) — SVG Tree Layout
 */
async function renderKnockoutPhase(rounds, groupResults, atDate) {
    const container = document.getElementById('bracket-container');
    container.innerHTML = '';

    const matchManifest = {};
    const thirdsMap = await loadThirdsMapping();
    const groupRound = currentCompetition.rounds.find(r => r.type === 'group_stage');
    const isThirdsDataReady = thirdsMap && groupResults && groupResults.thirds;

    const getBestThirdsForSlot = (targetSlot) => {
        if (!isThirdsDataReady) { console.warn("Thirds data not ready"); return "TBD"; }
        const thirdsRound = currentCompetition.rounds.find(r => r.type === 'best_thirds_ranking');
        const numQ = thirdsRound?.config?.num_qualifiers || 8;
        const combo = groupResults.thirds.slice(0, numQ).map(t => t.group).sort().join('');
        const row = thirdsMap.find(r => r.combo === combo);
        if (!row) { console.error(`COMBO NOT FOUND: "${combo}"`); return "TBD"; }
        const srcGroup = row[targetSlot];
        const entry = groupResults.thirds.find(t => t.group === srcGroup);
        console.log(`[Thirds] Combo: ${combo} | ${targetSlot} -> ${srcGroup} -> ${entry ? entry.team : 'N/A'}`);
        return entry ? entry.team : `3rd Gr.${srcGroup}`;
    };

    const resolveSlot = (slot) => {
        if (!slot) return "TBD";
        if (slot.round && slot.group && slot.position) {
            const group = groupResults.groups[slot.group];
            if (!group) return "TBD";
            const entry = group.sorted[parseInt(slot.position) - 1];
            return entry ? entry.team : `${slot.position} ${slot.group}`;
        }
        if (slot.round && slot.round.endsWith('_thirds')) return "THIRD_PLACE_HOLDER";
        if (slot.match && slot.outcome) {
            const prev = matchManifest[slot.match];
            if (!prev) return `Win ${slot.match.split('_').pop()}`;
            return slot.outcome === 'winner' ? prev.winner : prev.loser;
        }
        return "TBD";
    };

    // ── BUILD BRACKET TREE ────────────────────────────────────────────────
    const knockoutRound = rounds.find(r => r.type === 'knockout');
    if (!knockoutRound) return;

    const matchById = {};
    knockoutRound.matches.forEach(m => { matchById[m.id] = m; });

    const matchChildren = {};
    const referencedIds = new Set();
    Object.values(matchById).forEach(m => {
        const ch = [];
        if (m.slot_home && m.slot_home.match) { ch.push(m.slot_home.match); referencedIds.add(m.slot_home.match); }
        if (m.slot_away && m.slot_away.match) { ch.push(m.slot_away.match); referencedIds.add(m.slot_away.match); }
        if (ch.length === 2) matchChildren[m.id] = ch;
    });

    const finalId = Object.keys(matchChildren).find(id =>
        !referencedIds.has(id) &&
        !(matchById[id].slot_home && matchById[id].slot_home.outcome === 'loser') &&
        !(matchById[id].slot_away && matchById[id].slot_away.outcome === 'loser')
    );
    if (!finalId) { container.innerHTML = '<p class="p-4 text-muted">No final match found.</p>'; return; }

    const thirdPlaceId = Object.keys(matchById).find(id =>
        !referencedIds.has(id) && id !== finalId
    );

    // ── DFS POSITION ASSIGNMENT ───────────────────────────────────────────
    let leafCounter = 0;
    const positions = {};
    function dfsAssign(id, depth) {
        if (!id || !matchById[id]) return;
        
        if (!matchChildren[id]) {
            positions[id] = { leafStart: leafCounter, leafCount: 1, depth };
            leafCounter++;
        } else {
            const [l, r] = matchChildren[id];
            dfsAssign(l, depth + 1);
            dfsAssign(r, depth + 1);
            positions[id] = { 
                leafStart: positions[l].leafStart, 
                leafCount: positions[l].leafCount + positions[r].leafCount, 
                depth 
            };
        }
    }
    dfsAssign(finalId, 0);

    const maxDepth = Math.max(...Object.values(positions).map(p => p.depth || 0));
    const numLeaves = leafCounter;

    // ── PROCESS MATCHES (leaves first) ────────────────────────────────────
    const processOrder = Object.keys(matchById)
        .filter(id => positions[id])
        .sort((a, b) => (positions[b]?.depth ?? 0) - (positions[a]?.depth ?? 0));

    const getFlagUrl = (name) => { 
        const tri = teamTricodes[name] || teamTricodes[getNormalizedTeamName(name)]; 
        return tri ? `img/flags/icons/${tri}.png` : null; 
    };
    const flagHtml = (name) => { const u = getFlagUrl(name); return u ? `<img src="${u}" class="bk-flag" onerror="this.style.display='none'">` : '<span class="bk-flag-placeholder"></span>'; };

    const resolveThirds = (home, away, m) => {
        if (home !== "THIRD_PLACE_HOLDER" && away !== "THIRD_PLACE_HOLDER") return [home, away];
        const isH = home === "THIRD_PLACE_HOLDER";
        const opp = isH ? m.slot_away : m.slot_home;
        if (opp && opp.group) { const t = getBestThirdsForSlot(`vs_1${opp.group}`); return isH ? [t, away] : [home, t]; }
        return [home, away];
    };

    const determineWinner = (home, away, res) => {
        // ÉTAPE 1 : Si le score n'est pas nul, le gagnant est direct (réel ou prédit)
        if (res.s1 > res.s2) return home;
        if (res.s2 > res.s1) return away;

        // ÉTAPE 2 : Le score est nul (s1 == s2)
        // Cas A : C'est un résultat RÉEL -> chercher dans knockout_overrides.json
        if (!res.isPrediction) {
            console.log(`[REAL MATCH] ${home} vs ${away} (${res.s1}-${res.s2})`);
            let overrideKey = [home, away].sort().join('|');
            const compBase = currentCompetition.name.replace(/ \d{4}$/, '');
            let override =
                knockoutOverrides[currentCompetition.name]?.[res.matchDate]?.[overrideKey] ??
                knockoutOverrides[compBase]?.[res.matchDate]?.[overrideKey];
            
            // If not found with original names, try with normalized names
            if (!override) {
                const normalizedHome = getNormalizedTeamName(home);
                const normalizedAway = getNormalizedTeamName(away);
                overrideKey = [normalizedHome, normalizedAway].sort().join('|');
                override =
                    knockoutOverrides[currentCompetition.name]?.[res.matchDate]?.[overrideKey] ??
                    knockoutOverrides[compBase]?.[res.matchDate]?.[overrideKey];
            }
            
            if (override?.winner) {
                console.log(`  -> Winner by Knockout Override: ${override.winner}`);
                return override.winner;
            }
            console.warn(`  -> Real draw, no override found for "${overrideKey}" on ${res.matchDate}. Using tie-breaker.`);
        }

        // Cas B : C'est une SIMULATION (ou tàb réels manquants) -> Tie-breaker algorithmique
        const r1 = getTeamRatingsAtDate(home, atDate);
        const r2 = getTeamRatingsAtDate(away, atDate);

        console.log(`[TIE-BREAKER] ${home} vs ${away} (Score: ${res.s1}-${res.s2})`);
        console.log(`  1. Rank: ${home}=${r1.rank} vs ${away}=${r2.rank}`);
        if (r1.rank < r2.rank) return home;
        if (r2.rank < r1.rank) return away;
        
        console.log(`  2. Offense: ${home}=${r1.off} vs ${away}=${r2.off}`);
        if (r1.off < r2.off) return home;
        if (r2.off < r1.off) return away;
        
        console.log(`  3. Defense: ${home}=${r1.def} vs ${away}=${r2.def}`);
        if (r1.def < r2.def) return home;
        if (r2.def < r1.def) return away;
        
        return home === "TBD" ? away : home;
    };

    for (const id of processOrder) {
        const m = matchById[id];
        let home = resolveSlot(m.slot_home);
        let away = resolveSlot(m.slot_away);
        [home, away] = resolveThirds(home, away, m);
        
        const res = getMatchResult({ ...m, home, away }, atDate);
        
        const winner = determineWinner(home, away, res);

        matchManifest[m.id] = { winner, loser: winner === home ? away : home, result: res, home, away };
    }

    if (thirdPlaceId) {
        const m = matchById[thirdPlaceId];
        let home = resolveSlot(m.slot_home);
        let away = resolveSlot(m.slot_away);
        const res = getMatchResult({ ...m, home, away }, atDate);
        
        const winner = determineWinner(home, away, res);

        matchManifest[m.id] = { winner, loser: winner === home ? away : home, result: res, home, away };
    }

    // ── LAYOUT CONSTANTS ──────────────────────────────────────────────────
    const UNIT    = 100; // Vertical space per leaf
    const MATCH_H = 72;
    const MATCH_W = 220;
    const GAP     = 100; // Increased gap to take more width
    const COL_STEP = MATCH_W + GAP;
    const TITLE_H  = 45;
    const TOTAL_H  = numLeaves * UNIT;
    const TOTAL_W  = (maxDepth + 1) * COL_STEP;
    const ROUND_NAMES = { 
        0: 'Final', 
        1: 'Semi-finals', 
        2: 'Quarter-finals', 
        3: 'Round of 16', 
        4: 'Round of 32', 
        5: 'Round of 64' 
    };

    const colLeft = (depth) => (maxDepth - depth) * COL_STEP;
    const centerY = (id) => { 
        const p = positions[id]; 
        return (p.leafStart + p.leafCount / 2) * UNIT; 
    };

    // ── DOM STRUCTURE ─────────────────────────────────────────────────────
    const outer = document.createElement('div');
    outer.className = 'bk-outer';
    outer.style.cssText = `position:relative; overflow:auto; background:#111; padding:${TITLE_H + 40}px 80px 100px; border-radius:8px; border:1px solid #333;`;
    container.appendChild(outer);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:relative; width:${TOTAL_W}px; height:${TOTAL_H}px; min-width: 100%;`;
    outer.appendChild(wrapper);

    // SVG overlay for connector lines
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', TOTAL_W); 
    svg.setAttribute('height', TOTAL_H);
    svg.style.cssText = `position:absolute; top:0; left:0; z-index:1; pointer-events:none; overflow:visible; width: 100%; height: 100%;`;
    wrapper.appendChild(svg);

    const drawConnector = (x1, y1, x2, y2) => {
        const midX = x1 + (x2 - x1) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // Simple orthogonal path: Horizontal -> Vertical -> Horizontal
        const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#666'); // Lighter stroke to be more visible
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
    };

    // ── TITLE HEADERS ─────────────────────────────────────────────────────
    const titlesRendered = new Set();
    Object.keys(positions).forEach(id => {
        const { depth } = positions[id];
        if (titlesRendered.has(depth)) return;
        titlesRendered.add(depth);
        const el = document.createElement('div');
        el.className = 'bk-title';
        el.textContent = ROUND_NAMES[depth] || `Round ${depth}`;
        el.style.cssText = `position:absolute; left:${colLeft(depth)}px; top:${-TITLE_H - 10}px; width:${MATCH_W}px; border-radius:4px;`;
        wrapper.appendChild(el);
    });

    // ── RENDER EACH MATCH ─────────────────────────────────────────────────
    Object.keys(positions).forEach(id => {
        const m = matchById[id];
        const { depth } = positions[id];
        const manifest = matchManifest[id];
        if (!manifest) return;
        const { home, away, winner, result: res } = manifest;
        const isPlayed = m.date <= atDate;
        const cx = colLeft(depth);
        const cy = centerY(id);

        // Connector lines to parent
        // Find the match that takes THIS match as a home or away input
        const parentId = Object.keys(matchChildren).find(pid => matchChildren[pid].includes(id));
        
        if (parentId && positions[parentId]) {
            const pcy = centerY(parentId);
            const pDepth = positions[parentId].depth;
            const pcx = colLeft(pDepth);
            
            // Draw from current match exit (right) to parent match entry (left)
            drawConnector(cx + MATCH_W, cy, pcx, pcy);
        }

        // Match box
        const s1 = (isPlayed || res.isPrediction) ? res.s1 : '–';
        const s2 = (isPlayed || res.isPrediction) ? res.s2 : '–';
        const sc = res.isPrediction ? 'predicted' : 'real';
        const d = new Date(m.date + 'T00:00:00');
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const el = document.createElement('div');
        el.className = 'bk-match';
        el.id = `match-${id}`;
        el.style.cssText = `position:absolute; left:${cx}px; top:${cy - MATCH_H / 2}px; width:${MATCH_W}px; z-index:2;`;
        el.innerHTML = `
            <div class="bk-date">${dateStr}</div>
            <div class="bk-team ${winner === home ? 'winner' : ''}">
                <div class="bk-team-info">${flagHtml(home)}<span class="bk-name">${home}</span></div>
                <span class="bk-score ${sc}">${s1}</span>
            </div>
            <div class="bk-team ${winner === away ? 'winner' : ''}">
                <div class="bk-team-info">${flagHtml(away)}<span class="bk-name">${away}</span></div>
                <span class="bk-score ${sc}">${s2}</span>
            </div>`;
        wrapper.appendChild(el);
    });

    // ── 3RD PLACE ─────────────────────────────────────────────────────────
    if (thirdPlaceId) {
        const manifest = matchManifest[thirdPlaceId];
        if (manifest) {
            const m = matchById[thirdPlaceId];
            const { home, away, winner, result: res } = manifest;
            const isPlayed = m.date <= atDate;
            const s1 = (isPlayed || res.isPrediction) ? res.s1 : '–';
            const s2 = (isPlayed || res.isPrediction) ? res.s2 : '–';
            const sc = res.isPrediction ? 'predicted' : 'real';
            const thirdEl = document.createElement('div');
            thirdEl.className = 'bk-third';
            thirdEl.innerHTML = `
                <div class="bk-third-title">3rd Place Match</div>
                <div class="bk-match" style="width:${MATCH_W}px">
                    <div class="bk-team ${winner === home ? 'winner' : ''}">
                        <div class="bk-team-info">${flagHtml(home)}<span class="bk-name">${home}</span></div>
                        <span class="bk-score ${sc}">${s1}</span>
                    </div>
                    <div class="bk-team ${winner === away ? 'winner' : ''}">
                        <div class="bk-team-info">${flagHtml(away)}<span class="bk-name">${away}</span></div>
                        <span class="bk-score ${sc}">${s2}</span>
                    </div>
                </div>`;
            outer.appendChild(thirdEl);
        }
    }
}

/**
 * UTILS: Load CSV Mapping for Best Thirds
 */
async function loadThirdsMapping() {
    const thirdsRound = currentCompetition.rounds.find(r => r.type === 'best_thirds_ranking');
    if (!thirdsRound || !thirdsRound.config || !thirdsRound.config.mapping_file) return null;

    try {
        const resp = await fetch(thirdsRound.config.mapping_file);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const text = await resp.text();
        const lines = text.trim().split('\n');
        
        // Clean headers (remove BOM if any, trim spaces)
        const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim());
        
        return lines.slice(1).map(line => {
            const values = line.split(',');
            const obj = {};
            headers.forEach((h, i) => {
                if (values[i] !== undefined) obj[h] = values[i].trim();
            });
            return obj;
        });
    } catch (e) {
        console.error("Error loading thirds mapping:", e);
        return null;
    }
}

// Start once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Utilitaires pour les drapeaux
function flagImgFromFile(flag, team) {
    if (!flag) return '';
    return `<img src="img/flags/${flag}" alt="${team}" class="flag mr-1" style="height:1.5em;">`;
}

// Liste des équipes chargée dynamiquement
let teamsList = [];
let rankingsMap = {}; // Pour accès rapide aux points/rank/flag

// Couleurs des équipes
let countriesColorsMap = {}; // { current_name: { primary: '#...', secondary: '#...' } }

async function loadCountriesColors() {
    const resp = await fetch('data/source/match_dataset/countries_names.csv');
    const text = await resp.text();
    const lines = text.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 4) {
            const currentName = parts[1].trim();
            const primary = parts[2].trim();
            const secondary = parts[3].trim();
            countriesColorsMap[currentName] = { primary, secondary };
        }
    }
}

function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function colorDistance(hex1, hex2) {
    const [r1, g1, b1] = hexToRgb(hex1);
    const [r2, g2, b2] = hexToRgb(hex2);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function getColorLuminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getH2HScoreColor(winnerTeam, isDark) {
    if (!winnerTeam) {
        return isDark ? '#adb5bd' : '#495057';
    }
    const c = countriesColorsMap[winnerTeam];
    if (!c) return isDark ? '#cccccc' : '#333333';
    const lum1 = getColorLuminance(c.primary);
    const lum2 = getColorLuminance(c.secondary);
    // En dark mode : la couleur primaire est illisible seulement si vraiment trop sombre (< 40)
    // En mode normal : illisible seulement si vraiment trop claire (> 210)
    if (isDark) {
        return lum1 < 40 ? c.secondary : c.primary;
    } else {
        return lum1 > 210 ? c.secondary : c.primary;
    }
}

function getTeamColors(team1, team2) {
    const c1 = countriesColorsMap[team1];
    const c2 = countriesColorsMap[team2];
    const color1 = c1?.primary ?? '#FF4560';
    const textColor1 = c1?.secondary ?? '#FFFFFF';
    const primary2 = c2?.primary ?? '#008FFB';
    const secondary2 = c2?.secondary ?? '#FFFFFF';

    let color2, textColor2;
    if (c1 && c2 && colorDistance(color1, primary2) < 100) {
        color2 = secondary2;
        textColor2 = primary2;
    } else {
        color2 = primary2;
        textColor2 = secondary2;
    }
    return { color1, color2, textColor1, textColor2 };
}

async function loadTeamsList() {
    const resp = await fetch('data/json/rankings/LatestRankings.json');
    const data = await resp.json();
    teamsList = data.rankings.map(r => r.team);
    rankingsMap = {};
    data.rankings.forEach(r => {
        rankingsMap[r.team] = r;
    });
}

function populateTeamSelects() {
    const team1Select = document.getElementById('team1Select');
    const team2Select = document.getElementById('team2Select');
    team1Select.innerHTML = teamsList.map(t => `<option value="${t}">${t}</option>`).join('');
    team2Select.innerHTML = teamsList.map(t => `<option value="${t}">${t}</option>`).join('');
    team1Select.value = "France";
    team2Select.value = "Argentina";
}

// Chargement des JSON d'équipes
async function loadTeamData(team) {
    const resp = await fetch(`data/json/matches/${team}.json`);
    return await resp.json();
}

// Calcul des probabilités de match (Victoire/Nul/Défaite)
function calculateMatchProbas(points1, points2, neutral) {
    // Bonus domicile de 50 points pour Team 1 si non neutre
    const p1_eff = neutral ? points1 : (points1 + 50);
    const p2_eff = points2;
    
    const X = Math.abs(p1_eff - p2_eff);
    
    // Formule Victoire (de l'équipe la plus forte)
    const V = 1 / (1 + 2.0134 * Math.exp(-0.006581 * Math.pow(X, 0.9391)));
    
    // Formule Défaite (de l'équipe la plus forte)
    const D = Math.min(1 - V, 0.3265 / (1 + 0.000071 * Math.pow(X, 1.801)));
    
    // Le reste est le Nul
    const N = 1 - V - D;

    let prob1, probN, prob2;
    
    if (p1_eff >= p2_eff) {
        // Team 1 est plus forte (ou égale)
        prob1 = V;
        prob2 = D;
        probN = N;
    } else {
        // Team 2 est plus forte
        prob1 = D;
        prob2 = V;
        probN = N;
    }

    return {
        win1: Math.round(prob1 * 1000) / 10,
        draw: Math.round(probN * 1000) / 10,
        win2: Math.round(prob2 * 1000) / 10
    };
}

// Affichage du panel équipe (gauche/droite)
function renderTeamPanel(teamData, side) {
    if (!teamData) return '';
    const lastMatch = teamData.matches.find(m => m.type === 'past');
    const lastPoints = lastMatch ? lastMatch.rating1 : '?';
    const latestRank = rankingsMap[teamData.team]?.rank ?? (lastMatch?.rank ?? '?');
    const offRating = rankingsMap[teamData.team]?.points_off ?? '?';
    const offRank = rankingsMap[teamData.team]?.ranking_off ?? '?';
    const defRating = rankingsMap[teamData.team]?.points_def ?? '?';
    const defRank = rankingsMap[teamData.team]?.ranking_def ?? '?';
    // Trie les matchs par date décroissante et prend les 10 plus récents
    const last10 = teamData.matches
        .filter(m => m.type === 'past')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    // Calcule les stats sur les 10 derniers matchs
    let sumPts = 0, sumOppLevel = 0, sumEv = 0, count = 0;
    for (const match of last10) {
        // Points du match
        let pts = 0;
        if (typeof match.score1 === 'number' && typeof match.score2 === 'number') {
            if (match.score1 > match.score2) pts = 3;
            else if (match.score1 === match.score2) pts = 1;
            // sinon 0
        }
        sumPts += pts;
        // Niveau adversaire
        if (typeof match.rating2 === 'number') sumOppLevel += match.rating2;
        // Evolution points
        if (typeof match.rating_ev === 'number') sumEv += match.rating_ev;
        count++;
    }
    const avgPts = count ? (sumPts / count).toFixed(2) : '?';
    const avgOpp = count ? Math.round(sumOppLevel / count) : '?';
    const totalEv = count ? (sumEv > 0 ? '+' : '') + sumEv : '?';

    let html = `
        <div class="d-flex align-items-center mb-2">
            <h5 class="mb-0">${teamData.team}</h5>
        </div>
        <div class="mb-2">
            <div class="stats-cards">
                <div class="stats-card"><span class="icon">⭐</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Latest rating</div>
                        <strong>${lastPoints}</strong>
                    </div>
                </div>
                <div class="stats-card"><span class="icon">🏆</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Latest ranking</div>
                        <strong>${latestRank}</strong>
                    </div>
                </div>
                <div class="stats-card"><span class="icon">📊</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Avg ppm (last 10)</div>
                        <strong>${avgPts}</strong>
                    </div>
                </div>
                <div class="stats-card"><span class="icon">⚔️</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Off rating</div>
                        <strong>${offRating}</strong>
                        <div style="font-size:0.85em;color:#999;">(${offRank})</div>
                    </div>
                </div>
                <div class="stats-card"><span class="icon">🛡️</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Def rating</div>
                        <strong>${defRating}</strong>
                        <div style="font-size:0.85em;color:#999;">(${defRank})</div>
                    </div>
                </div>
                <div class="stats-card"><span class="icon">🎯</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Avg opponent rating</div>
                        <strong>${avgOpp}</strong>
                    </div>
                </div>
                <div class="stats-card"><span class="icon">🔺</span>
                    <div>
                        <div style="font-size:0.9em;color:#888;">Total Δpts</div>
                        <strong>${totalEv}</strong>
                    </div>
                </div>
            </div>
        </div>
        <div class="mb-2">Last 10 matches:</div>
        <div class="table-responsive">
        <table class="table table-sm mb-2" style="font-size:0.75em;">
            <thead>
                <tr>
                    <th style="white-space:nowrap">Date</th>
                    <th>${side === 'left' ? 'Home' : 'Away'}</th>
                    <th>Score</th>
                    <th>${side === 'left' ? 'Away' : 'Home'}</th>
                    <th class="d-none d-sm-table-cell">Δpts</th>
                    <th class="d-none d-sm-table-cell">Rank</th>
                </tr>
            </thead>
            <tbody>
    `;
    for (const match of last10) {
        let leftTeam, rightTeam, leftScore, rightScore, leftFlag, rightFlag;
        if (match.country === match.team1) {
            leftTeam = match.team1;
            rightTeam = match.team2;
            leftScore = match.score1;
            rightScore = match.score2;
            leftFlag = match.flag1;
            rightFlag = match.flag2;
        } else if (match.country === match.team2) {
            leftTeam = match.team2;
            rightTeam = match.team1;
            leftScore = match.score2;
            rightScore = match.score1;
            leftFlag = match.flag2;
            rightFlag = match.flag1;
        } else {
            if (side === 'left') {
                leftTeam = match.team1;
                rightTeam = match.team2;
                leftScore = match.score1;
                rightScore = match.score2;
                leftFlag = match.flag1;
                rightFlag = match.flag2;
            } else {
                leftTeam = match.team2;
                rightTeam = match.team1;
                leftScore = match.score2;
                rightScore = match.score1;
                leftFlag = match.flag2;
                rightFlag = match.flag1;
            }
        }
        const venue = match.country || '';
        const tournament = match.tournament || '';
        let ratingEv = match.rating_ev;
        const pts = ratingEv !== undefined && ratingEv !== null && ratingEv !== "" ? (ratingEv > 0 ? '+' : '') + ratingEv : '';
        const rank = match.rank ?? '';

        // Couleur du score selon victoire/défaite/nul pour l'équipe sélectionnée (teamData.team)
        let scoreColor = '';
        if (typeof leftScore === 'number' && typeof rightScore === 'number') {
            let teamScore, oppScore, teamName;
            if (leftTeam === teamData.team) {
                teamScore = leftScore;
                oppScore = rightScore;
                teamName = leftTeam;
            } else if (rightTeam === teamData.team) {
                teamScore = rightScore;
                oppScore = leftScore;
                teamName = rightTeam;
            }
            if (teamScore > oppScore) {
                scoreColor = 'color: #28a745;'; // vert : victoire de l'équipe sélectionnée
            } else if (teamScore < oppScore) {
                scoreColor = 'color: #dc3545;'; // rouge : défaite de l'équipe sélectionnée
            } // sinon nul, couleur par défaut
        }

        html += `
            <tr>
                <td style="white-space:nowrap">${match.date}</td>
                <td class="team-cell">${flagImgFromFile(leftFlag, leftTeam)} ${leftTeam}</td>
                <td class="font-weight-bold" style="white-space:nowrap;${scoreColor}">${leftScore} - ${rightScore}</td>
                <td class="team-cell">${flagImgFromFile(rightFlag, rightTeam)} ${rightTeam}</td>
                <td class="d-none d-sm-table-cell">${pts}</td>
                <td class="d-none d-sm-table-cell">${rank}</td>
            </tr>
        `;
    }
    html += `
            </tbody>
        </table>
        </div>
    `;
    return html;
}

// Affichage du donut ou de l'historique cumulé
function renderDonutOrHistory(probas, h2hStats, donutMode, team1, team2, colors) {
    const { color1, color2, textColor1, textColor2 } = colors ?? { color1: '#FF4560', color2: '#008FFB', textColor1: '#FFFFFF', textColor2: '#FFFFFF' };
    const donutDiv = document.getElementById('donutContainer');
    const isDark = document.body.classList.contains('dark-theme');
    
    // Mise à jour de l'UI (titre et points du carousel)
    const donutTitle = document.getElementById('donutTitle');
    const dot1 = document.getElementById('dot1');
    const dot2 = document.getElementById('dot2');
    const donutSection = document.getElementById('donutSection');
    const titleColor = isDark ? '#aaa' : '#666';

    if (donutTitle) {
        donutTitle.textContent = donutMode ? 'Head-to-Head History' : 'General Ranking Method Prediction';
        donutTitle.style.color = titleColor;
    }
    if (dot1) dot1.style.backgroundColor = donutMode ? '#eee' : '#007bff';
    if (dot2) dot2.style.backgroundColor = donutMode ? '#007bff' : '#eee';
    
    // Style de la section donut
    if (donutSection) {
        donutSection.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)';
        donutSection.style.borderColor = isDark ? '#444' : 'rgba(0,0,0,0.1)';
        const alpha = isDark ? '15' : '10';
        donutSection.style.backgroundImage = `linear-gradient(135deg, ${color1}${alpha} 0%, ${color2}${alpha} 100%)`;
    }

    donutDiv.innerHTML = '';
    if (window.apexDonutChart) {
        window.apexDonutChart.destroy();
        window.apexDonutChart = null;
    }
    if (!donutMode) {
        const sliceColors = [color2, '#999', color1];
        const sliceTextColors = [textColor2, '#FFFFFF', textColor1];
        const options = {
            chart: { type: 'donut', height: 300 },
            series: [probas.win2, probas.draw, probas.win1],
            labels: [team2, 'Draw', team1],
            colors: sliceColors,
            dataLabels: {
                formatter: (val) => val.toFixed(1) + '%',
                style: { colors: sliceTextColors }
            },
            tooltip: {
                custom: ({ series, seriesIndex, w }) => {
                    const bg = sliceColors[seriesIndex];
                    const fg = sliceTextColors[seriesIndex];
                    const label = w.globals.labels[seriesIndex];
                    const val = series[seriesIndex].toFixed(1);
                    return `<div style="background:${bg};color:${fg};padding:6px 10px;border-radius:4px;font-weight:bold;">${label}: ${val}%</div>`;
                }
            },
            legend: { show: false }
        };
        window.apexDonutChart = new ApexCharts(donutDiv, options);
        window.apexDonutChart.render();
    } else {
        const sliceColors = [color2, '#999', color1];
        const sliceTextColors = [textColor2, '#FFFFFF', textColor1];
        const options = {
            chart: { type: 'donut', height: 300 },
            series: [h2hStats.win2, h2hStats.draw, h2hStats.win1],
            labels: [`Wins ${team2}`, 'Draws', `Wins ${team1}`],
            colors: sliceColors,
            dataLabels: {
                formatter: (val) => val.toFixed(1) + '%',
                style: { colors: sliceTextColors }
            },
            tooltip: {
                custom: ({ series, seriesIndex, w }) => {
                    const bg = sliceColors[seriesIndex];
                    const fg = sliceTextColors[seriesIndex];
                    const label = w.globals.labels[seriesIndex];
                    const val = series[seriesIndex].toFixed(1);
                    return `<div style="background:${bg};color:${fg};padding:6px 10px;border-radius:4px;font-weight:bold;">${label}: ${val}%</div>`;
                }
            },
            legend: { show: false }
        };
        window.apexDonutChart = new ApexCharts(donutDiv, options);
        window.apexDonutChart.render();
    }
}

// Fonction pour désaturer une couleur
function desaturateColor(hex, amount = 0.5) {
    const rgb = hexToRgb(hex);
    const [r, g, b] = rgb;
    const gray = Math.round(0.05 * r + 0.05 * g + 0.05 * b);
    const newR = Math.round(r + (gray - r) * amount);
    const newG = Math.round(g + (gray - g) * amount);
    const newB = Math.round(b + (gray - b) * amount);
    return '#' + [newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Calcul des odds à partir des ratings
function calculateOddsFromRatings(rating1, rating2) {
    if (!rating1 || !rating2) return null;
    
    const X = Math.abs(rating1 - rating2);
    const V = 1 / (1 + 2.0134 * Math.exp(-0.006581 * Math.pow(X, 0.9391)));
    const D = Math.min(1 - V, 0.3265 / (1 + 0.000071 * Math.pow(X, 1.801)));
    const N = 1 - V - D;

    let prob1, probN, prob2;
    if (rating1 >= rating2) {
        prob1 = V;
        prob2 = D;
        probN = N;
    } else {
        prob1 = D;
        prob2 = V;
        probN = N;
    }

    const odd1 = (prob1 > 0) ? (Math.max(1.00, 0.96 / prob1)).toFixed(2) : '—';
    const oddN = (probN > 0) ? (Math.max(1.00, 0.96 / probN)).toFixed(2) : '—';
    const odd2 = (prob2 > 0) ? (Math.max(1.00, 0.96 / prob2)).toFixed(2) : '—';

    return { odd1, oddN, odd2 };
}

// Affichage de l'historique des confrontations
function renderHeadToHead(matches, team1, team2) {
    // On ne prend que les matches de team1 contre team2
    const filtered = matches
        .filter(m => m.team2 === team2 || m.team2 === team1)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!filtered.length) return '<div class="alert alert-info">No direct match found.</div>';
    
    const isDark = document.body.classList.contains('dark-theme');
    const headerBg = isDark ? '#2a2d31' : '#f8f9fa';
    const headerTextColor = isDark ? '#e0e0e0' : '#333';
    const tableBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)';
    const borderColor = isDark ? '#404040' : '#ddd';
    
    let html = `<div class="table-responsive">
        <table class="table table-sm align-middle" style="font-size:0.85em; background: ${tableBg}; border-collapse: collapse;">
        <thead>
            <tr style="background: ${headerBg}; border-bottom: 2px solid ${borderColor};">
                <th style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; border: none;">Home</th>
                <th style="color: ${headerTextColor}; font-weight: 600; padding: 12px 4px; text-align: center; width: 70px; border: none;">Score</th>
                <th style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; border: none;">Away</th>
                <th class="d-none d-sm-table-cell" style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; white-space:nowrap; border: none;">Date</th>
                <th class="d-none d-md-table-cell" style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; border: none;">Venue</th>
                <th class="d-none d-lg-table-cell" style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; border: none;">Tournament</th>
                <th class="d-none d-lg-table-cell" style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; text-align: center; border: none;">Δpts</th>
                <th class="d-none d-xl-table-cell" style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; text-align: center; border: none;">Rank</th>
                <th class="d-none d-xl-table-cell" style="color: ${headerTextColor}; font-weight: 600; padding: 12px 8px; text-align: center; border: none;">Odds (1-N-2)</th>
            </tr>
        </thead>
        <tbody>
    `;
    for (const m of filtered) {
        // Détermine l'ordre selon le terrain
        let homeTeam, awayTeam, homeScore, awayScore, homeFlag, awayFlag, homeOriginal, awayOriginal;
        if (m.country === m.team1) {
            homeTeam = m.team1;
            awayTeam = m.team2;
            homeOriginal = m.original_team1;
            awayOriginal = m.original_team2;
            homeScore = m.score1;
            awayScore = m.score2;
            homeFlag = m.flag1;
            awayFlag = m.flag2;
        } else if (m.country === m.team2) {
            homeTeam = m.team2;
            awayTeam = m.team1;
            homeOriginal = m.original_team2;
            awayOriginal = m.original_team1;
            homeScore = m.score2;
            awayScore = m.score1;
            homeFlag = m.flag2;
            awayFlag = m.flag1;
        } else {
            homeTeam = m.team1;
            awayTeam = m.team2;
            homeOriginal = m.original_team1;
            awayOriginal = m.original_team2;
            homeScore = m.score1;
            awayScore = m.score2;
            homeFlag = m.flag1;
            awayFlag = m.flag2;
        }

                // Détermine la couleur selon le vainqueur réel
        const isDark = document.body.classList.contains('dark-theme');
        let winner = null;
        if (typeof homeScore === 'number' && typeof awayScore === 'number') {
            if (homeScore > awayScore) winner = homeTeam;
            else if (homeScore < awayScore) winner = awayTeam;
        }
        
        // Créer un badge pour le score avec couleur du vainqueur
        let scoreBadge = `<span style="display: inline-block; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 0.95em; background: ${isDark ? '#404040' : '#e9ecef'}; color: ${isDark ? '#e0e0e0' : '#495057'}; min-width: 50px; text-align: center;">${homeScore} - ${awayScore}</span>`;
        if (winner) {
            const winnerColors = countriesColorsMap[winner];
            if (winnerColors) {
                // Badge avec la couleur primaire du vainqueur et texte en couleur secondaire
                scoreBadge = `<span style="display: inline-block; padding: 5px 10px; border-radius: 6px; font-weight: 700; font-size: 0.95em; background-color: ${winnerColors.primary}; color: ${winnerColors.secondary}; min-width: 50px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.9);">${homeScore} - ${awayScore}</span>`;
            }
        }
        
        const venue = m.country || '';
        const tournament = m.tournament || '';
        const pts = m.rating_ev !== undefined && m.rating_ev !== null && m.rating_ev !== "" ? (m.rating_ev > 0 ? '+' : '') + m.rating_ev : '';
        const rank = m.rank ?? '';
        
        // Calcul des odds si les ratings sont disponibles
        let oddsDisplay = '—';
        if (m.rating1 && m.rating2) {
            const odds = calculateOddsFromRatings(m.rating1, m.rating2);
            if (odds) {
                // Réordonner les cotes selon l'affichage home/away (pas forcément team1/team2)
                const oddHome = (homeTeam === m.team1) ? odds.odd1 : odds.odd2;
                const oddAway = (homeTeam === m.team1) ? odds.odd2 : odds.odd1;
                const oddN    = odds.oddN;

                // Déterminer l'issue réelle par le score (pas par valeur de cote)
                let outcome = null; // 'home', 'draw', 'away'
                if (typeof homeScore === 'number' && typeof awayScore === 'number') {
                    if (homeScore > awayScore) outcome = 'home';
                    else if (homeScore < awayScore) outcome = 'away';
                    else if (homeScore === awayScore) outcome = 'draw';
                }

                const regularBg   = isDark ? '#505050' : '#f0f0f0';
                const regularText = isDark ? '#909090' : '#999';
                const separatorColor = isDark ? '#606060' : '#ddd';

                const homeTeamColors = countriesColorsMap[homeTeam];
                const awayTeamColors = countriesColorsMap[awayTeam];

                const buildBadge = (oddVal, isWinner, teamColors) => {
                    if (isWinner && teamColors) {
                        return `<span style="padding: 3px 8px; border-radius: 4px; font-weight: 700; background-color: ${teamColors.primary}; color: ${teamColors.secondary}; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${oddVal}</span>`;
                    }
                    if (isWinner) {
                        return `<span style="padding: 3px 8px; border-radius: 4px; font-weight: 700; background-color: ${isDark ? '#888' : '#ccc'}; color: ${isDark ? '#fff' : '#333'}; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${oddVal}</span>`;
                    }
                    const bg   = teamColors ? desaturateColor(teamColors.primary) : regularBg;
                    const text = teamColors ? desaturateColor(teamColors.secondary) : regularText;
                    return `<span style="padding: 3px 8px; border-radius: 3px; background-color: ${bg}; color: ${text}; font-weight: 600;">${oddVal}</span>`;
                };

                const homeBadge = buildBadge(oddHome, outcome === 'home', homeTeamColors);
                const drawBadge = buildBadge(oddN,    outcome === 'draw', null);
                const awayBadge = buildBadge(oddAway, outcome === 'away', awayTeamColors);

                oddsDisplay = `<div style="font-size: 0.85em; display: flex; gap: 4px; justify-content: center; align-items: center;">
                    ${homeBadge}
                    <span style="color: ${separatorColor}; opacity: 0.5;">-</span>
                    ${drawBadge}
                    <span style="color: ${separatorColor}; opacity: 0.5;">-</span>
                    ${awayBadge}
                </div>`;
            }
        }
        
        const rowBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)';
        const rowBorder = isDark ? '#333' : '#e9ecef';

            html += `<tr style="background: ${rowBg}; border-bottom: 1px solid ${rowBorder};">
                <td style="padding: 8px; border: none;">${flagImgFromFile(homeFlag, homeOriginal)} ${homeOriginal}</td>
                <td style="text-align: center; padding: 8px 4px; border: none;">${scoreBadge}</td>
                <td style="padding: 8px; border: none;">${flagImgFromFile(awayFlag, awayOriginal)} ${awayOriginal}</td>
                <td class="d-none d-sm-table-cell" style="padding: 8px; border: none; font-size: 0.8em;">${m.date}</td>
                <td class="d-none d-md-table-cell" style="padding: 8px; border: none; font-size: 0.8em;">${venue}</td>
                <td class="d-none d-lg-table-cell" style="padding: 8px; border: none; font-size: 0.8em;">${tournament}</td>
                <td class="d-none d-lg-table-cell" style="padding: 8px; border: none; text-align: center; font-size: 0.8em; color: ${pts.startsWith('+') ? (isDark ? '#4ade80' : '#059669') : (isDark ? '#f87171' : '#dc2626')}; font-weight: 600;">${pts}</td>
                <td class="d-none d-xl-table-cell" style="padding: 8px; border: none; text-align: center; font-size: 0.8em; color: ${isDark ? '#a0a0a0' : '#666'};">${rank}</td>
                <td class="d-none d-xl-table-cell" style="padding: 8px; border: none; text-align: center; font-size: 0.8em;">${oddsDisplay}</td>
            </tr>`;
    }
    html += '</tbody></table></div>';
    return html;
}

// Calcul de l'historique cumulé
function computeH2HStats(matches, team1) {
    let win1 = 0, win2 = 0, draw = 0;
    for (const m of matches) {
        if (m.score1 > m.score2) {
            if (m.team1 === team1) win1++; else win2++;
        } else if (m.score1 < m.score2) {
            if (m.team1 === team1) win2++; else win1++;
        } else {
            draw++;
        }
    }
    const total = win1 + win2 + draw || 1;
    return {
        win1: Math.round(win1/total*1000)/10,
        win2: Math.round(win2/total*1000)/10,
        draw: Math.round(draw/total*1000)/10
    };
}

// Calcul du score prédit (TrendsFC Prediction)
function computePredictedScore(team1, team2) {
    const rank1_off = rankingsMap[team1]?.ranking_off ?? 999;
    const rank1_def = rankingsMap[team1]?.ranking_def ?? 999;
    const rank2_off = rankingsMap[team2]?.ranking_off ?? 999;
    const rank2_def = rankingsMap[team2]?.ranking_def ?? 999;

    // Formule: TRUNC((classement def adversaire - classement off équipe) / 10) + 1
    let goals1 = Math.trunc((rank2_def - rank1_off) / 10) + 1;
    let goals2 = Math.trunc((rank1_def - rank2_off) / 10) + 1;

    // Si négatif, on met 0
    goals1 = Math.max(0, goals1);
    goals2 = Math.max(0, goals2);

    // Bonus si classement off dans top 5
    if (rank1_off <= 5) goals1 += 1;
    if (rank2_off <= 5) goals2 += 1;

    // Transformation polynomiale: y = 0.0049*x^3 - 0.147*x^2 + 1.48*x - 0.39
    const transformGoals = (x) => {
        return 0.0049 * Math.pow(x, 3) - 0.147 * Math.pow(x, 2) + 1.48 * x - 0.39;
    };

    goals1 = Math.round(transformGoals(goals1));
    goals2 = Math.round(transformGoals(goals2));

    return { goals1, goals2 };
}

// Affichage du score prédit
function renderPredictedScore(team1, team2, goals1, goals2, colors) {
    const { color1, color2, textColor1, textColor2 } = colors ?? { color1: '#FF4560', color2: '#008FFB', textColor1: '#FFFFFF', textColor2: '#FFFFFF' };
    const isDark = document.body.classList.contains('dark-theme');
    
    // Pour le fond, on utilise des versions très sombres ou très claires selon le thème
    const bgColor = isDark ? '#1a1d21' : '#f8f9fa';
    const borderColor = isDark ? '#444' : '#dee2e6';
    const titleColor = isDark ? '#aaa' : '#666';

    // On s'assure que les scores ressortent (si la couleur principale est trop proche du fond)
    const lumBackground = isDark ? 30 : 240;
    const lum1 = getColorLuminance(color1);
    const lum2 = getColorLuminance(color2);
    
    // Si en mode sombre la couleur est trop sombre, on utilise la secondaire pour le texte
    // Si en mode clair la couleur est trop claire, on utilise la secondaire
    const scoreColor1 = isDark ? (lum1 < 70 ? textColor1 : color1) : (lum1 > 180 ? textColor1 : color1);
    const scoreColor2 = isDark ? (lum2 < 70 ? textColor2 : color2) : (lum2 > 180 ? textColor2 : color2);

    return `
        <div class="prediction-container mb-4" style="background: ${bgColor}; padding: 20px; border-radius: 12px; border: 1px solid ${borderColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative; overflow: hidden;">
            <!-- Dégradé très subtil en arrière-plan basé sur les couleurs d'équipe client -->
            <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(135deg, ${color1}15 0%, ${color2}15 100%); pointer-events: none;"></div>
            
            <div style="text-align: center; margin-bottom: 12px; position: relative;">
                <h6 style="color: ${titleColor}; margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-size: 0.8em;">TrendsFC Prediction</h6>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-around; position: relative;">
                <div style="text-align: center;">
                    <div style="font-size: 0.9em; color: ${titleColor}; margin-bottom: 4px; font-weight: 500;">${team1}</div>
                    <div style="font-size: 3em; font-weight: 900; color: ${scoreColor1}; line-height: 1; text-shadow: ${isDark ? '0 0 10px rgba(0,0,0,0.5)' : 'none'};">${goals1}</div>
                </div>
                <div style="font-size: 1.5em; color: ${titleColor}; font-weight: bold; opacity: 0.5;">-</div>
                <div style="text-align: center;">
                    <div style="font-size: 0.9em; color: ${titleColor}; margin-bottom: 4px; font-weight: 500;">${team2}</div>
                    <div style="font-size: 3em; font-weight: 900; color: ${scoreColor2}; line-height: 1; text-shadow: ${isDark ? '0 0 10px rgba(0,0,0,0.5)' : 'none'};">${goals2}</div>
                </div>
            </div>
        </div>
    `;
}

// Affichage des "True betting odds"
function renderBettingOdds(team1, team2, probas, colors) {
    const { color1, color2, textColor1, textColor2 } = colors ?? { color1: '#FF4560', color2: '#008FFB', textColor1: '#FFFFFF', textColor2: '#FFFFFF' };
    const isDark = document.body.classList.contains('dark-theme');
    const borderColor = isDark ? '#444' : '#dee2e6';
    const titleColor = isDark ? '#aaa' : '#666';
    const oddBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';

    // Calcul des cotes (0.9 / proba) avec minimum 1.00
    const calcOdd = (p) => {
        if (!p || p <= 0) return '—';
        const val = 0.96 / (p / 100);
        return Math.max(1.00, val).toFixed(2);
    };
    const odd1 = calcOdd(probas.win1);
    const oddN = calcOdd(probas.draw);
    const odd2 = calcOdd(probas.win2);

    // Gestion du contraste pour les couleurs d'équipe
    const lum1 = getColorLuminance(color1);
    const lum2 = getColorLuminance(color2);
    const oddColor1 = isDark ? (lum1 < 70 ? textColor1 : color1) : (lum1 > 180 ? '#333' : color1);
    const oddColor2 = isDark ? (lum2 < 70 ? textColor2 : color2) : (lum2 > 180 ? '#333' : color2);

    return `
        <div class="betting-odds-container mb-4" style="text-align: center; border-top: 1px dashed ${borderColor}; padding-top: 15px;">
            <div style="font-size: 0.75em; color: ${titleColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">TrendsFC True Betting Odds</div>
            <div style="display: flex; justify-content: center; gap: 15px;">
                <div style="background: ${oddBg}; padding: 8px 15px; border-radius: 8px; min-width: 80px;">
                    <div style="font-size: 0.7em; color: ${titleColor}; margin-bottom: 2px;">1</div>
                    <div style="font-size: 1.2em; font-weight: 800; color: ${oddColor1};">${odd1}</div>
                </div>
                <div style="background: ${oddBg}; padding: 8px 15px; border-radius: 8px; min-width: 80px;">
                    <div style="font-size: 0.7em; color: ${titleColor}; margin-bottom: 2px;">N</div>
                    <div style="font-size: 1.2em; font-weight: 800; color: ${isDark ? '#ccc' : '#444'};">${oddN}</div>
                </div>
                <div style="background: ${oddBg}; padding: 8px 15px; border-radius: 8px; min-width: 80px;">
                    <div style="font-size: 0.7em; color: ${titleColor}; margin-bottom: 2px;">2</div>
                    <div style="font-size: 1.2em; font-weight: 800; color: ${oddColor2};">${odd2}</div>
                </div>
            </div>
        </div>
    `;
}

// Rafraîchit toute la page
async function refreshAll() {
    const team1 = document.getElementById('team1Select').value;
    const team2 = document.getElementById('team2Select').value;
    const neutral = document.getElementById('neutralToggle').checked;
    const donutMode = document.getElementById('toggleDonutMode').checked;

    // Charge les données
    const [data1, data2] = await Promise.all([loadTeamData(team1), loadTeamData(team2)]);
    data1.team = team1;
    data2.team = team2;

    // Derniers points
    // Utilise le ranking officiel si dispo, sinon le dernier match
    const lastPoints1 = rankingsMap[team1]?.points ?? (data1.matches.find(m => m.type === 'past')?.rating1 ?? 0);
    const lastPoints2 = rankingsMap[team2]?.points ?? (data2.matches.find(m => m.type === 'past')?.rating1 ?? 0);

    // Calcul probabilités (nouvelle méthode avec Nul)
    const matchProbas = calculateMatchProbas(lastPoints1, lastPoints2, neutral);

    // Historique des confrontations
    const h2hMatches = data1.matches
        .filter(m => m.team2 === team2)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Stats cumulées
    const h2hStats = computeH2HStats(h2hMatches, team1);

    // Affichage panels
    document.getElementById('team1Panel').innerHTML = renderTeamPanel(data1, 'left');
    document.getElementById('team2Panel').innerHTML = renderTeamPanel(data2, 'right');

    // Affichage donut/historique cumulé et prédiction
    const colors = getTeamColors(team1, team2);
    
    // Calcul du score prédit
    const predictedScore = computePredictedScore(team1, team2);
    
    // Affichage de la prédiction
    const predictionContainer = document.getElementById('predictionContainer');
    if (predictionContainer) {
        predictionContainer.innerHTML = renderPredictedScore(team1, team2, predictedScore.goals1, predictedScore.goals2, colors);
    }
    
    // Affichage des "True betting odds"
    const bettingOddsContainer = document.getElementById('bettingOddsContainer');
    if (bettingOddsContainer) {
        bettingOddsContainer.innerHTML = renderBettingOdds(team1, team2, matchProbas, colors);
    }
    
    renderDonutOrHistory(matchProbas, h2hStats, donutMode, team1, team2, colors);

    // Affiche ou masque le switch "Neutral ground" selon le mode
    const neutralSwitchWrapper = document.getElementById('neutralSwitchWrapper');
    if (neutralSwitchWrapper) {
        neutralSwitchWrapper.style.display = donutMode ? 'none' : '';
    }

    // Affichage historique des confrontations
    document.getElementById('headToHeadHistory').innerHTML = renderHeadToHead(h2hMatches, team1, team2);
}

// Listeners
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadTeamsList(), loadCountriesColors()]);
    populateTeamSelects();
    refreshAll();
    document.getElementById('team1Select').addEventListener('change', refreshAll);
    document.getElementById('team2Select').addEventListener('change', refreshAll);
    document.getElementById('neutralToggle').addEventListener('change', refreshAll);
    
    // Gestion du swipe et click pour la section Donut
    const donutSection = document.getElementById('donutSection');
    const toggleDonut = document.getElementById('toggleDonutMode');
    
    if (donutSection && toggleDonut) {
        // Switch au clic sur la section (mais pas sur le toggle neutral ground)
        donutSection.addEventListener('click', (e) => {
            if (!e.target.closest('#neutralSwitchWrapper')) {
                toggleDonut.checked = !toggleDonut.checked;
                refreshAll();
            }
        });

        // Gestion du swipe
        let touchstartX = 0;
        let touchendX = 0;
        
        donutSection.addEventListener('touchstart', e => touchstartX = e.changedTouches[0].screenX, false);
        donutSection.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            if (Math.abs(touchendX - touchstartX) > 50) { // Seuil de 50px pour le swipe
                toggleDonut.checked = !toggleDonut.checked;
                refreshAll();
            }
        }, false);
    }

    // Dark mode switch (comme dans matches)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-theme');
            themeToggle.textContent = '☀️';
        }
        themeToggle.addEventListener('click', function() {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            themeToggle.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            refreshAll();
        });
    }
});
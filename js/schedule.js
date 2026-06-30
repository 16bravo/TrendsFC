// Helper: get URL parameter
function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Set page title and document title
function setPageTitle(type) {
    const title = type === "fixture" ? "Fixtures" : "Latest Matches";
    document.getElementById("page-title").textContent = title;
    document.title = title + " | TrendsFC";
}

// --- Couleurs équipes & cotes ---
let countriesColorsMap = {};

async function loadCountriesColors() {
    try {
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
    } catch(e) { /* ignore */ }
}

function desaturateColor(hex, amount = 0.5) {
    if (!hex || !hex.startsWith('#')) return hex;
    const hexClean = hex.replace(/^#/, '');
    const full = hexClean.length === 3 ? hexClean.split('').map(c => c + c).join('') : hexClean;
    const num = parseInt(full, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    const gray = Math.round(0.05 * r + 0.05 * g + 0.05 * b);
    const nr = Math.round(r + (gray - r) * amount);
    const ng = Math.round(g + (gray - g) * amount);
    const nb = Math.round(b + (gray - b) * amount);
    return '#' + [nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function renderOddsBadges(match, type) {
    if (!match.rating1 || !match.rating2) return '—';
    const X = Math.abs(match.rating1 - match.rating2);
    const V = 1 / (1 + 2.0134 * Math.exp(-0.006581 * Math.pow(X, 0.9391)));
    const D = Math.min(1 - V, 0.3265 / (1 + 0.000071 * Math.pow(X, 1.801)));
    const N = 1 - V - D;
    let prob1, probN, prob2;
    if (match.rating1 >= match.rating2) {
        prob1 = V; prob2 = D; probN = N;
    } else {
        prob1 = D; prob2 = V; probN = N;
    }
    const odd1 = Math.max(1.00, 0.9 / prob1).toFixed(2);
    const oddN = Math.max(1.00, 0.9 / probN).toFixed(2);
    const odd2 = Math.max(1.00, 0.9 / prob2).toFixed(2);

    const isDark = document.body.classList.contains('dark-theme');
    const team1Colors = countriesColorsMap[match.team1];
    const team2Colors = countriesColorsMap[match.team2];
    const sep = `<span style="color:${isDark ? '#606060' : '#ccc'};padding:0 1px;">-</span>`;

    const makeBadge = (val, isWinner, teamColors, isNeutral) => {
        if (type === 'fixture') {
            if (isNeutral) {
                return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:700;background:${isDark ? '#555' : '#888'};color:#fff;">${val}</span>`;
            }
            if (teamColors) {
                return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:700;background:${teamColors.primary};color:${teamColors.secondary};">${val}</span>`;
            }
            return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:700;background:${isDark ? '#555' : '#888'};color:#fff;">${val}</span>`;
        } else {
            if (isWinner) {
                if (isNeutral) {
                    return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:700;background:${isDark ? '#888' : '#ccc'};color:${isDark ? '#fff' : '#333'};box-shadow:0 1px 3px rgba(0,0,0,0.2);">${val}</span>`;
                }
                if (teamColors) {
                    return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:700;background:${teamColors.primary};color:${teamColors.secondary};box-shadow:0 1px 3px rgba(0,0,0,0.2);">${val}</span>`;
                }
                return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:700;background:${isDark ? '#888' : '#ccc'};color:${isDark ? '#fff' : '#333'};">${val}</span>`;
            } else {
                const bg = isNeutral
                    ? (isDark ? '#3a3a3a' : '#f0f0f0')
                    : (teamColors ? desaturateColor(teamColors.primary) : (isDark ? '#3a3a3a' : '#f0f0f0'));
                const fg = isNeutral
                    ? (isDark ? '#666' : '#bbb')
                    : (teamColors ? desaturateColor(teamColors.secondary) : (isDark ? '#666' : '#bbb'));
                return `<span style="padding:1px 5px;border-radius:3px;font-size:0.8em;font-weight:600;background:${bg};color:${fg};">${val}</span>`;
            }
        }
    };

    let outcome = null;
    if (type === 'past' && typeof match.score1 === 'number' && typeof match.score2 === 'number') {
        if (match.score1 > match.score2) outcome = 1;
        else if (match.score1 < match.score2) outcome = 2;
        else outcome = 0;
    }

    const badge1 = makeBadge(odd1, outcome === 1, team1Colors, false);
    const badgeN = makeBadge(oddN, outcome === 0, null,        true);
    const badge2 = makeBadge(odd2, outcome === 2, team2Colors, false);

    return `<div style="display:flex;gap:3px;align-items:center;justify-content:center;">${badge1}${sep}${badgeN}${sep}${badge2}</div>`;
}

$(document).ready(function() {
    // 1. Lire le paramètre type
    let type = getUrlParam("type");
    if (type !== "fixture") type = "past"; // fallback

    // 2. Mettre à jour le titre
    setPageTitle(type);

    // 3. Charger le JSON
    $.getJSON("data/json/all_matches.json", async function(data) {
        await loadCountriesColors();
        // 4. Filtrer les matchs selon le type
        let matches = (data.matches || []).filter(m => m.type === type);

        // Tri : décroissant pour "past", croissant pour "fixture"
        matches.sort((a, b) => {
            if (type === "fixture") {
                return a.date.localeCompare(b.date); // plus ancien d'abord
            } else {
                return b.date.localeCompare(a.date); // plus récent d'abord
            }
        });

        // --- Génération dynamique des filtres ---
        const teamSet = new Set();
        const tournamentSet = new Set();
        matches.forEach(match => {
            if (match.team1) teamSet.add(match.team1);
            if (match.team2) teamSet.add(match.team2);
            if (match.tournament) tournamentSet.add(match.tournament);
        });
        $('#teamFilter').empty().append('<option value="">All</option>');
        $('#tournamentFilter').empty().append('<option value="">All</option>');
        [...teamSet].sort().forEach(team => {
            $('#teamFilter').append(`<option value="${team}">${team}</option>`);
        });
        [...tournamentSet].sort().forEach(tour => {
            $('#tournamentFilter').append(`<option value="${tour}">${tour}</option>`);
        });

        // --- Fonction de rendu du tableau ---
        function renderTable(filteredMatches) {
            // En-têtes du tableau
            const columns = [
                { key: "date", label: "Date" },
                { key: "country", label: "Country" },
                { key: "tournament", label: "Tournament" },
                { key: "team1", label: "Team 1", flag: "flag1" },
                { key: "score", label: "Score" },
                { key: "team2", label: "Team 2", flag: "flag2" },
                { key: "rating1", label: "Rating 1" },
                { key: "rating2", label: "Rating 2" },
                { key: "rank1", label: "Rank 1" },
                { key: "rank2", label: "Rank 2" },
                { key: "odds", label: "Odds (1-N-2)" },
                { key: "rating_ev", label: "Points Change" }
            ];

            // Efface l'ancien tableau
            $(".table-responsive").remove();

            let html = '<div class="table-responsive"><table class="table table-striped table-bordered">';
            html += '<thead class="thead-dark"><tr>';
            columns.forEach(col => html += `<th>${col.label}</th>`);
            html += '</tr></thead><tbody>';

            filteredMatches.forEach(match => {
                html += '<tr>';
                columns.forEach(col => {
                    if (col.flag) {
                        // Lien vers la page équipe avec drapeau inclus
                        const teamName = match[col.key] || '';
                        const flag = match["flag" + col.key.slice(-1)] || '';
                        const refTeam = match["original_" + col.key] || teamName;
                        html += `<td>
                            <a href="matches.html?team=${encodeURIComponent(refTeam).replace(/&/g, "%26")}">
                                <img src="img/flags/${flag}" alt="" class="mr-1" />${teamName}
                            </a>
                        </td>`;
                    } else if (col.key === "score") {
                        // Affiche score1 - score2 ou "-"
                        if (match.type === "fixture") {
                            html += `<td>-</td>`;
                        } else {
                            html += `<td>${match.score1} - ${match.score2}</td>`;
                        }
                    } else if (col.key === "odds") {
                        html += `<td>${renderOddsBadges(match, type)}</td>`;
                    } else if (col.key === "rating_ev") {
                        if (typeof match.rating_ev === "number" && match.rating_ev !== 0) {
                            const gainTeam  = match.rating_ev > 0 ? match.team1  : match.team2;
                            const gainFlag  = match.rating_ev > 0 ? match.flag1  : match.flag2;
                            const gainValue = Math.abs(Math.round(match.rating_ev));
                            const flagImg   = gainFlag ? `<img src="img/flags/${gainFlag}" alt="${gainTeam}" class="mr-1" style="height:1.2em;vertical-align:middle;">` : '';
                            html += `<td style="white-space:nowrap;">${flagImg}+${gainValue}</td>`;
                        } else {
                            html += `<td>0</td>`;
                        }
                    } else {
                        html += `<td>${match[col.key] !== undefined ? match[col.key] : ''}</td>`;
                    }
                });
                html += '</tr>';
            });

            html += '</tbody></table></div>';
            $(".container").append(html);
        }

        // --- Fonction de filtrage ---
        function filterAndRender() {
            let selectedTeam = $('#teamFilter').val();
            let selectedTournament = $('#tournamentFilter').val();
            let dateFrom = $('#dateFrom').val();
            let dateTo = $('#dateTo').val();

            let filtered = matches.filter(match => {
                // Team filter (team1 or team2)
                if (selectedTeam && match.team1 !== selectedTeam && match.team2 !== selectedTeam) return false;
                // Tournament filter
                if (selectedTournament && match.tournament !== selectedTournament) return false;
                // Date range
                if (dateFrom && match.date < dateFrom) return false;
                if (dateTo && match.date > dateTo) return false;
                return true;
            });

            renderTable(filtered);
        }

        // --- Écouteurs sur les filtres ---
        $('#teamFilter, #tournamentFilter, #dateFrom, #dateTo').on('change', filterAndRender);

        // Affichage initial
        filterAndRender();

        // --- Theme toggle logic ---
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            // Load theme from localStorage if available
            if (localStorage.getItem('theme') === 'dark') {
                document.body.classList.add('dark-theme');
                themeToggle.textContent = '☀️';
            }
            themeToggle.addEventListener('click', function() {
                document.body.classList.toggle('dark-theme');
                const isDark = document.body.classList.contains('dark-theme');
                themeToggle.textContent = isDark ? '☀️' : '🌙';
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }
    });
});
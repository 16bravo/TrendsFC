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

$(document).ready(function() {
    // 1. Lire le paramètre type
    let type = getUrlParam("type");
    if (type !== "fixture") type = "past"; // fallback

    // 2. Mettre à jour le titre
    setPageTitle(type);

    // 3. Charger le JSON
    $.getJSON("data/json/all_matches.json", function(data) {
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
                { key: "win_prob", label: "Win Prob (%)" },
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
                    } else if (col.key === "win_prob" && match.win_prob !== undefined) {
                        html += `<td>${Math.round(match.win_prob)}%</td>`;
                    } else if (col.key === "rating_ev") {
                        if (typeof match.rating_ev === "number") {
                            html += `<td>${match.rating_ev > 0 ? "+" : ""}${Math.round(match.rating_ev)}</td>`;
                        } else {
                            html += `<td></td>`;
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
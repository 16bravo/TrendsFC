document.addEventListener('DOMContentLoaded', function () {
    // Extract team name from the URL
    const teamName = decodeURIComponent(new URLSearchParams(window.location.search).get('team'));

    // Default JSON file path for team results (adjust as needed)
    const jsonFilePath = `data/json/matches/${teamName}.json`;

    // Load team rankings for off/def stats
    let teamRankingsData = {};
    async function loadTeamRankings() {
        try {
            const response = await fetch('data/json/rankings/LatestRankings.json');
            const data = await response.json();
            if (data.rankings) {
                data.rankings.forEach(r => {
                    teamRankingsData[r.team] = r;
                });
            }
        } catch (e) {
            console.log('Could not load rankings data');
        }
    }

    // Function to load team results JSON file
    async function loadTeamResultsJSON(filePath) {
        const response = await fetch(filePath);
        const jsonData = await response.json();
        return jsonData;
    }

    // Load both rankings and results in parallel
    Promise.all([loadTeamRankings(), loadTeamResultsJSON(jsonFilePath)]).then(([_, teamResultsData]) => {
        
        // Modifiy page name and h1 title
        document.title = `${teamName} Results`;
        document.getElementById('h1title').textContent = teamName + " Results";

        // Reference to team results table body
        const teamResultsBody = document.getElementById('team-results-body');
        // console.log('Team Results Data:', teamResultsData);

        // Remplir les badges Best/Worst rank (toujours visibles)
        document.getElementById('best-rank').textContent = teamResultsData.stats.best_rank;
        document.getElementById('worst-rank').textContent = teamResultsData.stats.worst_rank;

        // Remplir les stat cards du collapsible
        document.getElementById('avg-rank').textContent = teamResultsData.stats.avg_rank;
        document.getElementById('total-matches').textContent = teamResultsData.stats.matches_played;
        document.getElementById('avg-points').textContent = teamResultsData.stats.avg_points;
        document.getElementById('goals-for-against').textContent = teamResultsData.stats.goals_for + ' / ' + teamResultsData.stats.goals_against;

        // Biggest win
        const bw = teamResultsData.stats.biggest_win;
        document.getElementById('biggest-win').innerHTML = `<img src="img/flags/${bw.flag}" class="flag" alt="${bw.opponent}"> ${bw.score} vs ${bw.opponent}`;

        // Biggest loss
        const bl = teamResultsData.stats.biggest_loss;
        document.getElementById('biggest-loss').innerHTML = `<img src="img/flags/${bl.flag}" class="flag" alt="${bl.opponent}"> ${bl.score} vs ${bl.opponent}`;

        // Extracting flag value for title
        const firstLine = teamResultsData.matches[0];
        const flag1Value = firstLine.flag1;
        const flagA = document.getElementById('flagTitle');
        if (flagA) {
            flagA.innerHTML = `<img src="img/flags/${flag1Value}" alt="${teamName}">`;
        }

        const matchesArray = teamResultsData.matches || [];
        // Loop through team results data and construct table rows
        matchesArray.forEach(match => {
            var color;
            if(match.score1 - match.score2 > 0) {
            color = 'green';
            }
            else if (match.score1 - match.score2 < 0) {
            color = 'red';
            }
            else {
            color = 'black';
            }
            const row = document.createElement('tr');
            row.classList.add(match.type);
            row.innerHTML = `
            <td>${match.date}</td>
            <td>${match.country}</td>
            <td>${match.tournament}</td>
            <td>vs <a href="matches.html?team=${match.team2.replace(/&/g, "%26")}"><img class="flag" src="img/flags/${match.flag2}" alt="${match.team2}"></a> <a href="matches.html?team=${match.team2}">${match.original_team2}</a></td>
            <td>${Math.round(match.rating1-match.rating_ev)}</td>
            <td>${Math.round(match.rating2+match.rating_ev)}</td>
            <td>
                <div class="percentage-indicator" data-percent="${match.win_prob}">
                    <div class="fill"></div>
                        <span class="text">${match.win_prob} %</span>
                </div>
            </td>
            <td class="match" style="color:${color};"><b>${match.score1} - ${match.score2}</b></td>
            <td class="display-${match.type}">${Math.round(match.rating1)} (${match.rating_ev >= 0 ? '+' : ''}${Math.round(match.rating_ev)})</td>
            <td class="display-${match.type}">${match.rank}</td>
            `;
            teamResultsBody.appendChild(row);
        });

        // % Win Gauge Indicator
        const percentageIndicators = document.querySelectorAll('.percentage-indicator');

        percentageIndicators.forEach(indicator => {
            const percentValue = parseFloat(indicator.getAttribute('data-percent'));
            const fillElement = document.createElement('div');
            fillElement.classList.add('fill');
            fillElement.classList.add('lv-'+Math.ceil(percentValue/20).toString());
            fillElement.style.width = percentValue + '%';
            indicator.innerHTML = '';
            indicator.appendChild(fillElement);
            indicator.innerHTML += `<span class="text">${percentValue}%</span>`;
        });

        // 1. Remplir la liste des adversaires avec les valeurs distinctes de team2
        const opponentSet = new Set();
        teamResultsData.matches.forEach(match => {
            if (match.type === 'past' && match.team2) {
                opponentSet.add(match.team2); // on prend bien le nom "standardisé"
            }
        });
        const opponentFilter = document.getElementById('opponentFilter');
        [...opponentSet].sort().forEach(opp => {
            const option = document.createElement('option');
            option.value = opp;
            option.textContent = opp;
            opponentFilter.appendChild(option);
        });
        // 1bis. Remplir dynamiquement la liste des tournois
        const tournamentSet = new Set();
        teamResultsData.matches.forEach(match => {
            if (match.tournament) {
                tournamentSet.add(match.tournament);
            }
        });
        const tournamentFilter = document.getElementById('tournamentFilter');
        [...tournamentSet].sort().forEach(tour => {
            const option = document.createElement('option');
            option.value = tour;
            option.textContent = tour;
            tournamentFilter.appendChild(option);
        });

        // 2. Fonction de filtrage
        function filterAndRenderTable() {
            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'block';

            setTimeout(() => {
                // Récupère les valeurs des filtres
                const selectedOpponent = document.getElementById('opponentFilter').value;
                const selectedVenue = document.getElementById('venueFilter').value;
                const selectedTournament = document.getElementById('tournamentFilter').value;
                const dateFrom = document.getElementById('dateFrom').value;
                const dateTo = document.getElementById('dateTo').value;

                // Vide le tableau
                teamResultsBody.innerHTML = '';

                // Filtre les matchs (on garde past ET fixture)
                let filtered = teamResultsData.matches.filter(match => {
                // Opponent
                if (selectedOpponent && match.team2 !== selectedOpponent) return false;

                    // Venue
                    if (selectedVenue) {
                        if (selectedVenue === 'home' && match.country !== teamName) return false;
                        if (selectedVenue === 'away' && match.country !== match.original_team2) return false;
                        if (selectedVenue === 'neutral' && (match.country === teamName || match.country === match.original_team2)) return false;
                    }

                    // Tournament
                    if (selectedTournament && match.tournament !== selectedTournament) return false;

                    // Date range
                    if (dateFrom && match.date < dateFrom) return false;
                    if (dateTo && match.date > dateTo) return false;

                    return true;
                });

                // Génère les lignes du tableau filtré
                filtered.forEach(match => {
                    let color = 'black';
                    if (match.type === 'past') {
                        if (match.score1 - match.score2 > 0) color = 'green';
                        else if (match.score1 - match.score2 < 0) color = 'red';
                    }
                    const isFixture = match.type === 'fixture';
                    const row = document.createElement('tr');
                    row.classList.add(match.type);
                    row.innerHTML = `
                        <td>${match.date}</td>
                        <td>${match.country}</td>
                        <td>${match.tournament}</td>
                        <td>vs <a href="matches.html?team=${match.team2.replace(/&/g, "%26")}"><img class="flag" src="img/flags/${match.flag2}" alt="${match.team2}"></a> <a href="matches.html?team=${match.team2}">${match.original_team2}</a></td>
                        <td>${Math.round(match.rating1-match.rating_ev)}</td>
                        <td>${Math.round(match.rating2+match.rating_ev)}</td>
                        <td>
                            <div class="percentage-indicator" data-percent="${match.win_prob}">
                                <div class="fill"></div>
                                <span class="text">${match.win_prob} %</span>
                            </div>
                        </td>
                        <td class="match" style="color:${color};"><b>${isFixture ? '-' : match.score1 + ' - ' + match.score2}</b></td>
                        <td class="display-${match.type}">${Math.round(match.rating1)} (${match.rating_ev >= 0 ? '+' : ''}${Math.round(match.rating_ev)})</td>
                        <td class="display-${match.type}">${match.rank}</td>
                    `;
                    teamResultsBody.appendChild(row);
                });

                // Recharge les barres de pourcentage
                const percentageIndicators = document.querySelectorAll('.percentage-indicator');
                percentageIndicators.forEach(indicator => {
                    const percentValue = parseFloat(indicator.getAttribute('data-percent'));
                    const fillElement = document.createElement('div');
                    fillElement.classList.add('fill');
                    fillElement.classList.add('lv-' + Math.ceil(percentValue / 20).toString());
                    fillElement.style.width = percentValue + '%';
                    indicator.innerHTML = '';
                    indicator.appendChild(fillElement);
                    indicator.innerHTML += `<span class="text">${percentValue}%</span>`;
                });

                if (loader) loader.style.display = 'none';
            }, 100);
        }

        // 3. Ajoute les écouteurs d'événements sur les filtres
        document.getElementById('opponentFilter').addEventListener('change', filterAndRenderTable);
        document.getElementById('venueFilter').addEventListener('change', filterAndRenderTable);
        document.getElementById('tournamentFilter').addEventListener('change', filterAndRenderTable);
        document.getElementById('dateFrom').addEventListener('change', filterAndRenderTable);
        document.getElementById('dateTo').addEventListener('change', filterAndRenderTable);

        // 4. Appel initial pour afficher le tableau filtré (tous les matchs)
        filterAndRenderTable();

        // Barchart Graph : Team Points over time

        const apexDiv = document.getElementById('apexChart');
        const pastMatches = teamResultsData.matches.filter(m => m.type === 'past' && m.rank && m.rating1);

        // Prépare les données pour tous les graphiques
        const rankSeries = pastMatches.map(m => ({ x: m.date, y: m.rank }));
        const pointsSeries = pastMatches.map(m => ({ x: m.date, y: m.rating1 }));
        const offRankSeries = pastMatches.map(m => ({ x: m.date, y: m.ranking_off || m.rank }));
        const defRankSeries = pastMatches.map(m => ({ x: m.date, y: m.ranking_def || m.rank }));
        const offPointsSeries = pastMatches.map(m => ({ x: m.date, y: m.points_off || m.rating1 }));
        const defPointsSeries = pastMatches.map(m => ({ x: m.date, y: m.points_def || m.rating1 }));

        // Affiche les stats off/def actuelles
        const currentTeamStats = teamRankingsData[teamName];
        if (currentTeamStats) {
            const offDefStatsDiv = document.getElementById('offDefStats');
            if (offDefStatsDiv) {
                offDefStatsDiv.innerHTML = `
                    <div class="row mt-4">
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h6 class="card-title">Off Rating</h6>
                                    <p class="card-text"><strong>${currentTeamStats.points_off || '?'}</strong></p>
                                    <small class="text-muted">Rank: ${currentTeamStats.ranking_off || '?'}</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center">
                                <div class="card-body">
                                    <h6 class="card-title">Def Rating</h6>
                                    <p class="card-text"><strong>${currentTeamStats.points_def || '?'}</strong></p>
                                    <small class="text-muted">Rank: ${currentTeamStats.ranking_def || '?'}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Fonction pour créer le graphique
        function renderApexChart(type) {
            let seriesData = rankSeries;
            let seriesName = 'Rank';
            let yAxisTitle = 'Rank';
            let color = '#4bc0c0';
            let reversed = true;

            if (type === 'rank') {
                seriesData = rankSeries;
                seriesName = 'Rank';
                yAxisTitle = 'Rank';
                color = '#4bc0c0';
                reversed = true;
            } else if (type === 'points') {
                seriesData = pointsSeries;
                seriesName = 'Points';
                yAxisTitle = 'Points';
                color = '#ffa726';
                reversed = false;
            } else if (type === 'offRank') {
                seriesData = offRankSeries;
                seriesName = 'Off Rank';
                yAxisTitle = 'Off Rank';
                color = '#66bb6a';
                reversed = true;
            } else if (type === 'defRank') {
                seriesData = defRankSeries;
                seriesName = 'Def Rank';
                yAxisTitle = 'Def Rank';
                color = '#ef5350';
                reversed = true;
            } else if (type === 'offPoints') {
                seriesData = offPointsSeries;
                seriesName = 'Off Points';
                yAxisTitle = 'Off Points';
                color = '#66bb6a';
                reversed = false;
            } else if (type === 'defPoints') {
                seriesData = defPointsSeries;
                seriesName = 'Def Points';
                yAxisTitle = 'Def Points';
                color = '#ef5350';
                reversed = false;
            }

            const options = {
                chart: {
                    type: 'line',
                    height: 400,
                    toolbar: { show: false }
                },
                series: [{
                    name: seriesName,
                    data: seriesData
                }],
                xaxis: {
                    type: 'datetime',
                    title: { text: 'Date' }
                },
                yaxis: {
                    reversed: reversed,
                    title: { text: yAxisTitle }
                },
                stroke: {
                    curve: 'smooth',
                    width: 2
                },
                markers: {
                    size: 0
                },
                colors: [color],
                tooltip: {
                    x: { format: 'yyyy-MM-dd' }
                }
            };
            if (window.apexChartObj) {
                window.apexChartObj.updateOptions(options);
            } else {
                window.apexChartObj = new ApexCharts(apexDiv, options);
                window.apexChartObj.render();
            }
        }

        // Affiche le graphique classement au chargement
        renderApexChart('rank');

        // Toggle switch pour changer de graphique
        const chartTypeSwitch = document.getElementById('chartTypeSwitch');
        if (chartTypeSwitch) {
            chartTypeSwitch.addEventListener('change', function () {
                renderApexChart(chartTypeSwitch.checked ? 'points' : 'rank');
            });
        }

        // Créer les boutons pour off/def si l'élément existe
        const chartSelectorDiv = document.getElementById('chartSelector');
        if (chartSelectorDiv) {
            chartSelectorDiv.innerHTML = `
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-outline-primary active chart-btn" data-type="rank">Rank</button>
                    <button type="button" class="btn btn-sm btn-outline-primary chart-btn" data-type="points">Points</button>
                    <button type="button" class="btn btn-sm btn-outline-success chart-btn" data-type="offRank">Off Rank</button>
                    <button type="button" class="btn btn-sm btn-outline-success chart-btn" data-type="offPoints">Off Points</button>
                    <button type="button" class="btn btn-sm btn-outline-danger chart-btn" data-type="defRank">Def Rank</button>
                    <button type="button" class="btn btn-sm btn-outline-danger chart-btn" data-type="defPoints">Def Points</button>
                </div>
            `;

            // Ajouter les listeners aux boutons
            const chartButtons = document.querySelectorAll('.chart-btn');
            chartButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    // Retirer la classe active de tous les boutons
                    chartButtons.forEach(b => b.classList.remove('active'));
                    // Ajouter active au bouton cliqué
                    this.classList.add('active');
                    // Mettre à jour le graphique
                    renderApexChart(this.getAttribute('data-type'));
                });
            });
        }
    });
});
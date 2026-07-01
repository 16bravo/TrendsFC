// --- Gestion du thème ---
document.addEventListener('DOMContentLoaded', function () {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-theme');
            themeToggle.textContent = '☀️';
        }
        themeToggle.addEventListener('click', function () {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            themeToggle.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }
});

// --- Chargement des couleurs d'équipes ---
let teamColors = {};
fetch("data/source/match_dataset/countries_names.csv")
    .then(response => response.text())
    .then(text => {
        const lines = text.trim().split('\n');
        lines.slice(1).forEach(line => {
            const [original_name, current_name, color_code] = line.split(',');
            teamColors[current_name] = color_code;
        });
    });

// --- Variables globales ---
let selectedTeams = [];
let competitionData = [];

// --- Génération de la sidebar équipes ---
function updateTeamSidebar(teams) {
    const container = document.getElementById('teamCheckboxList');
    container.innerHTML = '';
    teams.forEach(team => {
        const id = 'team_' + team.replace(/\W/g, '');
        const div = document.createElement('div');
        div.className = 'form-check mb-1';
        div.innerHTML = `
            <input class="form-check-input" type="checkbox" value="${team}" id="${id}" checked>
            <label class="form-check-label" for="${id}">${team}</label>
        `;
        container.appendChild(div);
    });
    document.getElementById('selectAllTeams').checked = true;
}

// --- Gestion Select All ---
document.getElementById('selectAllTeams').addEventListener('change', function () {
    const checked = this.checked;
    document.querySelectorAll('#teamCheckboxList input[type="checkbox"]').forEach(cb => {
        cb.checked = checked;
    });
    updateSelectedTeams();
});

// --- Gestion sélection individuelle ---
document.getElementById('teamCheckboxList').addEventListener('change', function (e) {
    if (e.target.type === 'checkbox') {
        if (!e.target.checked) {
            document.getElementById('selectAllTeams').checked = false;
        } else {
            const allChecked = Array.from(document.querySelectorAll('#teamCheckboxList input[type="checkbox"]')).every(cb => cb.checked);
            document.getElementById('selectAllTeams').checked = allChecked;
        }
        updateSelectedTeams();
    }
});

// --- Chargement des données JSON ---
function loadCompetitionData(jsonFile) {
    const prevSelected = selectedTeams.slice();
    fetch(jsonFile)
        .then(response => response.json())
        .then(data => {
            // Adaptation : si pas de clé "team", on génère des noms d'équipe génériques
            competitionData = data.map((d, i) => {
                if (typeof d.team === "string" && d.team.trim() !== "") {
                    return d;
                } else {
                    // Génère un nom d'équipe générique
                    return { ...d, team: "Team " + (i + 1) };
                }
            });
            // Si aucune donnée, message
            if (!competitionData.length) {
                document.getElementById("graph").innerHTML = "<div class='text-danger p-3'>Aucune donnée d'équipe disponible pour ce niveau.</div>";
                document.getElementById("table-body").innerHTML = "";
                document.querySelector("#probability-table thead tr").innerHTML = "<th>Team</th>";
                return;
            }
            const teams = Array.from(new Set(competitionData.map(d => d.team).filter(Boolean)));
            updateTeamSidebar(teams);
            // Réapplique la sélection si possible
            document.querySelectorAll('#teamCheckboxList input[type="checkbox"]').forEach(cb => {
                cb.checked = prevSelected.includes(cb.value);
            });
            // Si aucune équipe n'est sélectionnée, sélectionne tout
            if (!document.querySelector('#teamCheckboxList input[type="checkbox"]:checked')) {
                document.getElementById('selectAllTeams').checked = true;
                document.querySelectorAll('#teamCheckboxList input[type="checkbox"]').forEach(cb => cb.checked = true);
            }
            updateSelectedTeams();
        });
}

// --- Synchronisation sélection/graphique/tableau ---
function updateSelectedTeams() {
    selectedTeams = Array.from(document.querySelectorAll('#teamCheckboxList input[type="checkbox"]:checked')).map(cb => cb.value);
    // Filtrer les équipes sélectionnées ET qui ont au moins une valeur non nulle/non vide
    const filteredData = competitionData.filter(d =>
        selectedTeams.includes(d.team) &&
        Object.keys(d).some(k => k !== "team" && d[k] !== null && d[k] !== undefined)
    );
    updateGraphAndTable(filteredData);
}

// --- Affichage graphique ApexCharts + tableau natif ---
function updateGraphAndTable(filteredData) {
    // Nettoie l'ancien graphique
    if (window.apexChart) {
        window.apexChart.destroy();
    }

    // Récupère toutes les dates (en-têtes)
    const allDates = Array.from(
        new Set(filteredData.flatMap(d => Object.keys(d).filter(k => k !== "team")))
    ).sort();

    // Prépare les séries pour ApexCharts
    const series = filteredData.map(teamObj => ({
        name: teamObj.team,
        data: allDates.map(date => {
            const val = teamObj[date];
            return (val !== undefined && val !== null) ? Math.round(val * 100) : null;
        })
    }));

    // Palette de secours
    const defaultPalette = [
        "#008FFB", "#00E396", "#FEB019", "#FF4560", "#775DD0",
        "#3F51B5", "#546E7A", "#D4526E", "#8D5B4C", "#F86624",
        "#D7263D", "#1B998B", "#2E294E", "#F46036", "#E2C044"
    ];
    const colors = filteredData.map((t, i) =>
        teamColors[t.team] ? teamColors[t.team] : defaultPalette[i % defaultPalette.length]
    );

    // Affiche le graphique seulement si il y a des équipes et des dates
    if (series.length && allDates.length) {
        console.log("series", series, "allDates", allDates, "colors", colors);

        const options = {
            chart: {
                type: 'line',
                height: 350,
                toolbar: { show: false }
            },
            series: series,
            xaxis: {
                categories: allDates,
                title: { text: 'Date' }
            },
            yaxis: {
                min: 0,
                max: 100,
                labels: { formatter: val => val + '%' },
                title: { text: 'Probability (%)' }
            },
            colors: colors,
            tooltip: {
                y: { formatter: val => val !== null ? val + '%' : '-' }
            },
            legend: { show: true }
        };
        window.apexChart = new ApexCharts(document.querySelector("#graph"), options);
        window.apexChart.render();
    } else {
        document.querySelector("#graph").innerHTML = "<div class='text-muted p-3'>Aucune donnée à afficher.</div>";
    }

    // --- Tableau natif ---
    // En-tête
    const tableHeaderRow = document.querySelector("#probability-table thead tr");
    tableHeaderRow.innerHTML = '<th>Team</th>';
    allDates.forEach(date => {
        const th = document.createElement('th');
        th.textContent = date;
        tableHeaderRow.appendChild(th);
    });

    // Corps du tableau avec coloration
    const tableBody = document.getElementById("table-body");
    tableBody.innerHTML = "";
    filteredData.forEach(d => {
        const row = document.createElement('tr');
        const tdTeam = document.createElement('td');
        tdTeam.textContent = d.team;
        row.appendChild(tdTeam);
        allDates.forEach(date => {
            const td = document.createElement('td');
            if (d[date] !== undefined && d[date] !== null) {
                const val = Math.round(d[date] * 100);
                td.textContent = val + "%";
                // Coloration du fond (vert pour 100%, rouge pour 0%)
                const green = Math.round(255 * (val / 100));
                const red = Math.round(255 * (1 - val / 100));
                td.style.backgroundColor = `rgb(${red},${green},100)`;
                td.style.color = val > 60 ? "#fff" : "#222";
            } else {
                td.textContent = "";
            }
            row.appendChild(td);
        });
        tableBody.appendChild(row);
    });
}

// --- Mapping niveau -> fichier JSON ---
const levelToFile = {
    champion: 'euro2024_champion.json',
    final: 'euro2024_final.json',
    semiFinal: 'euro2024_semiFinal.json',
    quarterFinal: 'euro2024_quarterFinal.json',
    roundOf16: 'euro2024_roundOf16.json'
};

function getCurrentJsonFile() {
    const competition = document.getElementById('competitionSelect').value;
    const activeLevel = document.querySelector('#levelTabs .nav-link.active').getAttribute('data-level');
    let levelKey = activeLevel.replace(/-([a-z0-9])/g, (g, c) => c.toUpperCase());
    const file = levelToFile[levelKey];
    if (!file) {
        alert('Erreur : niveau inconnu (' + levelKey + ')');
        throw new Error('Niveau inconnu : ' + levelKey);
    }
    return `data/json/competitions/${file}`;
}

// --- Gestion du menu déroulant compétition ---
document.getElementById('competitionSelect').addEventListener('change', function() {
    loadCompetitionData(getCurrentJsonFile());
});

// --- Gestion des onglets niveau ---
document.querySelectorAll('#levelTabs .nav-link').forEach(tab => {
    tab.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('#levelTabs .nav-link').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('table-title').textContent = this.textContent + ' Probability';
        loadCompetitionData(getCurrentJsonFile());
    });
});

// --- Initialisation ---
loadCompetitionData(getCurrentJsonFile());
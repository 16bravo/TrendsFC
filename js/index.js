document.addEventListener('DOMContentLoaded', function () {
    const currentYear = new Date().getFullYear();
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');

    // État de navigation
    let selectedYear = currentYear;
    let selectedMonth = currentMonth;
    let isLatestMode = true;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Éléments DOM
    const dateDisplay = document.getElementById('dateDisplay');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const latestBtn = document.getElementById('latestBtn');

    // Default JSON file path
    let jsonFilePath = 'data/json/rankings/LatestRankings.json';

    // Function to load the JSON file
    async function loadJSON(filePath) {
        const response = await fetch(filePath);
        const jsonData = await response.json();
        return jsonData;
    }

    // Reference to table body
    const tableBody = document.getElementById('table-body');

    // Mettre à jour l'affichage et charger les données
    async function updateRankings() {
        if (isLatestMode) {
            jsonFilePath = 'data/json/rankings/LatestRankings.json';
            dateDisplay.textContent = 'Latest';
        } else {
            const monthName = monthNames[parseInt(selectedMonth) - 1];
            dateDisplay.textContent = monthName + ' ' + selectedYear;
            jsonFilePath = 'data/json/rankings/' + selectedYear + selectedMonth + 'Rankings.json';
        }

        // Vider et recharger la table
        $('#myTable').DataTable().clear().draw();

        try {
            const jsonData = await loadJSON(jsonFilePath);
            const latestDateSpan = document.getElementById('latestDate');
            latestDateSpan.textContent = jsonData.latest_date[0];

            const rankingArray = jsonData.rankings || [];
            rankingArray.forEach(item => {
                $('#myTable').DataTable().row.add([
                    item.ranking,
                    '<a data-toggle="tooltip" title="' + (item.ranking_change >= 0 ? '+' : '') + item.ranking_change + '">\n                    ' + (item.ranking_change !== 0 ? '<i class="' + (item.ranking_change > 0 ? 'text-success' : 'text-danger') + ' fa fa-chevron-' + (item.ranking_change > 0 ? 'up style="color=green"' : 'down style="color=red"') + '"></i>' : '<i class="fa fa-chevron-right" aria-hidden="true" style="color=gray"></i>') + '\n                    </a>',
                    '<img src="img/flags/' + item.flag + '" alt="' + item.team + '" class="flag-mini">',
                    '<a href="matches.html?team=' + item.reference_team.replace(/&/g, '%26') + '">' + item.team + '</a>',
                    item.points,
                    item.points_change,
                    item.confederation
                ]).draw(false);
            });

            // Générer les filtres par confédération
            const confedFiltersDiv = document.getElementById('confed-filters');
            const existingCheckboxes = confedFiltersDiv.querySelectorAll('.confed-checkbox');
            const existingConfeds = new Set([...existingCheckboxes].map(cb => cb.value));
            const confederations = [...new Set(rankingArray.map(item => item.confederation))];
            
            // Ne regénérer que si le set a changé
            if (confederations.length !== existingConfeds.size || confederations.some(c => !existingConfeds.has(c))) {
                confedFiltersDiv.innerHTML = '';
                confederations.forEach(confed => {
                    const label = document.createElement('label');
                    label.className = 'form-check-label mr-2';
                    label.innerHTML = '\n                        <input class="form-check-input confed-checkbox" type="checkbox" value="' + confed + '" checked>\n                        ' + confed + '\n                    ';
                    confedFiltersDiv.appendChild(label);
                });
            }
        } catch (error) {
            console.error('Erreur lors du chargement du classement:', error);
        }
    }

    // Naviguer d'un mois
    function navigateMonth(offset) {
        isLatestMode = false;
        let newMonth = parseInt(selectedMonth) + offset;
        let newYear = parseInt(selectedYear);

        if (newMonth > 12) {
            newMonth = 1;
            newYear += 1;
        } else if (newMonth < 1) {
            newMonth = 12;
            newYear -= 1;
        }

        selectedMonth = newMonth.toString().padStart(2, '0');
        selectedYear = newYear;
        updateRankings();
    }

    // Listeners des boutons
    prevBtn.addEventListener('click', () => navigateMonth(-1));
    nextBtn.addEventListener('click', () => navigateMonth(1));
    latestBtn.addEventListener('click', () => {
        isLatestMode = true;
        updateRankings();
    });

    // Filtre par confédération
    $(document).on('change', '.confed-checkbox', function () {
        const checked = $('.confed-checkbox:checked').map(function () { return this.value; }).get();
        $('#myTable').DataTable().column(6).search(checked.join('|'), true, false).draw();
    });

    // Activate DataTables
    $('#myTable').DataTable({
        paging: false
    });

    // Back to top button logic
    const backToTopBtn = document.getElementById('back-to-top');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 200) {
            backToTopBtn.style.display = 'block';
        } else {
            backToTopBtn.style.display = 'none';
        }
    });
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({top: 0, behavior: 'smooth'});
    });

    // Theme switch logic
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

    // Chargement initial
    updateRankings();
});

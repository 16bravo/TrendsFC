document.addEventListener('DOMContentLoaded', function () {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    const latestDateSpan = document.getElementById('latestDate');
    const currentYear = new Date().getFullYear();
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');

    // Year options
    const latestOption = document.createElement('option');
    latestOption.value = 'latest';
    latestOption.textContent = 'Latest';
    yearSelect.appendChild(latestOption);
    for (let year = currentYear; year >= 1872; year--) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        yearSelect.appendChild(option);
    }
    yearSelect.value = currentYear.toString();

    // Month options
    const months = [
        { value: '01', name: 'January' }, { value: '02', name: 'February' }, { value: '03', name: 'March' },
        { value: '04', name: 'April' }, { value: '05', name: 'May' }, { value: '06', name: 'June' },
        { value: '07', name: 'July' }, { value: '08', name: 'August' }, { value: '09', name: 'September' },
        { value: '10', name: 'October' }, { value: '11', name: 'November' }, { value: '12', name: 'December' }
    ];
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.name;
        monthSelect.appendChild(opt);
    });
    monthSelect.value = currentMonth;

    // ── Helpers ─────────────────────────────────────────────────────────────

    async function loadJSON(filePath) {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${filePath}`);
        return response.json();
    }

    function getFilePath() {
        const year = yearSelect.value;
        const month = monthSelect.value;
        if (year === 'latest') return 'data/json/rankings/LatestRankings.json';
        return `data/json/rankings/${year}${month}Rankings.json`;
    }

    // Chevron icon for a ranking change value (positive = moved up = green)
    function chevron(change) {
        if (change === 0) return '';
        const dir = change > 0 ? 'up' : 'down';
        const cls = change > 0 ? 'text-success' : 'text-danger';
        return `<i class="fa fa-chevron-${dir} ${cls}" aria-hidden="true"></i>`;
    }

    // Points cell: value + small coloured delta
    function ptsHtml(pts, change) {
        const sign = change > 0 ? '+' : '';
        const cls = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-muted';
        return `${pts} <small class="${cls}">${sign}${change}</small>`;
    }

    // Build a DataTables row array from one ranking item
    function buildRow(item) {
        const offRankOk = item.ranking_off != null;
        const defRankOk = item.ranking_def != null;
        return [
            item.ranking,
            `<img src="img/flags/${item.flag}" alt="${item.team}" class="flag-mini">`,
            `<a href="matches.html?team=${item.reference_team.replace(/&/g, '%26')}">${item.team}</a>`,
            offRankOk ? `${item.ranking_off} ${chevron(item.ranking_off_change || 0)}` : '-',
            offRankOk ? ptsHtml(item.points_off, item.points_off_change || 0) : '-',
            defRankOk ? `${item.ranking_def} ${chevron(item.ranking_def_change || 0)}` : '-',
            defRankOk ? ptsHtml(item.points_def, item.points_def_change || 0) : '-',
            item.confederation
        ];
    }

    // ── DataTables initialisation ────────────────────────────────────────────

    const dataTable = $('#offDefTable').DataTable({
        paging: false,
        scrollX: true,
        fixedColumns: { leftColumns: 1 },
        order: [[3, 'asc']],   // default: sort by Off. Rank
        columnDefs: [
            { type: 'html-num', targets: [3, 4, 5, 6] },   // numeric sort despite HTML content
            { orderable: false, targets: [1] },              // flag column: not sortable
            { className: 'd-none d-md-table-cell', targets: [4, 6] },
            { className: 'd-none d-lg-table-cell', targets: [7] }
        ]
    });

    // ── Data loading ─────────────────────────────────────────────────────────

    let confedFiltersBuilt = false;

    async function loadData(filePath) {
        try {
            const jsonData = await loadJSON(filePath);
            latestDateSpan.textContent = jsonData.latest_date[0];
            const rankingArray = jsonData.rankings || [];

            dataTable.clear();
            dataTable.rows.add(rankingArray.map(buildRow)).draw();

            if (!confedFiltersBuilt) {
                buildConfedFilters(rankingArray);
                confedFiltersBuilt = true;
            }
        } catch (e) {
            console.warn('Could not load ranking data:', e.message);
        }
    }

    // ── Confederation filters ─────────────────────────────────────────────────

    function buildConfedFilters(rankingArray) {
        const confedFiltersDiv = document.getElementById('confed-filters');
        const confederations = [...new Set(rankingArray.map(item => item.confederation))].sort();
        confederations.forEach(confed => {
            const label = document.createElement('label');
            label.className = 'form-check-label mr-2';
            label.innerHTML = `
                <input class="form-check-input confed-checkbox" type="checkbox" value="${confed}" checked>
                ${confed}
            `;
            confedFiltersDiv.appendChild(label);
        });

        $('#confed-filters').on('change', '.confed-checkbox', function () {
            const checked = $('.confed-checkbox:checked').map(function () { return this.value; }).get();
            // Column 7 = Confederation
            dataTable.column(7).search(checked.length ? checked.join('|') : '', true, false).draw();
        });
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    yearSelect.addEventListener('change', () => loadData(getFilePath()));
    monthSelect.addEventListener('change', () => loadData(getFilePath()));

    // Initial load
    loadData('data/json/rankings/LatestRankings.json');

    // ── Back to top ───────────────────────────────────────────────────────────

    const backToTopBtn = document.getElementById('back-to-top');
    window.addEventListener('scroll', function () {
        backToTopBtn.style.display = window.scrollY > 200 ? 'block' : 'none';
    });
    backToTopBtn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ── Dark theme ────────────────────────────────────────────────────────────

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

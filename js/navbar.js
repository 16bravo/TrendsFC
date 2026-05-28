(function () {
    'use strict';

    var NAV_ITEMS = [
        { href: 'index.html',                 label: 'Ranking',         page: 'index'            },
        { href: 'off_def_ranking.html',       label: 'Off/Def Ranking', page: 'off_def_ranking'  },
        { href: 'schedule.html?type=past',    label: 'Latest Matches',  page: 'schedule', search: 'past'    },
        { href: 'schedule.html?type=fixture', label: 'Fixtures',        page: 'schedule', search: 'fixture' },
        { href: 'match_up.html',              label: 'Match-Up',        page: 'match_up'          },
        { href: 'about.html',                 label: 'About',           page: 'about'             },
    ];

    var pathPage = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    var currentSearch = window.location.search;

    function isActive(item) {
        if (item.page !== pathPage) return false;
        return item.search ? currentSearch.indexOf(item.search) !== -1 : true;
    }

    var linksHtml = NAV_ITEMS.map(function (item) {
        return '<li class="nav-item' + (isActive(item) ? ' active' : '') + '">' +
               '<a class="nav-link" href="' + item.href + '">' + item.label + '</a></li>';
    }).join('\n        ');

    document.getElementById('navbar-placeholder').outerHTML =
        '  <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom mb-4 fixed-top">\n' +
        '    <a class="navbar-brand" href="index.html">TrendsFC</a>\n' +
        '    <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarNav"\n' +
        '      aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">\n' +
        '      <span class="navbar-toggler-icon"></span>\n' +
        '    </button>\n' +
        '    <div class="collapse navbar-collapse" id="navbarNav">\n' +
        '      <ul class="navbar-nav mr-auto">\n' +
        '        ' + linksHtml + '\n' +
        '      </ul>\n' +
        '      <button id="theme-toggle" class="btn btn-outline-secondary ml-2" title="Switch theme">\uD83C\uDF19</button>\n' +
        '    </div>\n' +
        '  </nav>';
}());

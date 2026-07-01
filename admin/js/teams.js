/**
 * TeamsLoader
 * Loads team data from countries_names.csv.
 * Exposed globally as TeamsLoader.
 */
const TeamsLoader = (() => {

  // Auto-load from the known relative path (works when served via HTTP)
  async function tryAutoLoad() {
    try {
      const [csvResp, flagResp] = await Promise.all([
        fetch('../data/source/match_dataset/countries_names.csv'),
        fetch('../data/json/flags_map.json'),
      ]);
      if (!csvResp.ok) throw new Error('fetch failed');
      const teams   = parseCSV(await csvResp.text());
      const flagMap = flagResp.ok ? await flagResp.json() : {};
      return _enrichFlags(teams, flagMap);
    } catch {
      return null; // caller falls back to file picker
    }
  }

  function loadFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(parseCSV(e.target.result));
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function _enrichFlags(teams, flagMap) {
    teams.forEach(t => { t.flag = flagMap[t.name] || null; });
    return teams;
  }

  function parseCSV(text) {
    const lines  = text.trim().split(/\r?\n/);
    const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    // Use original_name so historical names (e.g. "Soviet Union", "West Germany")
    // are available alongside current ones.
    const nameIdx  = header.findIndex(h => h === 'original_name');
    const colorIdx = header.findIndex(h => h === 'color_code');

    const seen = new Set();
    return lines.slice(1)
      .map(line => {
        const parts = _parseLine(line);
        const name  = parts[nameIdx]?.trim().replace(/^"|"$/g, '') || '';
        const color = parts[colorIdx]?.trim().replace(/^"|"$/g, '') || '#888';
        return name ? { name, color } : null;
      })
      .filter(Boolean)
      .filter(t => {                      // deduplicate by name
        if (seen.has(t.name)) return false;
        seen.add(t.name);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Minimal CSV line parser (handles double-quoted fields)
  function _parseLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"')              { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else                         { cur += ch; }
    }
    result.push(cur);
    return result;
  }

  return { tryAutoLoad, loadFromFile, parseCSV };

})();

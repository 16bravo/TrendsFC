import sqlite3
import json
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# Arguments
force_regenerate = '--force' in sys.argv
from_date = None
if '--from' in sys.argv:
    idx = sys.argv.index('--from')
    if idx + 1 < len(sys.argv):
        from_date = sys.argv[idx + 1]

database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)
connection.row_factory = sqlite3.Row
cursor = connection.cursor()

today = datetime.now()

print("Extraction de TOUTES les données en une seule fois...")

# UNE SEULE REQUÊTE GLOBALE (Utilise les fonctions analytiques de SQLite)
cursor.execute("""
    WITH ranked_data AS (
        SELECT 
            r.year, r.month, r.date, r.ranking, r.team, r.reference_team, 
            r.points, r.points_off, r.points_def, r.ranking_off, r.ranking_def,
            t.flag, t.confederation,
            -- LAG va chercher la valeur de l'équipe au mois précédent (trié par date)
            LAG(r.ranking) OVER (PARTITION BY r.reference_team ORDER BY r.date) as prev_ranking,
            LAG(r.points) OVER (PARTITION BY r.reference_team ORDER BY r.date) as prev_points,
            LAG(r.ranking_off) OVER (PARTITION BY r.reference_team ORDER BY r.date) as prev_ranking_off,
            LAG(r.points_off) OVER (PARTITION BY r.reference_team ORDER BY r.date) as prev_points_off,
            LAG(r.ranking_def) OVER (PARTITION BY r.reference_team ORDER BY r.date) as prev_ranking_def,
            LAG(r.points_def) OVER (PARTITION BY r.reference_team ORDER BY r.date) as prev_points_def
        FROM Rankings r
        LEFT JOIN Teams t ON (
            r.team = t.team
            AND (t.startDate IS NULL OR r.date >= t.startDate)
            AND (t.endDate IS NULL OR r.date <= t.endDate)
        )
        WHERE r.team NOT LIKE 'Not-Sovereign %'
    )
    SELECT 
        year, month, date, ranking, flag, team, reference_team, points, points_off, points_def, confederation, ranking_off, ranking_def,
        COALESCE(prev_ranking - ranking, 0) AS ranking_change,
        COALESCE(points - prev_points, 0) AS points_change,
        COALESCE(prev_ranking_off - ranking_off, 0) AS ranking_off_change,
        COALESCE(points_off - prev_points_off, 0) AS points_off_change,
        COALESCE(prev_ranking_def - ranking_def, 0) AS ranking_def_change,
        COALESCE(points_def - prev_points_def, 0) AS points_def_change
    FROM ranked_data
    ORDER BY year, month, ranking;
""")

all_rows = cursor.fetchall()
connection.close()

# Groupement des données par (year, month) en mémoire côté Python
data_by_month = defaultdict(list)
latest_date_by_month = {}

for row in all_rows:
    key = (row['year'], row['month'])
    latest_date_by_month[key] = row['date'] # Écrase au fur et à mesure pour garder la plus récente
    
    # On convertit la ligne en dict et on retire les clés inutiles pour le JSON des rankings
    d = dict(row)
    del d['year'], d['month'], d['date']
    data_by_month[key].append(d)

print("Écriture des fichiers JSON...")

# Boucle d'écriture purement Python (plus aucun appel SQL ici)
for (year, month), rankings in data_by_month.items():
    max_date = latest_date_by_month[(year, month)]
    month_str = str(month).zfill(2)
    month_path = Path(f"data/json/rankings/{year}{month_str}Rankings.json")

    # Logique de skip
    if not force_regenerate and not from_date and month_path.exists():
        max_date_dt = datetime.strptime(max_date[:10], '%Y-%m-%d')
        if (today.year - max_date_dt.year) * 12 + (today.month - max_date_dt.month) > 3:
            continue
    elif from_date and max_date < from_date:
        continue

    month_data = {
        'year': year,
        'month': month,
        'latest_date': [max_date],
        'rankings': rankings
    }

    with open(month_path, "w", encoding="utf-8") as month_file:
        json.dump(month_data, month_file, indent=2, ensure_ascii=False)

print("Tous les fichiers ont été synchronisés !")
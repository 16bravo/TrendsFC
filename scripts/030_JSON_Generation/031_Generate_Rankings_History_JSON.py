import sqlite3
import json
from pathlib import Path
from datetime import datetime

# SQLite database connection
database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)
cursor = connection.cursor()

# YEARLY RANKINGS
# HISTORICAL RANKINGS FROM 1872
# Precompute all (year, month, max_date) in a single query
cursor.execute("""
    SELECT strftime('%Y', date) as year, strftime('%m', date) as month, MAX(date) as max_date
    FROM Rankings
    WHERE date IS NOT NULL
    GROUP BY year, month
    ORDER BY year, month
""")
months_with_max = cursor.fetchall()

# Build a lookup dict for max_date per (year, month)
max_date_lookup = {(year, month): max_date for year, month, max_date in months_with_max}

today = datetime.now()

for year, month, max_date in months_with_max:
    month_path = Path(f"data/json/rankings/{year}{month}Rankings.json")

    # Skip already-generated files for stable historical months (> 3 months old)
    # To force regeneration of a specific month, delete the corresponding JSON file.
    if month_path.exists():
        max_date_dt = datetime.strptime(max_date[:10], '%Y-%m-%d')
        months_old = (today.year - max_date_dt.year) * 12 + (today.month - max_date_dt.month)
        if months_old > 3:
            continue
    # Previous month year/month calculation
    prev_year = year if int(month) > 1 else str(int(year) - 1)
    prev_month = str(int(month) - 1).zfill(2) if int(month) > 1 else "12"
    prev_max_date = max_date_lookup.get((prev_year, prev_month))

    # Retrieves ranking data for this date
    # Uses MIN(ranking_id) per team to always pick the first (global) ranking batch.
    # A second batch may exist when the pipeline is re-run after scraping new data
    # (e.g. AFCON on Dec 31): that second batch ranks only the teams that played,
    # producing a partial/tournament ranking (Algeria=1 among 8 teams, not globally).
    cursor.execute("""
        WITH prev_last AS (
            SELECT MIN(ranking_id) AS min_id
            FROM Rankings
            WHERE date = ?
            GROUP BY reference_team
        ),
        previous_month AS (
            SELECT r.ranking, r.ranking_off, r.ranking_def,
                   r.reference_team, r.points, r.points_off, r.points_def
            FROM Rankings r
            INNER JOIN prev_last ON r.ranking_id = prev_last.min_id
        ),
        curr_last AS (
            SELECT MIN(ranking_id) AS min_id
            FROM Rankings
            WHERE date = ?
            GROUP BY reference_team
        )
        SELECT r.ranking, t.flag, r.team, r.reference_team, r.points, r.points_off, r.points_def,
               t.confederation, r.ranking_off, r.ranking_def,
               (p.ranking - r.ranking) AS ranking_change,
               (r.points - p.points) AS points_change,
               (p.ranking_off - r.ranking_off) AS ranking_off_change,
               (r.points_off - p.points_off) AS points_off_change,
               (p.ranking_def - r.ranking_def) AS ranking_def_change,
               (r.points_def - p.points_def) AS points_def_change
        FROM Rankings r
        INNER JOIN curr_last ON r.ranking_id = curr_last.min_id
        LEFT JOIN Teams t ON (
            r.team = t.team
            AND (t.startDate IS NULL OR r.date >= t.startDate)
            AND (t.endDate IS NULL OR r.date <= t.endDate)
        )
        LEFT JOIN previous_month p ON (r.reference_team = p.reference_team)
        WHERE r.team NOT LIKE ('Not-Sovereign %')
        ORDER BY r.ranking
    """, (prev_max_date, max_date))

    month_data_sql = cursor.fetchall()

    # Generates JSON
    month_data = {
        'year': int(year),
        'month': int(month),
        'latest_date': [max_date],
        'rankings': [{
            'ranking': ranking,
            'flag': flag,
            'team': team,
            'reference_team': reference_team,
            'points': points,
            'points_off': points_off,
            'points_def': points_def,
            'confederation': confederation,
            'ranking_off': ranking_off,
            'ranking_def': ranking_def,
            'ranking_change': ranking_change if ranking_change is not None else 0,
            'points_change': points_change if points_change is not None else 0,
            'ranking_off_change': ranking_off_change if ranking_off_change is not None else 0,
            'points_off_change': points_off_change if points_off_change is not None else 0,
            'ranking_def_change': ranking_def_change if ranking_def_change is not None else 0,
            'points_def_change': points_def_change if points_def_change is not None else 0,
        } for ranking, flag, team, reference_team, points, points_off, points_def,
              confederation, ranking_off, ranking_def,
              ranking_change, points_change,
              ranking_off_change, points_off_change,
              ranking_def_change, points_def_change in month_data_sql]
    }

    # File name
    with open(month_path, "w", encoding="utf-8") as month_file:
        json.dump(month_data, month_file, indent=2)
        print(f"Data successfully extracted and exported to {month_path}.")

connection.close()
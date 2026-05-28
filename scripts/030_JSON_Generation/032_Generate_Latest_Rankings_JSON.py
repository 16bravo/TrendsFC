import sqlite3
import json

# SQLite database connection
database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)
cursor = connection.cursor()

# Latest match date for the JSON metadata
cursor.execute("SELECT max(date) FROM Matches")
latest_latest_date = [row[0] for row in cursor.fetchall()]

cursor.execute('''
    WITH max_date AS (
        SELECT MAX(date) AS max_date,
               CAST(strftime('%Y', MAX(date)) AS INTEGER) AS year
        FROM Rankings
    ),
    prev_last AS (
        -- MIN(ranking_id) = first (global) batch. A later batch may rank only tournament
        -- teams (e.g. AFCON on Dec 31), producing a partial ranking we must ignore.
        SELECT MIN(r.ranking_id) AS min_id
        FROM Rankings r
        INNER JOIN max_date m ON r.year = m.year - 1
        WHERE r.month = 12 AND r.day = 31
        GROUP BY r.reference_team
    ),
    previous_year AS (
        SELECT r.ranking, r.ranking_off, r.ranking_def,
               r.reference_team, r.points, r.points_off, r.points_def
        FROM Rankings r
        INNER JOIN prev_last ON r.ranking_id = prev_last.min_id
    ),
    curr_last AS (
        -- MIN(ranking_id) = first (global) batch on the latest date
        SELECT MIN(r.ranking_id) AS min_id
        FROM Rankings r
        INNER JOIN max_date m ON r.date = m.max_date
        GROUP BY r.reference_team
    )
    SELECT r.ranking, t.flag, r.team, r.reference_team,
           r.points, r.points_off, r.points_def,
           t.confederation, r.ranking_off, r.ranking_def,
           (p.ranking - r.ranking)         AS ranking_change,
           (r.points - p.points)           AS points_change,
           (p.ranking_off - r.ranking_off) AS ranking_off_change,
           (r.points_off - p.points_off)   AS points_off_change,
           (p.ranking_def - r.ranking_def) AS ranking_def_change,
           (r.points_def - p.points_def)   AS points_def_change
    FROM Rankings r
    INNER JOIN curr_last ON r.ranking_id = curr_last.min_id
    LEFT JOIN Teams t ON (
        r.team = t.team
        AND (t.startDate IS NULL OR r.date >= DATE(t.startDate))
        AND (t.endDate IS NULL OR r.date <= DATE(t.endDate))
        AND t.priority = (
            SELECT MIN(priority) FROM Teams
            WHERE team = r.team
              AND (startDate IS NULL OR r.date >= DATE(startDate))
              AND (endDate IS NULL OR r.date <= DATE(endDate))
        )
    )
    LEFT JOIN previous_year p ON (r.reference_team = p.reference_team)
    WHERE r.team NOT LIKE ('Not-Sovereign %')
    ORDER BY r.ranking
''')

latest_data_sql = cursor.fetchall()

years_data = {
    'year': 'latest',
    'latest_date': latest_latest_date,
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
        'ranking_change':     ranking_change     if ranking_change     is not None else 0,
        'points_change':      points_change      if points_change      is not None else 0,
        'ranking_off_change': ranking_off_change if ranking_off_change is not None else 0,
        'points_off_change':  points_off_change  if points_off_change  is not None else 0,
        'ranking_def_change': ranking_def_change if ranking_def_change is not None else 0,
        'points_def_change':  points_def_change  if points_def_change  is not None else 0,
    } for ranking, flag, team, reference_team, points, points_off, points_def,
          confederation, ranking_off, ranking_def,
          ranking_change, points_change,
          ranking_off_change, points_off_change,
          ranking_def_change, points_def_change in latest_data_sql]
}

# Export data to JSON file
years_path = "data/json/rankings/LatestRankings.json"
with open(years_path, "w", encoding="utf-8") as years_file:
    json.dump(years_data, years_file, indent=2)

print(f"Data successfully extracted and exported to {years_path}.")

connection.close()

import math
import sqlite3
import json
from pathlib import Path
from datetime import datetime, timedelta

database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)
cursor = connection.cursor()

# Calcule la date il y a un an
today = datetime.today()
one_year_ago = (today - timedelta(days=365)).strftime("%Y-%m-%d")

# Récupère les matches joués il y a moins d'un an + tous les fixtures
cursor.execute(f'''
    SELECT m.date, m.country, m.tournament, m.team1, m.team2, m.original_team1, m.original_team2,
           t1.flag as flag1, t2.flag as flag2, m.score1, m.score2, m.rating1, m.rating2, m.rating_ev,
           m.rank1, m.rank2, m.expected_result, m.neutral, "past" as type
    FROM matches m
    LEFT JOIN Teams t1 ON (
        m.original_team1 = t1.team
        AND (t1.startDate IS NULL OR m.date >= DATE(t1.startDate))
        AND (t1.endDate IS NULL OR m.date <= DATE(t1.endDate))
        AND t1.priority = (
            SELECT MIN(priority) FROM Teams
            WHERE team = m.original_team1
              AND (startDate IS NULL OR m.date >= DATE(startDate))
              AND (endDate IS NULL OR m.date <= DATE(endDate))
        )
    )
    LEFT JOIN Teams t2 ON (
        m.original_team2 = t2.team
        AND (t2.startDate IS NULL OR m.date >= DATE(t2.startDate))
        AND (t2.endDate IS NULL OR m.date <= DATE(t2.endDate))
        AND t2.priority = (
            SELECT MIN(priority) FROM Teams
            WHERE team = m.original_team2
              AND (startDate IS NULL OR m.date >= DATE(startDate))
              AND (endDate IS NULL OR m.date <= DATE(endDate))
        )
    )
    WHERE m.date >= ?
    UNION
    SELECT f.date, f.country, f.tournament, f.team1, f.team2, f.original_team1, f.original_team2,
           t1.flag as flag1, t2.flag as flag2, "" as score1, "" as score2, f.rating1, f.rating2, 0 as rating_ev,
           f.rank1, f.rank2, f.expected_result, f.neutral, "fixture" as type
    FROM fixtures f
    LEFT JOIN Teams t1 ON (
        f.original_team1 = t1.team
        AND (t1.startDate IS NULL OR f.date >= DATE(t1.startDate))
        AND (t1.endDate IS NULL OR f.date <= DATE(t1.endDate))
        AND t1.priority = (
            SELECT MIN(priority) FROM Teams
            WHERE team = f.original_team1
              AND (startDate IS NULL OR f.date >= DATE(startDate))
              AND (endDate IS NULL OR f.date <= DATE(endDate))
        )
    )
    LEFT JOIN Teams t2 ON (
        f.original_team2 = t2.team
        AND (t2.startDate IS NULL OR f.date >= DATE(t2.startDate))
        AND (t2.endDate IS NULL OR f.date <= DATE(t2.endDate))
        AND t2.priority = (
            SELECT MIN(priority) FROM Teams
            WHERE team = f.original_team2
              AND (startDate IS NULL OR f.date >= DATE(startDate))
              AND (endDate IS NULL OR f.date <= DATE(endDate))
        )
    )
    ORDER BY date DESC
''', (one_year_ago,))

matches_data_sql = cursor.fetchall()

matches_list = [{
    'date': date,
    'country': country,
    'tournament': tournament,
    'team1': team1,
    'team2': team2,
    'original_team1': original_team1,
    'original_team2': original_team2,
    'flag1': flag1,
    'flag2': flag2,
    'score1': score1,
    'score2': score2,
    'rating1': rating1,
    'rating2': rating2,
    'rating_ev': rating_ev,
    'rank1': int(rank1) if rank1 is not None else '-',
    'rank2': int(rank2) if rank2 is not None else '-',
    'win_prob': round((1/(1+math.exp(-(expected_result+(0.341 if not neutral else 0))*2.95))*100),1) if expected_result is not None else None,
    'type': type
} for date, country, tournament, team1, team2, original_team1, original_team2, flag1, flag2, score1, score2, rating1, rating2, rating_ev, rank1, rank2, expected_result, neutral, type in matches_data_sql]

# Sauvegarde dans un seul fichier JSON
output_path = Path("data/json/all_matches.json")
with open(output_path, 'w', encoding="utf-8") as f:
    json.dump({'matches': matches_list}, f, indent=2)
    print(f"All matches exported to {output_path}")

connection.close()
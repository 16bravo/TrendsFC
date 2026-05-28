import math
import sqlite3
import json
import pandas as pd
from pathlib import Path

# SQLite database connection
database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)
cursor = connection.cursor()

# MATCHES RESULT BY TEAMS
cursor.execute('SELECT DISTINCT team1 FROM matches UNION SELECT DISTINCT team2 FROM matches')
teams = [row[0] for row in cursor.fetchall()]

for team in teams:
    cursor.execute('''
        SELECT m.date, m.country, m.tournament, m.team1, m.team2, m.original_team1, m.original_team2,
               t1.flag as flag1, t2.flag as flag2, m.score1, m.score2, m.rating1, m.rating2, m.rating_ev,
               m.rank1, m.rank2, m.expected_result, m.neutral, "past" as type
        FROM matches m
        LEFT JOIN (
            SELECT tt.*
            FROM Teams tt
        ) t1 ON (
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
        LEFT JOIN (
            SELECT tt.*
            FROM Teams tt
        ) t2 ON (
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
        WHERE team1 = ? OR team2 = ?
        UNION
        SELECT f.date, f.country, f.tournament, f.team1, f.team2, f.original_team1, f.original_team2,
               t1.flag as flag1, t2.flag as flag2, "" as score1, "" as score2, f.rating1, f.rating2, 0 as rating_ev,
               f.rank1, f.rank2, f.expected_result, f.neutral, "fixture" as type
        FROM fixtures f
        LEFT JOIN (
            SELECT tt.*
            FROM Teams tt
        ) t1 ON (
            f.original_team1 = t1.team
            AND (t1.startDate IS NULL OR f.date >= t1.startDate)
            AND (t1.endDate IS NULL OR f.date <= t1.endDate)
            AND t1.priority = (
                SELECT MIN(priority) FROM Teams
                WHERE team = f.original_team1
                  AND (startDate IS NULL OR f.date >= startDate)
                  AND (endDate IS NULL OR f.date <= endDate)
            )
        )
        LEFT JOIN (
            SELECT tt.*
            FROM Teams tt
        ) t2 ON (
            f.original_team2 = t2.team
            AND (t2.startDate IS NULL OR f.date >= t2.startDate)
            AND (t2.endDate IS NULL OR f.date <= t2.endDate)
            AND t2.priority = (
                SELECT MIN(priority) FROM Teams
                WHERE team = f.original_team2
                  AND (startDate IS NULL OR f.date >= startDate)
                  AND (endDate IS NULL OR f.date <= endDate)
            )
        )
        WHERE team1 = ? OR team2 = ?
        ORDER BY date DESC
    ''', (team, team, team, team))
    matches_data_sql = cursor.fetchall()

    # Build matches list as before
    matches_list = [{
        'date': date,
        'country': country,
        'tournament': tournament,
        'team1': team1 if team == team1 else team2,
        'team2': team2 if team == team1 else team1,
        'original_team1': original_team1 if team == team1 else original_team2,
        'original_team2': original_team2 if team == team1 else original_team1,
        'flag1': flag1 if team == team1 else flag2,
        'flag2': flag2 if team == team1 else flag1,
        'score1': score1 if team == team1 else score2,
        'score2': score2 if team == team1 else score1,
        'rating1': rating1 if team == team1 else rating2,
        'rating2': rating2 if team == team1 else rating1,
        'rating_ev': (1 if team == team1 else -1) * rating_ev,
        'rank': int(rank1 if team == team1 else rank2) if not pd.isna(rank1 if team == team1 else rank2) else '-',
        'win_prob': round((1/(1+math.exp(-((1 if team == team1 else -1)*(expected_result+(0.341 if not neutral else 0)))*2.95)))*100,1),
        'type': type
    } for date, country, tournament, team1, team2, original_team1, original_team2, flag1, flag2, score1, score2, rating1, rating2, rating_ev, rank1, rank2, expected_result, neutral, type in matches_data_sql]

    # --- STATS CALCULATION ---
    past_matches = [m for m in matches_list if m['type'] == 'past' and m['score1'] != '' and m['score2'] != '']
    total_matches = len(past_matches)
    wins = draws = losses = goals_for = goals_against = points = 0
    ranks = []
    first_match_date = last_match_date = None
    biggest_win = {'score': '', 'opponent': '', 'date': '', 'flag': ''}
    biggest_loss = {'score': '', 'opponent': '', 'date': '', 'flag': ''}
    max_goal_diff = -999
    min_goal_diff = 999

    for m in past_matches:
        s1, s2 = int(m['score1']), int(m['score2'])
        goals_for += s1
        goals_against += s2
        # Penalty shootout: treat as draw if score1 == score2
        if s1 > s2:
            wins += 1
            points += 3
        elif s1 == s2:
            draws += 1
            points += 1
        else:
            losses += 1
        # Rank
        if isinstance(m['rank'], int):
            ranks.append(m['rank'])
        # Biggest win/loss
        goal_diff = s1 - s2
        if goal_diff > max_goal_diff or (goal_diff == max_goal_diff and s1 > 0):
            max_goal_diff = goal_diff
            biggest_win = {
                'score': f"{s1}-{s2}",
                'opponent': m['original_team2'],
                'date': m['date'],
                'flag': m['flag2']
            }
        if goal_diff < min_goal_diff or (goal_diff == min_goal_diff and s2 > 0):
            min_goal_diff = goal_diff
            biggest_loss = {
                'score': f"{s1}-{s2}",
                'opponent': m['original_team2'],
                'date': m['date'],
                'flag': m['flag2']
            }
        # Dates
        if not first_match_date or m['date'] < first_match_date:
            first_match_date = m['date']
        if not last_match_date or m['date'] > last_match_date:
            last_match_date = m['date']

    avg_points = round(points / total_matches, 2) if total_matches else 0
    avg_rank = round(sum(ranks) / len(ranks), 2) if ranks else '-'
    best_rank = min(ranks) if ranks else '-'
    worst_rank = max(ranks) if ranks else '-'
    win_percentage = round(100 * wins / total_matches, 1) if total_matches else 0

    # Home/Away/Neutral
    home_matches = sum(1 for m in past_matches if m['country'] == team)
    away_matches = sum(1 for m in past_matches if m['country'] == m['original_team2'])
    neutral_matches = total_matches - home_matches - away_matches

    # Build stats block
    stats = {
        "matches_played": total_matches,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "goals_for": goals_for,
        "goals_against": goals_against,
        "goal_difference": goals_for - goals_against,
        "win_percentage": win_percentage,
        "avg_points": avg_points,
        "best_rank": best_rank,
        "worst_rank": worst_rank,
        "avg_rank": avg_rank,
        "biggest_win": biggest_win,
        "biggest_loss": biggest_loss,
        "home_matches": home_matches,
        "away_matches": away_matches,
        "neutral_matches": neutral_matches,
        "first_match_date": first_match_date,
        "last_match_date": last_match_date
    }

    matches_data = {
        'team': team,
        'stats': stats,
        'matches': matches_list
    }

    matches_path = Path(f"data/json/matches/{team}.json")
    with open(matches_path, 'w', encoding="utf-8") as matches_file:
        json.dump(matches_data, matches_file, indent=2)
        print(f"Data successfully extracted and exported to {matches_path}.")

connection.close()

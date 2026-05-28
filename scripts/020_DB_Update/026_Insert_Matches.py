import pandas as pd
import sqlite3

database_path = 'data/TrendsFC.db' 

# Retrieve Data from previous steps in csv files
matches = pd.read_csv('data/temp/matches.csv')
# Convert the date in datetime format
date_format = "%Y-%m-%d"
matches['date'] = pd.to_datetime(matches['date'], format = date_format)

## DATABASE INSERTION
conn = sqlite3.connect(database_path)
cursor = conn.cursor()

# Insert matches data into SQLite table
matches['date'] = matches['date'].dt.strftime('%Y-%m-%d')
for index, row in matches.iterrows():
    cursor.execute('''
        INSERT INTO matches (date, country, tournament, team1, team2, original_team1, original_team2, score1, score2, rating1, rating2, rating_ev, rank1, rank2, off_rating1, off_rating2, def_rating1, def_rating2, off_rank1, off_rank2, def_rank1, def_rank2, expected_result, expected_score1, expected_score2, neutral)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (row['date'], row['country'], row['tournament'], row['home_team'], row['away_team'], row['history_home_team'], row['history_away_team'], row['home_score'], row['away_score'],
          row['home_points_after'], row['away_points_after'],
          row['home_points_after'] - row['home_points_before'],
          row['home_rank'], row['away_rank'],
          row['home_points_off_after'], row['away_points_off_after'],
          row['home_points_def_after'], row['away_points_def_after'],
          row['home_rank_off'], row['away_rank_off'],
          row['home_rank_def'], row['away_rank_def'],
          row['expected_result'],
          row['expected_score_1'],
          row['expected_score_2'],
          row['neutral']
          ))

# Delete duplicates    
cursor.execute('''
    DELETE FROM Matches
    WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM Matches
        GROUP BY date, country, tournament, team1, team2, score1, score2
    );
''')

conn.commit()
conn.close()

print('Matches data updated in database '+database_path)
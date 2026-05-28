import pandas as pd
import sqlite3

database_path = 'data/TrendsFC.db' 

# Retrieve Data from previous steps in csv files
fixtures = pd.read_csv('data/temp/fixtures.csv')
# Convert the date in datetime format
date_format = "%Y-%m-%d"
fixtures['date'] = pd.to_datetime(fixtures['date'], format = date_format)

## DATABASE INSERTION
conn = sqlite3.connect(database_path)
cursor = conn.cursor()

# Delete existing data to update everything    
cursor.execute('''
    DELETE FROM Fixtures;
''')

# Insert matches data into SQLite table
fixtures['date'] = fixtures['date'].dt.strftime('%Y-%m-%d')
for index, row in fixtures.iterrows():
    cursor.execute('''
        INSERT INTO Fixtures (date, country, tournament, team1, team2, original_team1, original_team2, rating1, rating2, rank1, rank2, expected_result, neutral, off_rating1, off_rating2, def_rating1, def_rating2, off_rank1, off_rank2, def_rank1, def_rank2, expected_score_1, expected_score_2)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (row['date'], row['country'], row['tournament'], row['home_team'], row['away_team'], row['home_team'], row['away_team'],
          row['home_points_before'], row['away_points_before'],
          row['home_rank'], row['away_rank'],
          row['expected_result'], row['neutral'],
          row['home_points_off_before'], row['away_points_off_before'],
          row['home_points_def_before'], row['away_points_def_before'],
          row['home_rank_off'], row['away_rank_off'],
          row['home_rank_def'], row['away_rank_def'],
          row['expected_score_1'], row['expected_score_2']
          ))

conn.commit()
conn.close()

print('Fixtures data updated in database '+database_path)
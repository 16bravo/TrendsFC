import pandas as pd
import sqlite3

database_path = 'data/TrendsFC.db'

# Retrieve Data from previous steps in csv files
ranking_df = pd.read_csv('data/temp/ranking.csv')
# Convert the date in datetime format
date_format = "%Y-%m-%d %H:%M:%S"
ranking_df['date'] = pd.to_datetime(ranking_df['date'], format = date_format)

## DATABASE INSERTION
conn = sqlite3.connect(database_path)
cursor = conn.cursor()

# Supprime les lignes existantes pour ces dates avant insertion (idempotence)
dates = ranking_df['date'].dt.strftime('%Y-%m-%d %H:%M:%S').unique().tolist()
placeholders = ','.join(['?' for _ in dates])
cursor.execute(f"DELETE FROM Rankings WHERE date IN ({placeholders})", dates)
conn.commit()

# Insert rankings into SQLite table
ranking_df.to_sql('Rankings', conn, index=False, if_exists='append')

conn.commit()
conn.close()

print('Ranking data updated in database '+database_path)
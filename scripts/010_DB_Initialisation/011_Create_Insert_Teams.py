import sqlite3
import pandas as pd

# Database connection
database_path = 'data/TrendsFC.db'
conn = sqlite3.connect(database_path)
cursor = conn.cursor()

# Table creation
cursor.execute('''
    CREATE TABLE IF NOT EXISTS Teams (
        team_id INTEGER PRIMARY KEY AUTOINCREMENT,
        team VARCHAR(50) NOT NULL,
        reference_team VARCHAR(50),
        tricode VARCHAR(3),
        flag VARCHAR(25),
        color_hex_code VARCHAR(7),
        confederation VARCHAR(10),
        startDate DATE,
        endDate DATE,
        member BOOLEAN NOT NULL,
        base INTEGER,
        base_off INTEGER,
        base_def INTEGER,
        priority INTEGER
    )
''')

print('Teams Table Created')

# Load Teams data from Excel to Table
excel_file_path = 'data/teams_db.xlsx'
df_teams = pd.read_excel(excel_file_path)
df_teams.to_sql('Teams', conn, index=False, if_exists='replace')

print('Teams Table Data Inserted')

conn.commit()
conn.close()
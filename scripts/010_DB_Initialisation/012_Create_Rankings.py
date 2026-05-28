import sqlite3

# Database connection
database_path = 'data/TrendsFC.db'
conn = sqlite3.connect(database_path)
cursor = conn.cursor()

# Table creation
cursor.execute('''
    CREATE TABLE IF NOT EXISTS Rankings (
        ranking_id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        day INTEGER NOR NULL,
        team VARCHAR(50) NOT NULL,
        reference_team VARCHAR(50) NULL,
        points INTEGER NOT NULL,
        points_off INTEGER NOT NULL,
        points_def INTEGER NOT NULL,
        ranking INTEGER NOT NULL,
        ranking_off INTEGER NOT NULL,
        ranking_def INTEGER NOT NULL
    );
''')

conn.commit()
conn.close()

print('Rankings Table Created')
import sqlite3

# Database connection
database_path = 'data/TrendsFC.db'
conn = sqlite3.connect(database_path)
cursor = conn.cursor()

# Table creation
cursor.execute('''
    CREATE TABLE IF NOT EXISTS Matches (
        match_id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        country VARCHAR(50),
        tournament VARCHAR(60),
        team1 VARCHAR(50) NOT NULL,
        team2 VARCHAR(50) NOT NULL,
        original_team1 VARCHAR(50) NOT NULL,
        original_team2 VARCHAR(50) NOT NULL,
        score1 INTEGER,
        score2 INTEGER,
        rating1 INTEGER,
        rating2 INTEGER,
        rating_ev INTEGER,
        rank1 INTEGER,
        rank2 INTEGER,
        off_rating1 INTEGER,
        off_rating2 INTEGER,
        def_rating1 INTEGER,
        def_rating2 INTEGER,
        off_rank1 INTEGER,
        off_rank2 INTEGER,
        def_rank1 INTEGER,
        def_rank2 INTEGER,
        expected_result FLOAT,
        expected_score1 FLOAT,
        expected_score2 FLOAT,
        neutral BOOLEAN NOT NULL
    );
''')

conn.commit()
conn.close()

print('Matches Table Created')
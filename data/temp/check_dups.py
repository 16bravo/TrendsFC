import sqlite3
conn = sqlite3.connect('data/TrendsFC.db')
cur = conn.cursor()

cur.execute("SELECT MAX(date) FROM Rankings WHERE date LIKE '2025-12%'")
dec_max = cur.fetchone()[0]
print('dec_max:', dec_max)

cur.execute("SELECT ranking_id, ranking, points FROM Rankings WHERE date=? AND reference_team='Algeria'", (dec_max,))
print('Algeria dec:', cur.fetchall())

cur.execute("SELECT MAX(date) FROM Rankings WHERE date LIKE '2026-01%'")
jan_max = cur.fetchone()[0]
print('jan_max:', jan_max)

cur.execute("SELECT ranking_id, ranking, points FROM Rankings WHERE date=? AND reference_team='Algeria'", (jan_max,))
print('Algeria jan:', cur.fetchall())

cur.execute("SELECT reference_team, COUNT(*) as cnt FROM Rankings WHERE date=? GROUP BY reference_team HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20", (dec_max,))
dups = cur.fetchall()
print(f'Equipes avec doublons sur dec_max ({dec_max}): {len(dups)}')
for d in dups:
    print(' ', d)

cur.execute("SELECT reference_team, COUNT(*) as cnt FROM Rankings WHERE date=? GROUP BY reference_team HAVING cnt > 1 ORDER BY cnt DESC LIMIT 20", (jan_max,))
dups2 = cur.fetchall()
print(f'Equipes avec doublons sur jan_max ({jan_max}): {len(dups2)}')
for d in dups2:
    print(' ', d)

conn.close()

import pandas as pd
from tqdm import tqdm
from datetime import datetime
import sys
import sqlite3

# Parse command-line arguments
# Usage: python script.py [--from-db YYYY-MM-DD]
use_db_source = '--from-db' in sys.argv
from_date = None
if use_db_source:
    idx = sys.argv.index('--from-db')
    if idx + 1 < len(sys.argv):
        from_date = sys.argv[idx + 1]
        print(f"Mode: Charger depuis BD à partir de {from_date}")
    else:
        print("Erreur: --from-db requiert une date YYYY-MM-DD")
        sys.exit(1)
else:
    print("Mode: Charger depuis CSV (comportement standard)")

# Chargement des données
if use_db_source:
    # Load from database
    database_path = 'data/TrendsFC.db'
    conn = sqlite3.connect(database_path)
    
    # Get matches data from database
    query_matches = """
        SELECT date, home_team, away_team, 
               home_points_after, away_points_after,
               home_points_off_after, away_points_off_after,
               home_points_def_after, away_points_def_after
        FROM Matches
        WHERE date >= ?
        ORDER BY date
    """
    matches = pd.read_sql(query_matches, conn, params=(from_date,))
    
    # Get teams data
    teams = pd.read_sql("SELECT * FROM Teams", conn)
    
    conn.close()
    
    # Rename columns to match expected format
    matches = matches.rename(columns={
        'home_team': 'home_team_name',
        'away_team': 'away_team_name',
        'home_points_after': 'home_points_after',
        'away_points_after': 'away_points_after',
        'home_points_off_after': 'home_points_off_after',
        'away_points_off_after': 'away_points_off_after',
        'home_points_def_after': 'home_points_def_after',
        'away_points_def_after': 'away_points_def_after'
    })
else:
    # Load from CSV (original behavior)
    matches = pd.read_csv('data/temp/matches.csv')
    teams = pd.read_csv('data/temp/teams.csv')
    with open('data/temp/last_date.txt', 'r') as file:
        date_str = file.read().strip()
    last_date = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")

matches['date'] = pd.to_datetime(matches['date'])
teams['startDate'] = pd.to_datetime(teams['startDate'])
teams['endDate'] = pd.to_datetime(teams['endDate'])

today_date = pd.Timestamp(datetime.now())
start_date = matches['date'].min()
end_date = matches['date'].max()

if not use_db_source:
    start_date = last_date if pd.isna(start_date) else start_date
    last_eoy = pd.Timestamp(year=today_date.year - 1, month=12, day=31)
    end_date = max(last_eoy, end_date)
else:
    # When loading from DB, use full date range
    if pd.isna(start_date):
        start_date = pd.Timestamp(from_date)
    if pd.isna(end_date):
        end_date = today_date

# Génère toutes les fins de mois
EOM_dates = pd.date_range(start=start_date, end=end_date, freq='M')
today_norm = today_date.normalize()
if len(EOM_dates) == 0 or today_norm > EOM_dates.max() or today_norm not in EOM_dates:
    EOM_dates = EOM_dates.append(pd.DatetimeIndex([today_norm]))
EOM_dates = EOM_dates.sort_values()

# Prépare la table (date, team) pour toutes les équipes vivantes à chaque date
all_teams = teams[['team', 'reference_team', 'startDate', 'endDate']].drop_duplicates()
date_team = (
    pd.DataFrame({'date': EOM_dates})
    .assign(key=1)
    .merge(all_teams.assign(key=1), on='key')
    .drop('key', axis=1)
)
date_team = date_team[
    ((date_team['startDate'].isna()) | (date_team['date'] >= date_team['startDate'])) &
    ((date_team['endDate'].isna()) | (date_team['date'] <= date_team['endDate']))
].copy()

# Prépare un DataFrame "long" des matches (une ligne par équipe impliquée)
home = matches.rename(columns={
    'home_team': 'reference_team',
    'home_points_after': 'points',
    'home_points_off_after': 'points_off',
    'home_points_def_after': 'points_def'
})[['date', 'reference_team', 'points', 'points_off', 'points_def']]
away = matches.rename(columns={
    'away_team': 'reference_team',
    'away_points_after': 'points',
    'away_points_off_after': 'points_off',
    'away_points_def_after': 'points_def'
})[['date', 'reference_team', 'points', 'points_off', 'points_def']]
matches_long = pd.concat([home, away], ignore_index=True)
matches_long = matches_long.sort_values(['reference_team', 'date'])

# Pour chaque équipe, merge_asof pour trouver le dernier match avant chaque date
results = []
for ref_team, group in tqdm(date_team.groupby('reference_team'), desc="Calculating Points History (optimized)"):
    team_dates = group[['date', 'team']].sort_values('date')
    team_matches = matches_long[matches_long['reference_team'] == ref_team][['date', 'points', 'points_off', 'points_def']].sort_values('date')
    merged = pd.merge_asof(team_dates, team_matches, on='date', direction='backward')
    merged['reference_team'] = ref_team
    results.append(merged)

points_history_long = pd.concat(results, ignore_index=True)

# Pour toutes les dates sans match (pas seulement today), on prend les points
# du dernier état connu de teams.csv (= dernier ranking en DB avant le run).
# Cela garantit que les équipes inactives restent dans le classement historique.
nan_mask = points_history_long['points'].isna()
if nan_mask.any():
    teams_latest = teams.groupby('reference_team')[['points', 'points_off', 'points_def']].last()
    points_history_long.loc[nan_mask, 'points'] = (
        points_history_long.loc[nan_mask, 'reference_team'].map(teams_latest['points'])
    )
    points_history_long.loc[nan_mask, 'points_off'] = (
        points_history_long.loc[nan_mask, 'reference_team'].map(teams_latest['points_off'])
    )
    points_history_long.loc[nan_mask, 'points_def'] = (
        points_history_long.loc[nan_mask, 'reference_team'].map(teams_latest['points_def'])
    )

# Réorganise les colonnes
points_history_long = points_history_long[['date', 'team', 'points', 'points_off', 'points_def']]

print('Points History (long, one row per team/date) calculated (optimized)')

points_history_long.to_csv('data/temp/points_history.csv', index=False)
print('Points History data saved in temp file')
import kaggle.cli
import sys
import pandas as pd
from zipfile import ZipFile
from datetime import datetime
import sqlite3

## EXTRACT DATA FROM KAGGLE AND EXCEL

database_path = '././data/TrendsFC.db'  

# Download Matches dataset from Kaggle
# https://www.kaggle.com/datasets/patateriedata/all-international-football-results
dataset = "patateriedata/all-international-football-results"
sys.argv = [sys.argv[0]] + f"datasets download {dataset}".split(" ")
kaggle.cli.main()
zfile = ZipFile(f"{dataset.split('/')[1]}.zip")
matches = {f.filename:pd.read_csv(zfile.open(f)) for f in zfile.infolist() }["all_matches.csv"]
matches['match_id'] = range(1, len(matches) + 1)

# Load Teams data from Excel files
teams_excel = pd.read_excel('././data/teams_db.xlsx')
# Excluding non-valid teams (with no tricode)
teams_excel = teams_excel[(teams_excel['tricode'].notna())]

# replacing old countries' names by the current ones but saving them
matches['history_home_team'] = matches['home_team']
matches['history_away_team'] = matches['away_team']
matches['home_team'] = matches['home_team'].replace(teams_excel.set_index('team')['reference_team'])
matches['away_team'] = matches['away_team'].replace(teams_excel.set_index('team')['reference_team'])

# patches for some countries names
matches['country'] = matches['country'].str.replace(r'Dem Rep of the Congo', 'DR Congo')

# Merge DataFrames on history_home_team and history_away_team columns
teams_matches = pd.merge(matches, teams_excel[['reference_team', 'team', 'tricode']], how='inner', left_on='history_home_team', right_on='team')
teams_matches = pd.merge(teams_matches, teams_excel[['reference_team', 'team', 'tricode']], how='inner', left_on='history_away_team', right_on='team')

# Filter lines where both teams are valid (non-empty tricode)
valid_matches = teams_matches[(teams_matches['tricode_x'].notna()) & (teams_matches['tricode_y'].notna())]
matches_filtered = valid_matches[['match_id']]
matches = pd.merge(matches, matches_filtered, how='inner', on='match_id')
matches = matches.sort_values(by='match_id', ascending=True)
# Deduplication of columns identifying a match
matches = matches.drop_duplicates(subset=[
    'date', 'home_team', 'away_team', 'home_score', 'away_score', 'tournament', 'country'
])

## LOAD DATA IF EXISTS
matches['home_points_before'] = None
matches['away_points_before'] = None
matches['expected_result'] = None
matches['calculated_result'] = None
matches['home_points_after'] = None
matches['away_points_after'] = None
matches['home_rank'] = None
matches['away_rank'] = None

# Load last team level from database. If database does not exist then load from the Excel File
# Check if the Rankings table is empty
conn = sqlite3.connect(database_path)
cursor = conn.cursor()
cursor.execute("SELECT COUNT(*) FROM Rankings")
result = cursor.fetchone()

# Create the DataFrame
teams_last_level = pd.DataFrame(columns=['reference_team'])

# If Database is empty
# Then we take data from 1872 and init values from the Excel file :
if result[0] == 0:
    last_date = datetime(1872, 1, 1)
    
    # Get the list of reference_teams names
    teams_last_level['reference_team'] = teams_excel['reference_team'].unique()

    # Get the init points (base) for each team
    teams_last_level = teams_last_level.merge(teams_excel[['reference_team','base']].drop_duplicates(subset = ['reference_team','base']), on='reference_team')
    teams_last_level = teams_last_level.rename(columns={'base': 'points'})

    # Convert the match date to datetime
    matches['date'] = pd.to_datetime(matches['date'])

    print('All the matches from 1872 are taken into account')

# Else we take data since the last match : 
else:
    # Retrieve the last line and filter the dataset from here
    query_last_match_info = '''
        SELECT date, team1 AS home_team, team2 AS away_team, score1 AS home_score, score2 AS away_score, tournament, country
        FROM Matches
        ORDER BY match_id DESC
        LIMIT 1;
    '''

    last_match_info_in_db = pd.read_sql_query(query_last_match_info, conn)
    
    print(last_match_info_in_db)

    last_match_id = matches[
        (matches['date'] == last_match_info_in_db['date'].iloc[0]) &
        (matches['home_team'] == last_match_info_in_db['home_team'].iloc[0]) &
        (matches['away_team'] == last_match_info_in_db['away_team'].iloc[0]) &
        (matches['home_score'] == last_match_info_in_db['home_score'].iloc[0]) &
        (matches['away_score'] == last_match_info_in_db['away_score'].iloc[0]) &
        (matches['tournament'] == last_match_info_in_db['tournament'].iloc[0]) &
        (matches['country'] == last_match_info_in_db['country'].iloc[0])
    ]['match_id'].iloc[0]

    # We only take matches after the last id already in dbase
    matches = matches[matches['match_id'] > last_match_id]

    # Convert the match date to datetime
    matches['date'] = pd.to_datetime(matches['date'])
    print('matches taken into account :')
    print(matches)

    # Retrieve the maximum date from the Rankings table to get the last ratings
    last_date_query = "SELECT strftime('%Y-%m-%d',MAX(date)) FROM Rankings"
    last_date = pd.read_sql(last_date_query, conn).iloc[0, 0]
    last_date = datetime.strptime(last_date, "%Y-%m-%d")
    last_year = last_date.year
    last_month = last_date.month
    last_day = last_date.day
    
    # Load DataFrame from database
    teams_query = f"SELECT DISTINCT r.team, t.reference_team, r.points, t.startDate, t.endDate FROM Rankings r LEFT JOIN Teams t ON (r.team = t.team) WHERE year = {last_year} AND month = {last_month} AND day = {last_day}"
    teams_sql = pd.read_sql(teams_query, conn)

    teams_last_level['reference_team'] = teams_sql['reference_team']
    teams_last_level['points'] = teams_sql['points']

conn.close()

print('Teams & Matches data extracted')

# We generate a unique dataset file for the following steps
teams_db = teams_excel.merge(teams_last_level, on='reference_team')

# Save the datasets in temp csv files
matches.to_csv('data/temp/matches.csv', index=False)
teams_db.to_csv('data/temp/teams.csv', index=False)
# Save last_date variable in a text file
with open('data/temp/last_date.txt', 'w') as file:
    file.write(str(last_date))

print('Teams, Matches, Last Date data saved in temp files')
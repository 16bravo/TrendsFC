import sqlite3
import sys
import pandas as pd
import numpy as np
from tqdm import tqdm
from datetime import datetime

# Host country
host = 'Germany'
# Nb of iterations
iterations = 100
# Output file name from current date
now = datetime.now()
date_str = now.strftime('%Y-%m-%d')
date_str = '2024-07-15'
#formatted_now = now.strftime("%Y%m%d%H%M%S")
#file_name = 'euro2024_sim_result_NEW'+formatted_now+'.xlsx'


# SQLite database connection
# get ranking points for each teams
database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)

sql_query = '''
                WITH max_date AS (
                    SELECT MAX(date) as max_date, strftime('%Y', MAX(date)) AS year
                    FROM Rankings
                    WHERE date 
                )
                SELECT r.ranking, r.team, r.points, t.confederation
                FROM Rankings r
                LEFT JOIN Teams t ON (r.team = t.team)
                WHERE date = (SELECT MAX(date) FROM Rankings)
               '''

teams_level = pd.read_sql_query(sql_query, connection)

#connection.close()

# get matches results
matches = pd.read_excel('././data/source/competitions/euro2024.xlsx')


# MATCH SIM
def get_team_level(team):
    return teams_level.loc[teams_level['team'] == team, 'points'].values[0]

def get_result(ecart,ecart_lvl):
    if ecart <= -ecart_lvl :
        return (0,3)
    elif ecart < ecart_lvl :
        return (1,1)
    else :
        return (3,0)

def match(team1_level,team2_level,type):
    if (type == 0) :
        ecart_lvl = 145
        avantage = 0
    else :
        ecart_lvl = 123
        avantage = 45
    
    ecart = np.random.normal(team1_level-team2_level+avantage,330)

    result1, result2 = get_result(ecart,ecart_lvl)

    return ecart, result1, result2, max(ecart,0), max(-ecart,0) # for goals (see if necessary to develop this)

def check_match(phase,team1,team2):
    all_match_data = (matches[
            ((matches['home_team'] == team1) & (matches['away_team'] == team2) |
            (matches['away_team'] == team1) & (matches['home_team'] == team2)) &
            (matches['phase'] == phase)
        ])
    
    # if the game is not planned yet
    if len(all_match_data) == 0 :
        return match(get_team_level(team1), get_team_level(team2), 1 if team1 == host else 0)
    
    # if the game is planned but not played yet
    elif pd.isna(all_match_data.iloc[0]['home_score']):
        return match(get_team_level(team1), get_team_level(team2), 1 if team1 == host else 0)
    
    #if the game is already played
    else:
        match_data = all_match_data.iloc[0]
        team1_score = match_data['home_score'] if match_data['home_team'] == team1 else match_data['away_score']
        team2_score = match_data['away_score'] if match_data['home_team'] == team1 else match_data['home_score']
        ecart = (team1_score - team2_score)*130
        result = (get_result(ecart,130))
        return (ecart, result[0], result[1], team1_score, team2_score)

# GROUP STAGE SIM

def group_stage(group, team1,team2,team3,team4):

    # matches list
    matches = [
        (team1, team2),
        (team3, team4),
        (team1, team3),
        (team2, team4),
        (team1, team4),
        (team2, team3)
    ]

    # list to stock match result
    match_results = []

    # simulate matches or check if exists
    for teamA, teamB in matches:
        ecart, resultA, resultB, scoreA, scoreB = check_match(group, teamA, teamB)
        match_result = {'teamA': teamA, 'teamB': teamB, 'ecart': ecart, 'resultA': resultA, 'resultB': resultB, 'scoreA': scoreA, 'scoreB': scoreB}
        match_results.append(match_result)

    # dataframe creation from simulated/existing results
    group_result = pd.DataFrame(match_results)

    # ranking calculation
    teams = [team1, team2, team3, team4]
    ranking_data = []
    
    for team in teams:
        total_result = group_result.loc[group_result['teamA'] == team, 'resultA'].sum() + group_result.loc[group_result['teamB'] == team, 'resultB'].sum()
        total_ecart = group_result.loc[group_result['teamA'] == team, 'ecart'].sum() - group_result.loc[group_result['teamB'] == team, 'ecart'].sum()
        total_goal = group_result.loc[group_result['teamA'] == team, 'scoreA'].sum() + group_result.loc[group_result['teamB'] == team, 'scoreB'].sum()
        ranking_data.append({'team': team, 'total_result': total_result, 'total_ecart': total_ecart, 'total_goal': total_goal})

    group_ranking_step1 = pd.DataFrame(ranking_data)
    group_ranking_step1 = group_ranking_step1.sort_values(by='total_result', ascending=False).reset_index(drop=True)
    group_ranking_step1['ranking1'] = group_ranking_step1['total_result'].rank(method='min', ascending=False).astype(int)

    # sub_dataframes from ranking
    ranking_groups = group_ranking_step1.groupby('ranking1')

    sub_dfs = []
    for rank, group in ranking_groups:
        teams_in_rank = group['team'].tolist()
        filtered_results = group_result[(group_result['teamA'].isin(teams_in_rank)) & (group_result['teamB'].isin(teams_in_rank))]
        
        sub_ranking_data = []
        for team in teams_in_rank:
            total_result_step2 = filtered_results.loc[filtered_results['teamA'] == team, 'resultA'].sum() + filtered_results.loc[filtered_results['teamB'] == team, 'resultB'].sum()
            total_ecart_step2 = filtered_results.loc[filtered_results['teamA'] == team, 'ecart'].sum() - filtered_results.loc[filtered_results['teamB'] == team, 'ecart'].sum()
            total_goal_step2 = filtered_results.loc[filtered_results['teamA'] == team, 'scoreA'].sum() + filtered_results.loc[filtered_results['teamB'] == team, 'scoreB'].sum()
            sub_ranking_data.append({'team': team, 'total_result_2': total_result_step2, 'total_ecart_2': total_ecart_step2, 'total_goal_2': total_goal_step2})
        
        sub_df = pd.DataFrame(sub_ranking_data)
        sub_dfs.append(sub_df)

    concatenated_sub_dfs = pd.concat(sub_dfs).reset_index(drop=True)

    group_ranking_step2 = group_ranking_step1.merge(concatenated_sub_dfs, on='team', how='left')

    group_ranking_step2 = group_ranking_step2.sort_values(
        by=['total_result', 'total_result_2', 'total_ecart_2', 'total_goal_2', 'total_ecart', 'total_goal'],
        ascending=[False, False, False, False, False, False]
    ).reset_index(drop=True)

    group_ranking_step2['rank'] = group_ranking_step2.index + 1

    return group_ranking_step2

# KNOCKOUTS

# Draw functions : specific to Euro 2024
def ko_teams_euro24():
    # BEST THIRDS RANKING
    thirds_ranking = pd.concat([groupA[groupA['rank']==3], groupB[groupB['rank']==3], groupC[groupC['rank']==3], groupD[groupD['rank']==3], groupE[groupE['rank']==3], groupF[groupF['rank']==3]])
    thirds_ranking = thirds_ranking.assign(group=['A','B','C','D','E','F'])
    thirds_ranking = thirds_ranking.sort_values(
        by=['total_result', 'total_ecart'],
        ascending=[False, False]
    ).reset_index(drop=True)
    thirds_ranking['rank'] = thirds_ranking.index + 1
    eliminated = tuple(thirds_ranking[thirds_ranking['rank']>4]['group'])
    eliminated = set(eliminated)


    #SCENARIOS
    if eliminated == {'E','F'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
    elif eliminated == {'D','F'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
    elif eliminated == {'D','E'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
    elif eliminated == {'C','F'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
    elif eliminated == {'C','E'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
    elif eliminated == {'C','D'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
    elif eliminated == {'B','F'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
    elif eliminated == {'B','E'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
    elif eliminated == {'B','D'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
    elif eliminated == {'B','C'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="A"]['team'].to_string(index=False)
    elif eliminated == {'A','F'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
    elif eliminated == {'A','E'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
    elif eliminated == {'A','D'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
    elif eliminated == {'A','C'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="B"]['team'].to_string(index=False)
    elif eliminated == {'A','B'}:
        b_opp = thirds_ranking[thirds_ranking['group']=="F"]['team'].to_string(index=False)
        c_opp = thirds_ranking[thirds_ranking['group']=="E"]['team'].to_string(index=False)
        e_opp = thirds_ranking[thirds_ranking['group']=="D"]['team'].to_string(index=False)
        f_opp = thirds_ranking[thirds_ranking['group']=="C"]['team'].to_string(index=False)
    else:
        print('Error: No scenarios for third ranked teams')
        sys.exit()

    #ROUND OF 16 DRAW

    team1 = groupB[groupB['rank']==1]['team'].to_string(index=False)
    team2 = b_opp
    team3 = groupA[groupA['rank']==1]['team'].to_string(index=False)
    team4 = groupC[groupC['rank']==2]['team'].to_string(index=False)
    team5 = groupF[groupF['rank']==1]['team'].to_string(index=False)
    team6 = f_opp
    team7 = groupD[groupD['rank']==2]['team'].to_string(index=False)
    team8 = groupE[groupE['rank']==2]['team'].to_string(index=False)
    team9 = groupE[groupE['rank']==1]['team'].to_string(index=False)
    team10 = e_opp
    team11 = groupD[groupD['rank']==1]['team'].to_string(index=False)
    team12 = groupF[groupF['rank']==2]['team'].to_string(index=False)
    team13 = groupC[groupC['rank']==1]['team'].to_string(index=False)
    team14 = c_opp
    team15 = groupA[groupA['rank']==2]['team'].to_string(index=False)
    team16 = groupB[groupB['rank']==2]['team'].to_string(index=False)

    return team1,team2,team3,team4,team5,team6,team7,team8,team9,team10,team11,team12,team13,team14,team15,team16

def knock_out(team1,team2,team3,team4,team5,team6,team7,team8,team9,team10,team11,team12,team13,team14,team15,team16):

    winner1 = (team1) if check_match('Round of 16', team1, team2)[0] > 0 else (team2)
    winner2 = (team3) if check_match('Round of 16', team3, team4)[0] > 0 else (team4)
    winner3 = (team5) if check_match('Round of 16', team5, team6)[0] > 0 else (team6)
    winner4 = (team7) if check_match('Round of 16', team7, team8)[0] > 0 else (team8)
    winner5 = (team9) if check_match('Round of 16', team9, team10)[0] > 0 else (team10)
    winner6 = (team11) if check_match('Round of 16', team11, team12)[0] > 0 else (team12)
    winner7 = (team13) if check_match('Round of 16', team13, team14)[0] > 0 else (team14)
    winner8 = (team15) if check_match('Round of 16', team15, team16)[0] > 0 else (team16)
    
    winner9 = (winner1) if check_match('Quarter-final', winner1, winner2)[0] > 0 else (winner2)
    winner10 = (winner3) if check_match('Quarter-final', winner3, winner4)[0] > 0 else (winner4)
    winner11 = (winner5) if check_match('Quarter-final', winner5, winner6)[0] > 0 else (winner6)
    winner12 = (winner7) if check_match('Quarter-final', winner7, winner8)[0] > 0 else (winner8)

    winner13 = (winner9) if check_match('Semi-final', winner9, winner10)[0] > 0 else (winner10)
    winner14 = (winner11) if check_match('Semi-final', winner11, winner12)[0] > 0 else (winner12)

    winner16 = (winner13) if check_match('Final', winner13, winner14)[0] > 0 else (winner14)

    return team1,team2,team3,team4,team5,team6,team7,team8,team9,team10,team11,team12,team13,team14,team15,team16, winner1, winner2, winner3, winner4, winner5, winner6, winner7, winner8, winner9, winner10, winner11, winner12, winner13, winner14, winner16

# SIMULATION
raw_result_columns = ['KO_1','KO_2','KO_3','KO_4','KO_5','KO_6','KO_7','KO_8','KO_9','KO_10','KO_11','KO_12','KO_13','KO_14','KO_15','KO_16','QF_1','QF_2','QF_3','QF_4','QF_5','QF_6','QF_7','QF_8','SF_1','SF_2','SF_3','SF_4','F_1','F_2','Champion']
raw_result = pd.DataFrame(columns=raw_result_columns)

for i in tqdm(range(iterations), desc="Processing", unit="iteration"):
    # GROUP STAGE
    groupA = group_stage('Group A', 'Germany','Scotland','Hungary','Switzerland')
    groupB = group_stage('Group B','Spain','Croatia','Italy','Albania')
    groupC = group_stage('Group C','Denmark','Slovenia','Serbia','England')
    groupD = group_stage('Group D','Poland','Netherlands','Austria','France')
    groupE = group_stage('Group E','Belgium','Slovakia','Romania','Ukraine')
    groupF = group_stage('Group F','Turkey','Georgia','Portugal','Czechia')

    ro16_teams = ko_teams_euro24()

    raw_result.loc[len(raw_result)] = knock_out(*ro16_teams)

raw_result = pd.melt(raw_result)
raw_result[['Level', 'Number']] = raw_result['variable'].str.split('_', expand=True)
result_counts = raw_result.groupby(['value', 'Level']).size().reset_index(name='Counts')
calculated_result = result_counts.pivot_table(index='value', columns='Level', values='Counts', fill_value=0)
#calculated_result.columns = ['KO', 'QF', 'SF', 'F', 'Champion']
calculated_result.reset_index(inplace=True)
print(calculated_result)

# Insert matches data into SQLite table
cursor = connection.cursor()
for index, row in calculated_result.iterrows():
    cursor.execute('''
        INSERT INTO CompetitionsProbabilities (competition, date, team, champion_pb, final_pb, semi_final_pb, quarter_final_pb, round_of_16_pb)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    '''
        , ('Euro Championship',
            date_str, row['value'],
            row['Champion']/iterations,
            row['F']/iterations,
            row['SF']/iterations,
            row['QF']/iterations,
            row['KO']/iterations
        ))

connection.commit()
connection.close()

'''#raw_result.to_excel('raw_result.xlsx', index=False)
#result_counts.to_excel('result_counts.xlsx', index=False)
calculated_result.to_excel(file_name, index=False)'''
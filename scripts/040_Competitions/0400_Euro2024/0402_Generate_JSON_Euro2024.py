import json
import sqlite3

database_path = "data/TrendsFC.db"
connection = sqlite3.connect(database_path)
cursor = connection.cursor()

# JSON Generation
cursor.execute("SELECT DISTINCT date FROM CompetitionsProbabilities ORDER BY date;")
dates = cursor.fetchall()

def col_str(col):
    return ", ".join([f"MAX(CASE WHEN date = '{date[0]}' THEN {col} ELSE NULL END) AS '{date[0]}'" for date in dates])

def query(col_str):
    return f"""
    SELECT team, {col_str}
    FROM CompetitionsProbabilities
    GROUP BY team
    ORDER BY team;
    """

def gen_JSON(query,name):
    cursor.execute(query)
    results = cursor.fetchall()

    column_names = [description[0] for description in cursor.description]

    data = []
    for row in results:
        row_data = {column_names[i]: row[i] for i in range(len(column_names))}
        data.append(row_data)

    with open('data/json/competitions/euro2024_'+name+'.json', 'w') as json_file:
        json.dump(data, json_file, indent=4)

champion_columns_str = col_str('champion_pb')
final_columns_str = col_str('final_pb')
semi_columns_str = col_str('semi_final_pb')
quarter_columns_str = col_str('quarter_final_pb')
ko_columns_str = col_str('round_of_16_pb')

champion_query = query(champion_columns_str)
final_query = query(final_columns_str)
semi_query = query(semi_columns_str)
quarter_query = query(quarter_columns_str)
ko_query = query(ko_columns_str)

# Data recovery
gen_JSON(champion_query,'champion')
gen_JSON(final_query,'final')
gen_JSON(semi_query,'semiFinal')
gen_JSON(quarter_query,'quarterFinal')
gen_JSON(ko_query,'roundOf16')

connection.close()
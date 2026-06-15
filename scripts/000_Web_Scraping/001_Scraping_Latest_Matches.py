import pandas as pd
from datetime import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType
import sys

chrome_driver_path = '/usr/local/bin/chromedriver'
chrome_service = Service(chrome_driver_path)

chrome_options = Options()
options = [
    "--headless",
    "--disable-gpu",
    "--window-size=922,900",
    "--ignore-certificate-errors",
    "--disable-extensions",
    "--no-sandbox",
    "--disable-dev-shm-usage"
]
for option in options:
    chrome_options.add_argument(option)

driver = webdriver.Chrome(service=chrome_service, options=chrome_options)

url = 'https://www.eloratings.net/latest'

driver.get(url)
wait = WebDriverWait(driver, 10)
table_element = wait.until(EC.presence_of_element_located((By.CLASS_NAME, 'maintable')))
html_content = driver.page_source
driver.quit()
soup = BeautifulSoup(html_content, 'html.parser')
table = soup.find('div', class_='maintable')

date = []
team1 = []
team2 = []
score1 = []
score2 = []
tournament = []
country = []

for row in table.find_all('div', class_='slick-row'):
    
    date_text = row.find('div', class_='l0').get_text(separator='<br>').strip()

    date_list = date_text.split('<br>')
    date_site = date_list[1]
    date_obj = datetime.strptime(date_site, "%b %d")
    today = datetime.now()
    year = today.year if date_obj.month <= today.month else today.year - 1
    date.append(date_obj.replace(year=year).strftime("%d/%m/%Y"))
    
    match_text = row.find('div', class_='l1').get_text(separator='<br>').strip()
    match_list = match_text.split('<br>')
    team1.append(match_list[0])
    team2.append(match_list[1] if len(match_list) > 1 else '')

    score_text = row.find('div', class_='l2').get_text(separator='<br>').strip()
    score_list = score_text.split('<br>')
    score1.append(int(score_list[0]))
    score2.append(int(score_list[1]) if len(score_list) > 1 else '')

    tournament_text = row.find('div', class_='l3').get_text(separator='<br>').strip()
    tournament_text = tournament_text.replace("<br> & <br>", " and ")
    tournament_list = tournament_text.split('<br>')
    tournament.append(tournament_list[0])
    country.append(tournament_list[1] if len(tournament_list) > 1 else '')

df = pd.DataFrame({
    'date': date,
    'home_team': team1,
    'away_team': team2,
    'home_score': score1,
    'away_score': score2,
    'tournament': tournament,
    'country': country
})

df['country'] = df['country'].str.replace(r'^(in the |in )', '', regex=True)
df['country'] = df['country'].str.replace(r'Dem Rep of the Congo', 'DR Congo')
df['neutral'] = (df['home_team'] != df['country'])
df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
df = df.sort_values(by='date')

columns = ['date','home_team','away_team','home_score','away_score','tournament','country','neutral']

history_data = 'data/source/match_dataset/all_matches.csv'
history_csv = pd.read_csv(history_data)
history_csv = history_csv[columns]

df = df[columns]

print(df)

history_csv = pd.concat([history_csv, df], ignore_index=True)
history_csv['date'] = pd.to_datetime(history_csv['date'], format='%Y-%m-%d')
history_csv = history_csv.drop_duplicates(subset=history_csv.columns.difference(['index']))

# Affichez le DataFrame
history_csv.to_csv('data/source/match_dataset/all_matches.csv', index=False)

# Supprimez les doublons dans le fichier CSV final
pd.read_csv('data/source/match_dataset/all_matches.csv').drop_duplicates().to_csv('data/source/match_dataset/all_matches.csv', index=False)

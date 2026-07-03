import pandas as pd
import json
import os

def generate_real_results():
    csv_path = 'data/source/match_dataset/all_matches.csv'
    teams_db_path = 'data/teams_db.xlsx'
    output_path = 'data/json/real_results.json'

    print(f"Starting real results generation to {output_path}...")

    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return

    # Load mapping for name consistency
    try:
        # Check if the file exists before trying to read it
        if os.path.exists(teams_db_path):
            teams_excel = pd.read_excel(teams_db_path)
            mapping = teams_excel.set_index('team')['reference_team'].to_dict()
            print(f"Loaded {len(mapping)} team name mappings.")
        else:
            print(f"Warning: {teams_db_path} not found. Using original names.")
            mapping = {}
    except Exception as e:
        print(f"Warning: Could not load name mapping: {e}. Using original names.")
        mapping = {}

    df = pd.read_csv(csv_path)
    
    # Exclude Friendly matches
    df = df[df['tournament'] != 'Friendly']
    
    # DON'T apply mapping to team names in results - preserve historical names from CSV
    # The mapping will be handled client-side in simulation.js for data loading
    # This ensures "Serbia and Montenegro" and "Yugoslavia" are preserved as-is in real_results.json
    
    # Sort for consistency
    df = df.sort_values(['tournament', 'date'])
    
    results = {}
    count = 0
    for _, row in df.iterrows():
        tour = str(row['tournament'])
        date = str(row['date'])
        h = str(row['home_team'])
        a = str(row['away_team'])
        
        try:
            hs = int(row['home_score']) if not pd.isna(row['home_score']) else None
            ascore = int(row['away_score']) if not pd.isna(row['away_score']) else None
        except:
            hs, ascore = None, None
            
        if hs is None or ascore is None:
            continue

        if tour not in results:
            results[tour] = {}
        if date not in results[tour]:
            results[tour][date] = {}
            
        # Unique key for match identifying teams (alphabetical order)
        teams = sorted([h, a])
        key = f"{teams[0]}|{teams[1]}"
        
        # Store scores relative to alphabetical team order
        if h == teams[0]:
            results[tour][date][key] = {"s1": hs, "s2": ascore}
        else:
            results[tour][date][key] = {"s1": ascore, "s2": hs}
        count += 1

    # Apply manual overrides for knockout winners (e.g. penalty shootouts)
    overrides_path = 'data/json/knockout_overrides.json'
    if os.path.exists(overrides_path):
        try:
            with open(overrides_path, 'r', encoding='utf-8') as f:
                overrides = json.load(f)
            
            for tour, dates in overrides.items():
                if tour in results:
                    for date, matches in dates.items():
                        if date in results[tour]:
                            for key, override_data in matches.items():
                                if key in results[tour][date]:
                                    results[tour][date][key]["winner"] = override_data.get("winner")
            print(f"Applied overrides from {overrides_path}.")
        except Exception as e:
            print(f"Warning: Could not apply overrides: {e}")

    # Save
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"✓ {output_path} generated with {count} match results.")

if __name__ == "__main__":
    generate_real_results()

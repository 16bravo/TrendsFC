# TrendsFC

## Description
TrendsFC is a project that provides up-to-date rankings for national football teams. It features a unique probability calculation system that shows win chances for both past and future matches. The system takes into account historical data and scheduled matches to provide accurate team rankings and match predictions.

## Features
- Real-time national team rankings
- Match probability calculations
- Historical match analysis
- Future match predictions
- Competition-specific rankings
- Interactive web interface

## Installation

1. Clone the repository:
```bash
git clone [repository URL]
cd TrendsFC
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configuration:
   - Create a Kaggle account if you don't have one
   - Generate your Kaggle API credentials (username and key)
   - Create a `kaggle.json` file in the `~/.kaggle/` directory with your credentials
   - Set up the following secrets in your environment:
     - `GIT_EMAIL`: Your Git email
     - `GIT_USERNAME`: Your Git username
     - `KAGGLE_JSON`: Your Kaggle API credentials

## Project Structure
```
TrendsFC/
├── data/           # Generated data
├── scripts/        # Python scripts
│   ├── 000_Web_Scraping/      # Data collection
│   ├── 010_DB_Initialisation/ # Database setup
│   ├── 020_DB_Update/         # Database updates
│   ├── 030_JSON_Generation/   # JSON data generation
│   ├── 040_Competitions/      # Competition processing
│   └── 090_Final_Actions/     # Cleanup and final steps
├── css/            # Stylesheets
├── js/             # JavaScript files
├── img/            # Images
└── fonts/          # Font files
```

## Usage
The project is designed to run automatically through GitHub Actions. The workflow:
1. Collects football data
2. Updates the database
3. Generates JSON files
4. Updates the website with new rankings and predictions

## Future Features
- Enhanced competition prediction system
- Improved user interface
- Additional statistical analysis
- More detailed match probability breakdowns

## Contributing
While the core functionality is maintained by the main developer, contributions are welcome for:
- UI/UX improvements
- Competition prediction features
- Bug fixes and optimizations

## Contact
For questions or suggestions, please open an issue in the repository.

# Visualization Critique and Redesign

## Project
Redesign of Our World in Data's "Life expectancy vs. GDP per capita" visualization.

## Files
- `index.html` — complete GitHub Pages project page
- `project.js` — D3 implementation
- `style.css` — page styles
- `data/gapminder_life_gdp.csv` — external CSV used by D3
- `report/report.html` — 500–800 word report draft

## Run locally

From the folder that contains this project:

```bash
python3 -m http.server 8099
```

Open:

`http://127.0.0.1:8099/Visualization_Critique_and_Redesign/`

If you copy the folder into the root of your `stats401-labs` repo, the final GitHub Pages URL will be:

`https://hanchizhao.github.io/stats401-labs/Visualization_Critique_and_Redesign/`

## Before final submission
1. Run the page and test:
   - year slider
   - continent focus
   - country search
   - hover tooltip
   - click selection
   - clear selection
2. Take a screenshot of the finished redesign.
3. Replace the Figure 2 placeholder in `report/report.html` with that screenshot.
4. Add a navigation link on your course homepage titled exactly:
   `Visualization Critique and Redesign`
5. Push to GitHub and verify the live GitHub Pages version.

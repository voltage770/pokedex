# pokedex

a fully static pokemon browser. no backend, no database — all data is bundled from committed json files.

live at [voltage770.github.io/pokedex](https://voltage770.github.io/pokedex)

## stack

- react + vite + react router + sass
- data lives in `app/src/data/pokemon.json` and `abilities.json`, generated from pokeapi
- deployed to github pages via github actions on every push to `main`

## local dev

```bash
cd app && npm install && npm run dev
```

## regenerating data

```bash
cd scripts && npm install
node db/generate.js          # fetch pokeapi (~15–20 min)
node db/patch_evolutions.js  # patch evo conditions pokeapi gets wrong
node db/fetch_abilities.js   # rebuild ability descriptions
node db/scrape_flavor.js     # scrape bulbapedia for form-specific flavor text
```

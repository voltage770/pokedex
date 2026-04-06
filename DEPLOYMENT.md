# deployment

this is a fully static app — no server or database needed. the frontend is deployed to github pages via a github actions workflow on every push to `main`.

---

## architecture

- `app/` — react + vite frontend, deployed to github pages
- `scripts/` — data generation utility only (not deployed)
- `app/src/data/pokemon.json` — full pokemon dataset, committed to the repo

---

## local development

```bash
cd app && npm install && npm run dev
```

visit http://localhost:5173/pokedex/

---

## deploying

push to `main` — github actions builds and deploys automatically.

to trigger a manual deploy, go to the **actions** tab on github and run the workflow manually.

---

## regenerating pokemon data

if new pokemon are added to pokeapi, re-run the generate script to update the dataset:

```bash
cd scripts && npm install && node db/generate.js
```

this writes to `app/src/data/pokemon.json`. commit the updated file and push to redeploy.

---

## github pages setup (first time only)

1. go to repo settings → pages
2. set source to **github actions**
3. push to main — the workflow handles the rest

the site will be live at `https://YOUR_USERNAME.github.io/pokedex/`

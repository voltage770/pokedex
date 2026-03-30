# Deployment Guide

Full walkthrough for getting this project live using GitHub + Railway + GitHub Pages.

---

## Step 1 — Create a GitHub Account

1. Go to https://github.com and click **Sign up**
2. Choose a username, enter your email, create a password
3. Verify your email address

---

## Step 2 — Install Git (if you haven't)

- **Mac**: `brew install git` or download from https://git-scm.com
- **Windows**: Download from https://git-scm.com/download/win
- **Linux**: `sudo apt install git`

Verify: `git --version`

---

## Step 3 — Create the GitHub Repository

1. On GitHub, click the **+** icon → **New repository**
2. Name it `pokedex` (must match `base: '/pokedex/'` in `vite.config.js`)
3. Set it to **Public** (required for free GitHub Pages)
4. Do NOT add a README or .gitignore (we already have them)
5. Click **Create repository**

---

## Step 4 — Push Your Code to GitHub

In your terminal, from the project root (`pokedex/`):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pokedex.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 5 — Set Up Railway (Backend + MySQL)

### Create a Railway account
1. Go to https://railway.app
2. Click **Login with GitHub** — this links your repo automatically

### Create a new project
1. Click **New Project** → **Deploy from GitHub repo**
2. Select your `pokedex` repo
3. Railway will detect Node.js automatically

### Add a MySQL database
1. In your Railway project, click **+ New** → **Database** → **MySQL**
2. Railway creates a managed MySQL instance
3. Click the MySQL service → **Variables** tab
4. Copy these values (you'll need them shortly):
   - `MYSQLHOST`
   - `MYSQLPORT`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`

### Set backend environment variables
1. Click your Node.js service → **Variables** tab
2. Add these variables (using the MySQL values from above):

```
DB_HOST      = (value of MYSQLHOST)
DB_PORT      = (value of MYSQLPORT)
DB_USER      = (value of MYSQLUSER)
DB_PASSWORD  = (value of MYSQLPASSWORD)
DB_NAME      = (value of MYSQLDATABASE)
PORT         = 3001
```

### Seed the database
Run this once from your local machine, pointing at Railway's MySQL:

```bash
cd backend
DB_HOST=xxx DB_PORT=xxx DB_USER=xxx DB_PASSWORD=xxx DB_NAME=xxx node db/seed.js
```

Or set these in your local `.env` temporarily and run `node db/seed.js`.

### Get your Railway backend URL
1. Click your Node.js service → **Settings** → **Networking**
2. Click **Generate Domain**
3. Copy the URL — it looks like `https://pokedex-production-xxxx.up.railway.app`

---

## Step 6 — Configure GitHub Pages

### Enable GitHub Pages
1. Go to your GitHub repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

### Add your Railway URL as a GitHub Secret
1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `VITE_API_URL`
4. Value: your Railway URL (e.g. `https://pokedex-production-xxxx.up.railway.app`)
5. Click **Add secret**

---

## Step 7 — Deploy

Push any change to `main` to trigger the workflow:

```bash
git add .
git commit -m "Add deployment config"
git push
```

GitHub Actions will:
1. Build your React app with Vite
2. Deploy it to GitHub Pages automatically

Your site will be live at:
```
https://YOUR_USERNAME.github.io/pokedex/
```

---

## Local Development (after setup)

```bash
# Terminal 1 — backend
cd backend
npm install
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
Backend:  http://localhost:3001

The Vite proxy handles routing `/api` calls to the local backend automatically.

---

## Troubleshooting

**GitHub Actions fails on build**
- Check the Actions tab for error logs
- Make sure `VITE_API_URL` secret is set correctly

**Railway app crashes**
- Check Railway logs in the dashboard
- Confirm all `DB_*` environment variables are set

**GitHub Pages shows a blank page**
- Make sure `base: '/pokedex/'` in `vite.config.js` matches your repo name exactly
- Check that GitHub Pages source is set to "GitHub Actions" not a branch

**CORS errors in the browser**
- Make sure your Railway URL in `VITE_API_URL` has no trailing slash
- Confirm `server.js` CORS origin allows your GitHub Pages URL
  - Update `origin` in server.js to: `https://YOUR_USERNAME.github.io`

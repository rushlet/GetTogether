# GetTogether

A lightweight, shareable date poll: create a session, send its link, and see which dates work for the group. No accounts required.

## Features

- Create a poll with a title and date range (up to 120 days).
- Share a URL that identifies the poll.
- Respond with a name and every date you're available.
- Submit again using the same name to edit your response.
- View group availability, filter for dates everyone can make, and see a ranked shortlist.
- Responsive layout for mobile and desktop.

## Architecture

- **Frontend:** React/Vite hosted on GitHub Pages.
- **API:** Express/Node.js hosted on Render (or another Node host).
- **Database:** PostgreSQL hosted by Supabase.
- Poll data is stored in Supabase PostgreSQL, not in a local JSON file.

The API creates the `sessions` table on startup if it does not exist. Set `DATABASE_URL` on the API host to the Supabase PostgreSQL connection string. Keep this value private; never put it in frontend code or GitHub Pages build variables.

## Run locally

Requires Node.js 18 or newer and a Supabase project.

1. Set `DATABASE_URL` in your environment to your Supabase PostgreSQL connection string.
2. Set `VITE_API_BASE_URL` to the API URL, or leave it blank when running the frontend against a same-origin API.
3. Run:

```sh
npm install
npm run dev
```

Vite serves the frontend and proxies `/api` to the local Express server. The server needs a working `DATABASE_URL`.

For a production build:

```sh
npm run build
npm start
```

## Deploy

### Supabase

1. Create or open a Supabase project.
2. Open **Project Settings → Database** and copy the connection string (URI format).
3. Use the connection string as `DATABASE_URL` only in the Render service's environment settings. Do not commit it to this repository or expose it in the browser.

### Render API

1. Create a new **Web Service** from this GitHub repository.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variable `DATABASE_URL` with your Supabase connection string.
5. After deploy, verify `https://YOUR-RENDER-SERVICE.onrender.com/api/health` returns JSON with `"storage":"supabase-postgres"`.

### GitHub Pages frontend

1. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**.
2. Add repository variable `VITE_API_BASE_URL` with the full Render service URL, e.g. `https://your-service.onrender.com` (no trailing slash).
3. Push a commit or rerun the **Deploy GetTogether to GitHub Pages** workflow so Vite rebuilds with the API URL.

## API endpoints

- `GET /api/health` — API/database health check
- `POST /api/sessions` — create a poll
- `GET /api/sessions/:id` — load a poll
- `PUT /api/sessions/:id/responses` — create or update a response by name

## Security note

The database connection string stays server-side. Poll links are shareable, and the current product identifies edits by name rather than sign-in, so anyone who knows a poll link can potentially overwrite a response by using the same name. For broader public use, add rate limiting and a response-edit token or other ownership mechanism.

## Stack

React, Vite, Express, PostgreSQL (Supabase), and GitHub Pages.

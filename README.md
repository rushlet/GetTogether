# GetTogether

A lightweight, shareable date poll: create a session, send its link, and see which dates work for the group. No accounts required.

## Features

- Create a poll with a title and date range (up to 120 days).
- Share a URL that identifies the poll.
- Respond with a name and every date you're available.
- Submit again using the same name to edit your response.
- View group availability, filter for dates everyone can make, and see a ranked shortlist.
- Responsive layout for mobile and desktop.

## Run locally

Requires Node.js 18 or newer.

```sh
npm install
npm run dev
```

Vite serves the frontend at the URL it prints. For the JSON persistence API, run the app in production mode:

```sh
npm run build
npm start
```

Then open http://localhost:3000. The Express server serves the built frontend and the API from the same origin.

## JSON-file storage

By default, sessions persist to `data/sessions.json`. The API writes the complete JSON document via a temporary file and rename to reduce the chance of a partially written file.

- `GET /api/health` — health check
- `POST /api/sessions` — create a poll
- `GET /api/sessions/:id` — load a poll
- `PUT /api/sessions/:id/responses` — create or update a response by name

Set `DATA_FILE` to use another writable path and `PORT` to change the HTTP port. Keep a backup of the JSON file.

**Important limitations:** this is intentionally a temporary, single-server persistence layer, not a database. The server's filesystem must be writable and persistent; many serverless hosts and ephemeral containers will lose local file changes on redeploy/restart. Concurrent writes from multiple server processes are not coordinated. Names are used to identify edits and are not authentication; anyone with a poll link can submit or overwrite a response using the same name. For public production use, add rate limiting and stronger response ownership, and migrate to a database or durable storage service when needed.

## Deploy

Use a Node host that supports a persistent writable disk. Configure the build command as `npm run build`, start command as `npm start`, and mount/preserve the JSON data directory (or set `DATA_FILE` to a persistent volume path).

## Stack

React, Vite, Express, and a JSON file for temporary persistence. No external database or account system.

import express from 'express';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 3000);
const allowedOrigins = new Set([
  'https://rushlet.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.has(origin) || origin === process.env.FRONTEND_ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '256kb' }));

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY,
      title varchar(90) NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      weekdays integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
      created_at timestamptz NOT NULL DEFAULT now(),
      responses jsonb NOT NULL DEFAULT '[]'::jsonb
    )
  `);
  await pool.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS weekdays integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]');
}
const cleanText = (value, max) => String(value || '').trim().slice(0, max);
const asSession = row => ({
  id: row.id,
  title: row.title,
  startDate: typeof row.start_date === 'string' ? row.start_date : row.start_date.toISOString().slice(0,10),
  endDate: typeof row.end_date === 'string' ? row.end_date : row.end_date.toISOString().slice(0,10),
  weekdays: row.weekdays || [0,1,2,3,4,5,6],
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  responses: row.responses || []
});
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, storage: 'supabase-postgres' }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Database connection failed.' }); }
});
app.get('/api/sessions/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Session not found' });
    res.json({ session: asSession(result.rows[0]) });
  } catch (e) { next(e); }
});
app.post('/api/sessions', async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title, 90);
    const startDate = cleanText(req.body?.startDate, 10);
    const endDate = cleanText(req.body?.endDate, 10);
    const weekdays = Array.isArray(req.body?.weekdays) ? [...new Set(req.body.weekdays.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a,b)=>a-b) : [0,1,2,3,4,5,6];
    if (!weekdays.length) return res.status(400).json({ error: 'Choose at least one day of the week.' });
    if (!title) return res.status(400).json({ error: 'Add a title for your get-together.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate)
      return res.status(400).json({ error: 'Choose a valid date range.' });
    const span = (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000;
    if (!Number.isFinite(span) || span > 120) return res.status(400).json({ error: 'Choose a date range of 120 days or less.' });
    const id = crypto.randomBytes(9).toString('base64url');
    const result = await pool.query(
      'INSERT INTO sessions (id, title, start_date, end_date, weekdays) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, title, startDate, endDate, weekdays]
    );
    res.status(201).json({ session: asSession(result.rows[0]) });
  } catch (e) { next(e); }
});
app.put('/api/sessions/:id/responses', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const name = cleanText(req.body?.name, 48);
    const dates = Array.isArray(req.body?.dates) ? [...new Set(req.body.dates.map(d => cleanText(d, 10)))] : [];
    if (!name) return res.status(400).json({ error: 'Enter your name so the group knows who responded.' });
    if (dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return res.status(400).json({ error: 'One or more dates are invalid.' });
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Session not found' }); }
    const session = asSession(found.rows[0]);
    if (dates.some(d => d < session.startDate || d > session.endDate || !(session.weekdays || [0,1,2,3,4,5,6]).includes(new Date(d + 'T12:00:00').getDay()))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A selected date is outside this poll.' });
    }
    const responses = session.responses;
    const existing = responses.find(r => r.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) { existing.name = name; existing.dates = dates; existing.updatedAt = new Date().toISOString(); }
    else responses.push({ id: crypto.randomUUID(), name, dates, updatedAt: new Date().toISOString() });
    const result = await client.query('UPDATE sessions SET responses = $2::jsonb WHERE id = $1 RETURNING *', [req.params.id, JSON.stringify(responses)]);
    await client.query('COMMIT');
    res.json({ session: asSession(result.rows[0]) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally { client.release(); }
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong while saving. Please try again.' });
});
ensureSchema().then(() => {
  app.listen(PORT, () => console.log(`GetTogether API listening on port ${PORT}; PostgreSQL storage enabled.`));
}).catch(err => {
  console.error('Failed to initialize database schema:', err);
  process.exit(1);
});

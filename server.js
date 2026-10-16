import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data/sessions.json'));
app.use(express.json({ limit: '256kb' }));

async function ensureStore() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try { await fs.access(DATA_FILE); }
  catch { await fs.writeFile(DATA_FILE, JSON.stringify({ sessions: [] }, null, 2) + '\n', 'utf8'); }
}
async function readStore() {
  await ensureStore();
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    if (!parsed || !Array.isArray(parsed.sessions)) throw new Error('Invalid store format');
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw Object.assign(new Error('The JSON data file is invalid. Restore a valid data/sessions.json backup.'), { status: 500 });
    throw error;
  }
}
async function writeStore(store) {
  await ensureStore();
  const tmp = DATA_FILE + '.' + process.pid + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, DATA_FILE);
}
const cleanText = (value, max) => String(value || '').trim().slice(0, max);
app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'json-file' }));
app.get('/api/sessions/:id', async (req, res, next) => {
  try {
    const store = await readStore();
    const session = store.sessions.find(item => item.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (e) { next(e); }
});
app.post('/api/sessions', async (req, res, next) => {
  try {
    const title = cleanText(req.body?.title, 90);
    const startDate = cleanText(req.body?.startDate, 10);
    const endDate = cleanText(req.body?.endDate, 10);
    if (!title) return res.status(400).json({ error: 'Add a title for your get-together.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate)
      return res.status(400).json({ error: 'Choose a valid date range.' });
    const span = (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000;
    if (!Number.isFinite(span) || span > 120) return res.status(400).json({ error: 'Choose a date range of 120 days or less.' });
    const store = await readStore();
    const session = { id: crypto.randomBytes(7).toString('base64url'), title, startDate, endDate, createdAt: new Date().toISOString(), responses: [] };
    store.sessions.push(session);
    await writeStore(store);
    res.status(201).json({ session });
  } catch (e) { next(e); }
});
app.put('/api/sessions/:id/responses', async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 48);
    const dates = Array.isArray(req.body?.dates) ? [...new Set(req.body.dates.map(d => cleanText(d, 10)))] : [];
    if (!name) return res.status(400).json({ error: 'Enter your name so the group knows who responded.' });
    if (dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return res.status(400).json({ error: 'One or more dates are invalid.' });
    const store = await readStore();
    const session = store.sessions.find(item => item.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (dates.some(d => d < session.startDate || d > session.endDate)) return res.status(400).json({ error: 'A selected date is outside this poll.' });
    const existing = session.responses.find(r => r.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) { existing.name = name; existing.dates = dates; existing.updatedAt = new Date().toISOString(); }
    else session.responses.push({ id: crypto.randomUUID(), name, dates, updatedAt: new Date().toISOString() });
    await writeStore(store);
    res.json({ session });
  } catch (e) { next(e); }
});
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'dist/index.html'), err => { if (err) next(err); });
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong while saving. Please try again.' });
});
app.listen(PORT, () => console.log(`GetTogether listening on http://localhost:${PORT}; JSON store: ${DATA_FILE}`));

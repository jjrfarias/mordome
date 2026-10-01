import http from 'node:http';
import { readFile, writeFile, mkdtemp, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import wa from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { authorized, encryptionKey, seal, unseal } from './crypto.mjs';

// Internal service only. No message/webhook receivers, arbitrary chat sends or public QR endpoint.
encryptionKey();
if ((process.env.WHATSAPP_GATEWAY_TOKEN?.length ?? 0) < 32) throw Error('Gateway token required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const owner = await pool.connect();
let ownsConnections = false;
const workdir = await mkdtemp(path.join(tmpdir(), 'mordome-wa-'));
await chmod(workdir, 0o700);
process.chdir(workdir);
const clients = new Map(), sent = new Map();
const MAX_CLIENTS = Number(process.env.WHATSAPP_MAX_CONNECTIONS ?? 5);
let shuttingDown = false;
let takeoverTimer, cleanupTimer;
owner.on('error', () => { void shutdown(); });

async function connect(unit) {
  if (clients.has(unit)) return clients.get(unit);
  if (clients.size >= MAX_CLIENTS) throw Error('Capacity reached');
  const entry = { status: 'CONNECTING', qr: null, qrAt: 0, client: null };
  clients.set(unit, entry);
  const sessionName = `RemoteAuth-${unit}`;
  const checkSession = session => { if (session !== sessionName) throw Error('Session mismatch'); };
  const store = {
    async sessionExists({ session }) { checkSession(session); return Boolean((await pool.query('SELECT "credentialsCiphertext" FROM "WhatsAppConnection" WHERE "establishmentId"=$1 AND enabled=true', [unit])).rows[0]?.credentialsCiphertext); },
    async save({ session }) { checkSession(session); const data = await readFile(path.join(workdir, `${session}.zip`)); await pool.query('UPDATE "WhatsAppConnection" SET "credentialsCiphertext"=$2,"updatedAt"=NOW() WHERE "establishmentId"=$1 AND enabled=true', [unit, seal(unit, data)]); },
    async extract({ session, path: target }) { checkSession(session); const row = (await pool.query('SELECT "credentialsCiphertext" FROM "WhatsAppConnection" WHERE "establishmentId"=$1 AND enabled=true', [unit])).rows[0]; if (row?.credentialsCiphertext) await writeFile(target, unseal(unit, row.credentialsCiphertext), { mode: 0o600 }); },
    async delete({ session }) { checkSession(session); await pool.query('UPDATE "WhatsAppConnection" SET "credentialsCiphertext"=NULL,"updatedAt"=NOW() WHERE "establishmentId"=$1', [unit]); },
  };
  const client = new wa.Client({ authStrategy: new wa.RemoteAuth({ clientId: unit, store, backupSyncIntervalMs: 60000, dataPath: path.join(workdir, 'sessions') }), puppeteer: { headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] } });
  entry.client = client;
  client.on('qr', qr => { void QRCode.toDataURL(qr).then(value => { entry.status = 'QR'; entry.qr = value; entry.qrAt = Date.now(); }).catch(() => { entry.status = 'DISCONNECTED'; }); });
  client.on('ready', () => { entry.status = 'READY'; entry.qr = null; });
  const unavailable = () => { entry.status = 'DISCONNECTED'; entry.qr = null; };
  client.on('auth_failure', unavailable);
  client.on('disconnected', unavailable);
  void client.initialize().catch(unavailable);
  return entry;
}

const server = http.createServer(async (req, res) => {
  const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (req.url === '/health') return reply(shuttingDown ? 503 : 200, { status: 'ok' });
  if (!authorized(req.headers.authorization, process.env.WHATSAPP_GATEWAY_TOKEN)) return reply(401, { error: 'Unauthorized' });
  const match = /^\/units\/([a-zA-Z0-9_-]{1,100})\/(status|connect|disconnect|send-code)$/.exec(req.url ?? '');
  if (!match) return reply(404, { error: 'Not found' });
  const [, unit, action] = match;
  if (req.method !== (action === 'status' ? 'GET' : 'POST')) return reply(405, { error: 'Method not allowed' });
  try {
    if (!ownsConnections) return reply(503, { error: 'Starting' });
    const known = await pool.query('SELECT e.name FROM "Establishment" e JOIN "Organization" o ON o.id=e."organizationId" WHERE e.id=$1 AND e.active=true AND o.active=true', [unit]);
    if (!known.rows.length) return reply(404, { error: 'Not found' });
    if (action === 'disconnect') {
      const existing = clients.get(unit); clients.delete(unit);
      await pool.query('UPDATE "WhatsAppConnection" SET enabled=false,"credentialsCiphertext"=NULL,"updatedAt"=NOW() WHERE "establishmentId"=$1', [unit]);
      if (existing?.client) { await existing.client.logout().catch(() => {}); await existing.client.destroy().catch(() => {}); }
      return reply(200, { status: 'DISCONNECTED' });
    }
    if (action === 'connect') {
      const existing = clients.get(unit);
      if (existing?.status === 'DISCONNECTED') { await existing.client.destroy().catch(() => {}); clients.delete(unit); }
      await pool.query('INSERT INTO "WhatsAppConnection" ("establishmentId",enabled,"updatedAt") VALUES ($1,true,NOW()) ON CONFLICT ("establishmentId") DO UPDATE SET enabled=true,"updatedAt"=NOW()', [unit]);
      await connect(unit);
    }
    const entry = clients.get(unit);
    if (action !== 'send-code') return reply(200, { status: entry?.status ?? 'DISCONNECTED', qr: entry?.status === 'QR' && Date.now() - entry.qrAt < 55000 ? entry.qr : null });
    if (entry?.status !== 'READY') return reply(503, { error: 'Unavailable' });
    let text = '';
    for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 2048) return reply(413, { error: 'Too large' }); }
    const data = JSON.parse(text);
    if (!/^55[1-9]{2}9\d{8}$/.test(data.phone) || !/^\d{6}$/.test(data.code) || !/^[a-f0-9-]{36}$/.test(data.requestId)) return reply(400, { error: 'Invalid data' });
    // Only an unconsumed challenge for this unit and number may be sent. The caller supplies the code, never arbitrary text.
    const challenge = await pool.query('SELECT id FROM "CustomerChallenge" WHERE id=$1 AND "establishmentId"=$2 AND phone=$3 AND consumed=false AND sent=false AND "expiresAt">NOW()', [data.requestId, unit, data.phone]);
    if (!challenge.rows.length) return reply(409, { error: 'Invalid challenge' });
    const key = `${unit}:${data.requestId}`;
    if (!sent.has(key)) {
      const delivery = (async () => {
        const id = await entry.client.getNumberId(data.phone);
        if (!id) throw Error('Recipient unavailable');
        await entry.client.sendMessage(id._serialized, `${known.rows[0].name}: seu código de acesso ao Mordomê é ${data.code}. Validade: 5 minutos. Não compartilhe. Se não solicitou, ignore.`, { sendSeen: false });
      })();
      sent.set(key, { delivery, at: Date.now() });
    }
    await sent.get(key).delivery;
    for (const [id, value] of sent) if (Date.now() - value.at > 600000) sent.delete(id);
    return reply(200, { status: 'READY' });
  } catch { return reply(503, { error: 'Unavailable' }); }
});

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(takeoverTimer);
  clearInterval(cleanupTimer);
  server.close();
  await Promise.allSettled([...clients.values()].map(entry => entry.client?.destroy()));
  owner.release(); await pool.end(); process.exit(0);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
server.listen(Number(process.env.PORT ?? 8090), '0.0.0.0');
let acquiring = false;
async function acquireConnections() {
  if (shuttingDown || ownsConnections || acquiring) return;
  acquiring = true;
  try {
    const lock = await owner.query('SELECT pg_try_advisory_lock(72413081) AS acquired');
    if (!lock.rows[0].acquired) return;
    ownsConnections = true;
    const saved = await pool.query('SELECT "establishmentId" FROM "WhatsAppConnection" WHERE enabled=true ORDER BY "updatedAt" LIMIT $1', [MAX_CLIENTS]);
    for (const row of saved.rows) await connect(row.establishmentId);
  } finally { acquiring = false; }
}
// During rolling deploys the new process becomes healthy, then takes over after the old process releases its lock.
takeoverTimer = setInterval(() => { void acquireConnections().catch(() => shutdown()); }, 3000);
// Verification challenges are transient secrets, not business history or audit events.
cleanupTimer = setInterval(() => { if (ownsConnections) void pool.query('DELETE FROM "CustomerChallenge" WHERE "expiresAt" < NOW() - INTERVAL \'1 day\'').catch(() => {}); }, 3600000);
cleanupTimer.unref();
await acquireConnections();

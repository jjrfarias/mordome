// Manual integration test. Starts and disposes its own local PostgreSQL, Next and mock S3.
// Never uses the caller's DATABASE_URL or a production database.
import assert from 'node:assert/strict';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const helper = fileURLToPath(new URL('./mock-graph.mjs', import.meta.url));
if (process.env.NODE_ENV === 'production') throw new Error('Este teste só pode rodar fora de produção.');
try {
  await access(path.join(root, '.next/dev/lock'));
  throw new Error('Encerre next dev neste checkout ou execute o teste em um checkout separado.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const scratch = await mkdtemp(path.join(tmpdir(), 'mordome-tv-test-'));
const runId = Date.now().toString(36);
const databasePort = Number(process.env.TV_TEST_DATABASE_PORT || 47621);
const appPort = 47620;
const storagePort = 47622;
const origin = `http://127.0.0.1:${appPort}`;
let postgresLog = '';
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(scratch, `data-${runId}`),
  user: 'tv_test', password: 'isolated-local-test-only', port: databasePort,
  persistent: false, createPostgresUser: false,
  postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories='],
  onLog(message) { postgresLog += String(message); }, onError(message) { postgresLog += String(message); },
});
const databaseUrl = `postgresql://tv_test:isolated-local-test-only@127.0.0.1:${databasePort}/mordome_tv_test`;
const env = {
  ...process.env, NODE_ENV: 'development', DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl,
  MORDOME_TV_TEST_DIR: scratch,
  CUSTOMER_AUTH_SECRET: 'isolated-tv-secret-for-local-tests-32-characters',
  AUTH_RATE_SECRET: 'isolated-rate-secret-for-local-tests-32-characters',
  AUTH_PUBLIC_URL: origin, LOCAL_AUTH_ENABLED: 'false',
  TV_S3_ENDPOINT: `http://127.0.0.1:${storagePort}`, TV_S3_BUCKET: 'tv-test',
  TV_S3_REGION: 'us-east-1', TV_S3_ACCESS_KEY_ID: 'local-test-access-key',
  TV_S3_SECRET_ACCESS_KEY: 'local-test-storage-secret', TV_S3_FORCE_PATH_STYLE: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  TV_CAST_APP_ID: 'AB12EF34',
  META_APP_ID: '123456789', META_APP_SECRET: 'isolated-meta-app-secret-123456789', META_INSTAGRAM_CONFIG_ID: '987654321',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS||''} --import=${pathToFileURL(helper).href}`.trim(),
};
const checks = [];
function pass(label) { checks.push(label); console.log(`PASS ${label}`); }
function run(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`Command exited ${code}: ${output.slice(-6000)}`)));
  });
}
const objects = new Map();
const s3 = createServer(async (request, response) => {
  try {
    const key = new URL(request.url, 'http://127.0.0.1').pathname.replace(/^\/tv-test\//, '');
    if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(key, { bytes: Buffer.concat(chunks), contentType: request.headers['content-type'] });
      response.setHeader('ETag', '"test-etag"'); response.writeHead(200); response.end(); return;
    }
    if (request.method === 'DELETE') { objects.delete(key); response.writeHead(204); response.end(); return; }
    const object = objects.get(key);
    if (!object) { response.writeHead(404, { 'Content-Type': 'application/xml' }); response.end('<Error><Code>NoSuchKey</Code></Error>'); return; }
    let bytes = object.bytes, status = 200;
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
    if (range) {
      const start = Number(range[1]), end = range[2] ? Number(range[2]) : bytes.length - 1;
      response.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
      bytes = bytes.subarray(start, end + 1); status = 206;
    }
    response.setHeader('Content-Length', bytes.length);
    response.setHeader('Content-Type', object.contentType || 'application/octet-stream');
    response.setHeader('ETag', '"test-etag"');
    response.writeHead(status); response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(500); response.end(); }
});
let sql, next;
let nextLog = '';
async function seed() {
  const now = new Date();
  for (const [id, name] of [['org-a','Organization A'], ['org-b','Organization B']]) {
    await sql.query('INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ($1,$2,$1,$3)', [id,name,now]);
  }
  for (const [id, organizationId] of [['unit-a1','org-a'],['unit-a2','org-a'],['unit-b1','org-b']]) {
    await sql.query('INSERT INTO "Establishment" (id,"organizationId",name,slug,"updatedAt") VALUES ($1,$2,$1,$1,$3)', [id,organizationId,now]);
  }
  await sql.query('INSERT INTO "Permission" (id,key,module,description) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING', ['tv-test-permission','integrations.manage','integrations','Manage integrations']);
  const permissionId = (await sql.query('SELECT id FROM "Permission" WHERE key=$1', ['integrations.manage'])).rows[0].id;
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `scrypt:${salt}:${scryptSync('TvSmoke123!', salt, 64).toString('hex')}`;
  for (const [id, organizationId, allowed, managed] of [
    ['user-a','org-a',['unit-a1','unit-a2'],true],
    ['user-b','org-b',['unit-b1'],true],
    ['user-restricted','org-a',['unit-a1'],true],
    ['user-viewer','org-a',['unit-a1'],false],
  ]) {
    await sql.query('INSERT INTO "User" (id,name,username,"passwordHash","updatedAt") VALUES ($1,$1,$1,$2,$3)', [id,passwordHash,now]);
    await sql.query('INSERT INTO "OrganizationMembership" (id,"organizationId","userId",status,"updatedAt") VALUES ($1,$2,$3,\'ACTIVE\',$4)', [`membership-${id}`,organizationId,id,now]);
    for (const unit of allowed) await sql.query('INSERT INTO "EstablishmentAccess" (id,"membershipId","establishmentId") VALUES ($1,$2,$3)', [`access-${id}-${unit}`,`membership-${id}`,unit]);
    if (managed) {
      await sql.query('INSERT INTO "CustomRole" (id,"organizationId",name,"updatedAt") VALUES ($1,$2,$1,$3)', [`role-${id}`,organizationId,now]);
      await sql.query('INSERT INTO "RolePermission" ("roleId","permissionId") VALUES ($1,$2)', [`role-${id}`,permissionId]);
      await sql.query('INSERT INTO "MembershipRole" ("membershipId","roleId") VALUES ($1,$2)', [`membership-${id}`,`role-${id}`]);
    }
  }
}
async function request(route, { cookie, body, method = body === undefined ? 'GET' : 'POST', headers = {}, raw } = {}) {
  const response = await fetch(origin + route, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : {'Content-Type':'application/json'}), Origin: origin, ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await response.arrayBuffer());
  let json = null;
  if (contentType.includes('json')) json = JSON.parse(bytes.toString());
  return { response, status: response.status, headers: response.headers, json, bytes };
}
async function login(username) {
  const result = await request('/api/auth/login', {body:{ username,password:'TvSmoke123!' }});
  assert.equal(result.status,200,JSON.stringify(result.json));
  const setCookie = result.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  return setCookie.split(';')[0];
}
async function verifyApi() {
  const a = await login('user-a'), b = await login('user-b');
  const restricted = await login('user-restricted'), viewer = await login('user-viewer');
  assert.equal((await request('/api/admin/tv?establishmentId=unit-a1')).status,401);
  assert.equal((await request('/api/admin/tv?establishmentId=unit-a1', {cookie:viewer})).status,403);
  assert.equal((await request('/api/admin/tv?establishmentId=unit-b1', {cookie:a})).status,404);
  assert.equal((await request('/api/admin/tv?establishmentId=unit-a2', {cookie:restricted})).status,404);
  pass('real login, missing session, permission and organization/unit isolation');

  assert.equal((await request('/tv')).status,200);
  assert.equal((await request('/tv/ativar')).status,200);
  assert.equal((await request('/api/tv/pair',{method:'POST',headers:{Origin:'https://attacker.invalid'}})).status,403);
  const pair = await request('/api/tv/pair',{method:'POST'});
  assert.equal(pair.status,201,JSON.stringify(pair.json));
  assert.match(pair.json.code,/^[A-F0-9]{10}$/);
  const pairCookie = pair.headers.getSetCookie().find(value=>value.startsWith('mordome_tv_pair=')).split(';')[0];
  const pending = await request('/api/tv/pair',{cookie:pairCookie});
  assert.deepEqual(pending.json,{pending:true});
  assert.equal((await request('/api/tv/pair')).status,401);
  assert.equal((await request('/api/tv/pair',{cookie:`mordome_tv_pair=${pair.json.code}`})).status,401);
  const pairBody = {code:pair.json.code,name:'QR Test'};
  const approveUrl = '/api/admin/tv/pair?establishmentId=unit-a1';
  assert.equal((await request(approveUrl,{body:pairBody})).status,401);
  assert.equal((await request(approveUrl,{cookie:viewer,body:pairBody})).status,403);
  assert.equal((await request(approveUrl,{cookie:b,body:pairBody})).status,404);
  assert.equal((await request(approveUrl,{cookie:a,body:pairBody,headers:{Origin:'https://attacker.invalid'}})).status,403);
  const approvals = await Promise.all([request(approveUrl,{cookie:a,body:pairBody}),request(approveUrl,{cookie:a,body:pairBody})]);
  assert.equal(approvals.filter(result=>result.status===201).length,1);
  assert.ok(approvals.some(result=>[409,410].includes(result.status)));
  const activated = await request('/api/tv/pair',{cookie:pairCookie});
  assert.equal(activated.status,200,JSON.stringify(activated.json));
  const qrId=activated.json.displayId;
  const qrCookies=activated.headers.getSetCookie();
  const qrCookie=qrCookies.find(value=>value.startsWith(`mordome_tv_${qrId}=`)).split(';')[0];
  const remembered=qrCookies.find(value=>value.startsWith('mordome_tv_screen=')).split(';')[0];
  assert.equal((await request('/tv',{cookie:remembered})).headers.get('location'),`/tv/${qrId}`);
  assert.equal((await request('/tv?setup=1',{cookie:remembered})).status,200);
  assert.equal((await request(`/api/tv/${qrId}/playlist`,{cookie:qrCookie})).json.establishment.id,'unit-a1');
  assert.equal((await request(`/api/tv/${qrId}/playlist`,{cookie:pairCookie})).status,401);
  assert.equal((await request('/api/admin/tv/displays?establishmentId=unit-a1',{cookie:a,method:'DELETE',body:{id:qrId}})).status,200);
  assert.equal((await request(`/api/tv/${qrId}/playlist`,{cookie:qrCookie})).status,401);
  assert.equal((await request('/api/tv/pair',{cookie:pairCookie})).status,401);
  const expiring=await request('/api/tv/pair',{method:'POST'});
  const expiredCookie=expiring.headers.getSetCookie().find(value=>value.startsWith('mordome_tv_pair=')).split(';')[0];
  await sql.query('UPDATE "TvPairing" SET "expiresAt"=$1 WHERE "codeHash"=$2',[new Date(Date.now()-1000),createHash('sha256').update(expiring.json.code).digest('hex')]);
  assert.equal((await request('/api/tv/pair',{cookie:expiredCookie})).status,410);
  assert.equal((await request(approveUrl,{cookie:a,body:{...pairBody,code:expiring.json.code}})).status,410);
  pass('QR pairing: login, permissions, isolation, CSRF, atomic approval, device-only cookie, remembered screen, expiry and revocation');

  assert.equal((await request('/api/admin/tv/cast?establishmentId=unit-a1')).status,401);
  assert.equal((await request('/api/admin/tv/cast?establishmentId=unit-a1',{cookie:viewer})).status,403);
  assert.equal((await request('/api/admin/tv/cast?establishmentId=unit-b1',{cookie:a})).status,404);
  assert.equal((await request('/api/admin/tv/cast?establishmentId=unit-a2',{cookie:restricted})).status,404);
  const castConfig = await request('/api/admin/tv/cast?establishmentId=unit-a1',{cookie:a});
  assert.equal(castConfig.status,200);
  assert.deepEqual(castConfig.json,{applicationId:'AB12EF34'});
  pass('Cast configuration respects administrative permission and unit access');

  const changed = await request('/api/admin/tv?establishmentId=unit-a1', {cookie:a,method:'PATCH',body:{brandName:'Store A TV',slogan:'Real test',imageDuration:5,fit:'contain',source:'all',muted:true}});
  assert.equal(changed.status,200,JSON.stringify(changed.json));
  const badOrigin = await request('/api/admin/tv?establishmentId=unit-a1', {cookie:a,method:'PATCH',body:{slogan:'BAD'},headers:{Origin:'https://attacker.invalid','Sec-Fetch-Site':'cross-site'}});
  assert.equal(badOrigin.status,403);
  const stateA = await request('/api/admin/tv?establishmentId=unit-a1', {cookie:a});
  const stateB = await request('/api/admin/tv?establishmentId=unit-b1', {cookie:b});
  assert.equal(stateA.json.branding.name,'Store A TV');
  assert.notEqual(stateB.json.branding.name,'Store A TV');
  pass('settings isolated per unit and cross-origin mutation rejected');

  const display = await request('/api/admin/tv/displays?establishmentId=unit-a1', {cookie:a,body:{name:'TV Local Test'}});
  assert.equal(display.status,201,JSON.stringify(display.json));
  const displayId = display.json.id;
  const token = new URLSearchParams(display.json.urlPath.split('#')[1]).get('token');
  assert.ok(token && token.length >= 40);
  const storedDisplay = (await sql.query('SELECT * FROM "TvDisplay" WHERE id=$1',[displayId])).rows[0];
  assert.equal(storedDisplay.tokenHash,createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(storedDisplay).includes(token));
  const wrong = await request(`/api/tv/${displayId}/session`, {body:{token:randomBytes(32).toString('base64url')}});
  assert.equal(wrong.status,401);
  const paired = await request(`/api/tv/${displayId}/session`, {body:{token}});
  assert.equal(paired.status,200,JSON.stringify(paired.json));
  const setCookie = paired.headers.get('set-cookie');
  assert.match(setCookie,/HttpOnly/i); assert.match(setCookie,/SameSite=Strict/i); assert.ok(setCookie.includes(`Path=/api/tv/${displayId}`));
  const deviceCookie = setCookie.split(';')[0];
  const dedicated = await request(`/api/tv/${displayId}/playlist`, {cookie:deviceCookie});
  assert.equal(dedicated.status,200,JSON.stringify(dedicated.json));
  assert.equal(dedicated.json.establishment.id,'unit-a1');
  assert.equal(dedicated.json.displays,undefined);
  assert.ok(!JSON.stringify(dedicated.json).includes(token));
  const displayB=await request('/api/admin/tv/displays?establishmentId=unit-b1',{cookie:b,body:{name:'TV Other Organization'}});
  assert.equal(displayB.status,201);
  assert.equal((await request(`/api/tv/${displayB.json.id}/playlist`,{cookie:deviceCookie})).status,401);
  pass('dedicated TV token hashed, cookie scoped/HttpOnly/SameSite, safe read-only DTO');

  const switched = await request('/api/auth/establishment',{cookie:a,body:{establishmentId:'unit-a2'}});
  assert.equal(switched.status,200,JSON.stringify(switched.json));
  assert.equal((await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a})).json.establishment.id,'unit-a1');
  assert.equal((await request(`/api/tv/${displayId}/playlist`,{cookie:deviceCookie})).json.establishment.id,'unit-a1');
  pass('TV stays on its fixed unit after another tab changes active establishment');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4mQAAAAASUVORK5CYII=', 'base64');
  const uploaded = await request('/api/admin/tv/uploads?establishmentId=unit-a1', {cookie:a,method:'POST',raw:png,headers:{'Content-Type':'image/png','X-File-Name':encodeURIComponent('test-image.png'),'X-File-Size':String(png.length)}});
  assert.equal(uploaded.status,201,JSON.stringify(uploaded.json));
  const afterUpload = await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  const item = afterUpload.json.items.find(item=>item.source==='upload');
  assert.ok(item);
  const full = await request(item.url,{cookie:a});
  assert.equal(full.status,200,JSON.stringify(full.json)); assert.deepEqual(full.bytes,png);
  const ranged = await request(item.url,{cookie:a,headers:{Range:'bytes=8-15'}});
  assert.equal(ranged.status,206); assert.equal(ranged.headers.get('content-range'),`bytes 8-15/${png.length}`); assert.deepEqual(ranged.bytes,png.subarray(8,16));
  const suffix = await request(item.url,{cookie:a,headers:{Range:'bytes=-6'}});
  assert.equal(suffix.status,206); assert.deepEqual(suffix.bytes,png.subarray(png.length-6));
  assert.equal((await request(item.url,{cookie:a,headers:{Range:'bytes=999999-'}})).status,416);
  assert.equal((await request(item.url,{cookie:a,method:'HEAD'})).bytes.length,0);
  assert.equal((await request(item.url)).status,401);
  assert.equal((await request(item.url,{cookie:b})).status,404);
  const otherUnitUrl = item.url.replace('unit-a1','unit-a2');
  assert.equal((await request(otherUnitUrl,{cookie:a})).status,404);
  const displayMedia = `/api/tv/${displayId}/media/${item.id}`;
  assert.deepEqual((await request(displayMedia,{cookie:deviceCookie})).bytes,png);
  pass('durable upload path, binary integrity, HEAD/206/suffix/416 and media isolation');

  const invalid = await request('/api/admin/tv/uploads?establishmentId=unit-a1',{cookie:a,method:'POST',raw:Buffer.from('not a png'),headers:{'Content-Type':'image/png','X-File-Name':'fake.png','X-File-Size':'9'}});
  assert.equal(invalid.status,415);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM "TvMedia" WHERE "establishmentId"=$1',['unit-a1'])).rows[0].count,1);
  pass('invalid media rejected without metadata or object residue');

  const disabled = await request('/api/admin/tv/items?establishmentId=unit-a1',{cookie:a,method:'PATCH',body:{id:item.id,enabled:false}});
  assert.equal(disabled.status,200,JSON.stringify(disabled.json));
  const displayAfterDisable = await request(`/api/tv/${displayId}/playlist`,{cookie:deviceCookie});
  assert.equal(displayAfterDisable.json.items.some(x=>x.id===item.id && x.enabled),false);
  assert.equal((await request('/api/admin/tv/items?establishmentId=unit-a2',{cookie:a,method:'DELETE',body:{id:item.id}})).status,404);
  const deleted = await request('/api/admin/tv/items?establishmentId=unit-a1',{cookie:a,method:'DELETE',body:{id:item.id}});
  assert.equal(deleted.status,200,JSON.stringify(deleted.json));
  assert.equal(objects.size,0);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM "TvMedia" WHERE id=$1',[item.id])).rows[0].count,0);
  pass('item visibility and deletion scoped to its unit with object cleanup');

  for(let index=0;index<99;index++) {
    await sql.query('INSERT INTO "TvMedia" (id,"establishmentId","objectKey",name,"mimeType",size,ready) VALUES ($1,$2,$1,$1,$3,$4,true)',[`quota-${index}`,'unit-a2','image/png',png.length]);
  }
  const quotaResults=await Promise.all(Array.from({length:2},()=>request('/api/admin/tv/uploads?establishmentId=unit-a2',{cookie:a,method:'POST',raw:png,headers:{'Content-Type':'image/png','X-File-Name':'concurrent.png','X-File-Size':String(png.length)}})));
  assert.deepEqual(quotaResults.map(result=>result.status).sort(),[201,413]);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM "TvMedia" WHERE "establishmentId"=$1',['unit-a2'])).rows[0].count,100);
  const acceptedId=quotaResults.find(result=>result.status===201).json.item.id;
  assert.equal((await request('/api/admin/tv/items?establishmentId=unit-a2',{cookie:a,method:'DELETE',body:{id:acceptedId}})).status,200);
  assert.equal(objects.size,0);
  pass('concurrent uploads cannot exceed the per-store file quota');

  const firstToken='TV_TEST_A_WITH_AT_LEAST_20_CHARACTERS';
  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'ok'}));
  await writeFile(path.join(scratch,'graph-requests.jsonl'),'');
  const connected=await request('/api/admin/tv/instagram?establishmentId=unit-a1',{cookie:a,body:{accessMode:'unified',accessToken:firstToken}});
  assert.equal(connected.status,200,JSON.stringify(connected.json));
  const connection=(await sql.query('SELECT * FROM "TvConfig" WHERE "establishmentId"=$1',['unit-a1'])).rows[0];
  assert.ok(connection.instagramEncryptedToken);
  assert.ok(!JSON.stringify(connection).includes(firstToken));
  const instagramState=await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  assert.equal(instagramState.json.instagram.connected,true);
  assert.equal(instagramState.json.items.filter(item=>item.source==='instagram').length,2);
  assert.ok(!JSON.stringify(instagramState.json).includes(connection.instagramEncryptedToken));
  assert.ok(!JSON.stringify(instagramState.json).includes(firstToken));
  const graphRequests=(await readFile(path.join(scratch,'graph-requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(graphRequests.map(row=>row.pathname),['me/assigned_instagram_accounts','11111','11111/stories']);
  assert.ok(graphRequests.every(row=>row.hasBearer && !row.tokenInQuery && row.redirect==='error'));
  pass('mocked Meta discovery/profile/stories before encrypted save; expired and unsafe URLs filtered');

  const ambiguous=await request('/api/admin/tv/instagram?establishmentId=unit-a2',{cookie:a,body:{accessMode:'unified',accessToken:'TV_TEST_MULTI_WITH_AT_LEAST_20_CHARACTERS'}});
  assert.equal(ambiguous.status,409,JSON.stringify(ambiguous.json));
  assert.equal(ambiguous.json.accounts.length,2);
  assert.equal((await sql.query('SELECT "instagramEncryptedToken" FROM "TvConfig" WHERE "establishmentId"=$1',['unit-a2'])).rows[0]?.instagramEncryptedToken ?? null,null);
  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'fail'}));
  const deniedStories=await request('/api/admin/tv/instagram?establishmentId=unit-a2',{cookie:a,body:{accessMode:'unified',accessToken:firstToken,accountId:'11111'}});
  assert.equal(deniedStories.status,401,JSON.stringify(deniedStories.json));
  assert.ok(!JSON.stringify(deniedStories.json).includes('DO_NOT_LEAK'));
  assert.equal((await sql.query('SELECT "instagramEncryptedToken" FROM "TvConfig" WHERE "establishmentId"=$1',['unit-a2'])).rows[0]?.instagramEncryptedToken ?? null,null);
  pass('multiple account discovery and failed Stories authorization do not save a connection');

  await sql.query('UPDATE "TvConfig" SET "instagramLastAttemptAt"=NULL,"instagramRefreshLeaseUntil"=NULL WHERE "establishmentId"=$1',['unit-a1']);
  const failedRefresh=await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  assert.equal(failedRefresh.status,200);
  assert.ok(failedRefresh.json.instagram.error);
  assert.ok(!JSON.stringify(failedRefresh.json).includes('DO_NOT_LEAK'));
  assert.equal(failedRefresh.json.items.filter(item=>item.source==='instagram').length,2);
  await writeFile(path.join(scratch,'graph-requests.jsonl'),'');
  await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  assert.equal((await readFile(path.join(scratch,'graph-requests.jsonl'),'utf8')).trim(),'');
  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'slow'}));
  assert.equal((await request('/api/admin/tv/instagram?establishmentId=unit-a1',{cookie:a,body:{accessMode:'unified',accessToken:firstToken}})).status,200);
  await writeFile(path.join(scratch,'graph-requests.jsonl'),'');
  await sql.query('UPDATE "TvConfig" SET "instagramLastAttemptAt"=NULL,"instagramRefreshLeaseUntil"=NULL WHERE "establishmentId"=$1',['unit-a1']);
  const refreshed=await Promise.all(Array.from({length:5},()=>request('/api/admin/tv?establishmentId=unit-a1',{cookie:a})));
  assert.ok(refreshed.every(result=>result.status===200));
  const refreshRequests=(await readFile(path.join(scratch,'graph-requests.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.equal(refreshRequests.filter(row=>row.pathname==='11111/stories').length,1);
  pass('upstream errors preserve active cache and concurrent refresh takes only one lease');

  const disconnected=await request('/api/admin/tv/instagram?establishmentId=unit-a1',{cookie:a,method:'DELETE'});
  assert.equal(disconnected.status,200);
  const afterDisconnect=await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  assert.equal(afterDisconnect.json.instagram.connected,false);
  assert.equal(afterDisconnect.json.items.filter(item=>item.source==='instagram').length,0);
  pass('Instagram disconnect clears its connection and cached Stories');

  const authorize='/api/admin/tv/instagram/authorize?establishmentId=unit-a1';
  const confirmation='/api/admin/tv/instagram/confirmation?establishmentId=unit-a1';
  assert.equal((await request(authorize,{method:'POST'})).status,401);
  assert.equal((await request(authorize,{cookie:viewer,method:'POST'})).status,403);
  assert.equal((await request(authorize,{cookie:b,method:'POST'})).status,404);
  assert.equal((await request(authorize,{cookie:a,method:'POST',headers:{Origin:'https://attacker.invalid'}})).status,403);
  async function startOAuth() {
    const started=await request(authorize,{cookie:a,method:'POST'});
    assert.equal(started.status,200,JSON.stringify(started.json));
    const url=new URL(started.json.authorizationUrl);
    assert.equal(url.origin,'https://www.facebook.com');
    assert.equal(url.searchParams.get('config_id'),'987654321');
    assert.equal(url.searchParams.get('redirect_uri'),origin+'/api/integrations/instagram/callback');
    assert.equal(url.searchParams.get('response_type'),'code');
    assert.equal(url.searchParams.get('override_default_response_type'),'true');
    assert.ok(!url.toString().includes(env.META_APP_SECRET));
    return url.searchParams.get('state');
  }
  const firstState=await startOAuth();
  const stateHash=createHash('sha256').update(firstState).digest('hex');
  const grant=(await sql.query('SELECT * FROM "TvInstagramAuthorization" WHERE "stateHash"=$1',[stateHash])).rows[0];
  assert.ok(grant); assert.ok(!JSON.stringify(grant).includes(firstState));
  const cb=state=>'/api/integrations/instagram/callback?state='+state+'&code=OAUTH_TEST_CODE';
  const aOtherSession=await login('user-a');
  const wrongSession=await request(cb(firstState),{cookie:aOtherSession});
  assert.match(wrongSession.headers.get('location'),/result=failed/);
  assert.equal((await request(confirmation,{cookie:a})).json.accounts.length,0);
  const callback=await request(cb(firstState),{cookie:a});
  assert.equal(callback.status,303);
  assert.match(callback.headers.get('location'),/result=choose/);
  assert.equal(callback.headers.get('referrer-policy'),'no-referrer');
  assert.ok(!callback.headers.get('location').includes(firstState));
  const accounts=await request(confirmation,{cookie:a});
  assert.equal(accounts.json.accounts.length,2);
  assert.ok(!JSON.stringify(accounts.json).includes('SECRET'));
  assert.equal((await request(confirmation,{cookie:aOtherSession})).json.accounts.length,0);
  assert.match((await request(cb(firstState),{cookie:a})).headers.get('location'),/result=failed/);
  assert.equal((await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a})).json.instagram.connected,false);
  assert.equal((await request(confirmation,{cookie:a,body:{accountId:'99999'}})).status,410);
  const saveAccounts=await Promise.all([request(confirmation,{cookie:a,body:{accountId:'11111'}}),request(confirmation,{cookie:a,body:{accountId:'11111'}})]);
  assert.equal(saveAccounts.filter(row=>row.status===200).length,1);
  const oauthSaved=(await sql.query('SELECT * FROM "TvConfig" WHERE "establishmentId"=$1',['unit-a1'])).rows[0];
  assert.equal(oauthSaved.instagramClientBusinessId,'44444');
  assert.equal(oauthSaved.instagramSystemUserId,'55555');
  assert.ok(oauthSaved.instagramTokenExpiresAt);
  assert.ok(!JSON.stringify(oauthSaved).includes('OAUTH_MULTI_TEST_SECRET'));
  assert.equal((await request(confirmation,{cookie:a})).json.accounts.length,0);
  pass('OAuth: secure code flow, session binding, CSRF, explicit account choice, replay and concurrent confirmation, encrypted persistence');

  const superseded=await startOAuth();
  const cancelled=await startOAuth();
  assert.match((await request(cb(superseded),{cookie:a})).headers.get('location'),/result=failed/);
  assert.match((await request('/api/integrations/instagram/callback?state='+cancelled+'&error=access_denied',{cookie:a})).headers.get('location'),/result=cancelled/);
  assert.equal((await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a})).json.instagram.username,'test_store');
  const expired=await startOAuth();
  await sql.query('UPDATE "TvInstagramAuthorization" SET "expiresAt"=$1 WHERE "establishmentId"=$2',[new Date(Date.now()-1000),'unit-a1']);
  assert.match((await request(cb(expired),{cookie:a})).headers.get('location'),/result=failed/);
  const revoked=await startOAuth();
  await sql.query('UPDATE "Establishment" SET active=false WHERE id=$1',['unit-a1']);
  assert.match((await request(cb(revoked),{cookie:a})).headers.get('location'),/result=failed/);
  await sql.query('UPDATE "Establishment" SET active=true WHERE id=$1',['unit-a1']);
  const badCode=await startOAuth();
  const denied=await request(cb(badCode).replace('OAUTH_TEST_CODE','DENIED_CODE'),{cookie:a});
  assert.match(denied.headers.get('location'),/result=failed/);
  assert.ok(!denied.bytes.toString().includes('DO_NOT_LEAK'));
  pass('OAuth cancellation, superseded/expired attempts, revoked unit and provider failures preserve existing connection');

  for (const mode of ['empty-accounts','business-denied']) {
    await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode}));
    const attempt=await startOAuth();
    assert.match((await request(cb(attempt),{cookie:a})).headers.get('location'),/result=failed/);
    assert.deepEqual((await request(confirmation,{cookie:a})).json.accounts,[]);
    assert.equal((await request(confirmation,{cookie:a,body:{accountId:'11111'}})).status,410);
  }
  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'business-accounts'}));
  const businessState=await startOAuth();
  assert.match((await request(cb(businessState),{cookie:a})).headers.get('location'),/result=choose/);
  assert.deepEqual((await request(confirmation,{cookie:a})).json.accounts,[{id:'11111',username:'test_store'}]);
  assert.deepEqual((await request(confirmation,{cookie:aOtherSession})).json.accounts,[]);
  assert.equal((await request(confirmation,{cookie:aOtherSession,body:{accountId:'11111'}})).status,410);
  assert.equal((await request(confirmation,{cookie:a,body:{accountId:'99999'}})).status,410);
  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'fail'}));
  assert.notEqual((await request(confirmation,{cookie:a,body:{accountId:'11111'}})).status,200);
  assert.equal((await sql.query('SELECT "instagramUsername" FROM "TvConfig" WHERE "establishmentId"=$1',['unit-a1'])).rows[0].instagramUsername,'test_store');
  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'ok'}));
  assert.equal((await request(confirmation,{cookie:a,body:{accountId:'11111'}})).status,200);
  assert.equal((await request(confirmation,{cookie:a,body:{accountId:'11111'}})).status,410);
  pass('OAuth portfolio discovery rejects missing permissions, empty lists and arbitrary IDs; checks Stories, session binding and replay');

  await writeFile(path.join(scratch,'graph-scenario.json'),JSON.stringify({mode:'ok'}));
  await writeFile(path.join(scratch,'graph-requests.jsonl'),'');
  await sql.query('UPDATE "TvConfig" SET "instagramTokenExpiresAt"=$1,"instagramLastAttemptAt"=NULL WHERE "establishmentId"=$2',[new Date(Date.now()+86400_000),'unit-a1']);
  const renewedState=await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  assert.equal(renewedState.json.instagram.error,null);
  const renewedConfig=(await sql.query('SELECT * FROM "TvConfig" WHERE "establishmentId"=$1',['unit-a1'])).rows[0];
  assert.ok(renewedConfig.instagramTokenExpiresAt.getTime()>Date.now()+50*86400_000);
  assert.notEqual(renewedConfig.instagramEncryptedToken,oauthSaved.instagramEncryptedToken);
  const renewCalls=(await readFile(path.join(scratch,'graph-requests.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(renewCalls.filter(row=>row.pathname==='44444/system_user_access_tokens').length,1);
  assert.ok(renewCalls.every(row=>!row.tokenInQuery));
  await sql.query('UPDATE "TvConfig" SET "instagramTokenExpiresAt"=$1,"instagramLastAttemptAt"=NULL WHERE "establishmentId"=$2',[new Date(Date.now()-1000),'unit-a1']);
  await writeFile(path.join(scratch,'graph-requests.jsonl'),'');
  const expiredState=await request('/api/admin/tv?establishmentId=unit-a1',{cookie:a});
  assert.match(expiredState.json.instagram.error,/expirou/);
  assert.equal((await readFile(path.join(scratch,'graph-requests.jsonl'),'utf8')).trim(),'');
  const abandoned=await startOAuth();
  await request('/api/admin/tv/instagram?establishmentId=unit-a1',{cookie:a,method:'DELETE'});
  assert.match((await request(cb(abandoned),{cookie:a})).headers.get('location'),/result=failed/);
  pass('OAuth token renewal, expiry without retries and disconnect invalidating pending authorization');

  await sql.query('UPDATE "Establishment" SET active=false WHERE id=$1',['unit-a1']);
  assert.equal((await request(`/api/tv/${displayId}/playlist`,{cookie:deviceCookie})).status,401);
  await sql.query('UPDATE "Establishment" SET active=true WHERE id=$1',['unit-a1']);
  await sql.query('UPDATE "Organization" SET active=false WHERE id=$1',['org-a']);
  assert.equal((await request(`/api/tv/${displayId}/playlist`,{cookie:deviceCookie})).status,401);
  await sql.query('UPDATE "Organization" SET active=true WHERE id=$1',['org-a']);
  assert.equal((await request(`/api/tv/${displayId}/playlist`,{cookie:deviceCookie})).status,200);
  pass('inactive stores and organizations immediately invalidate display access');

  assert.equal((await request('/api/admin/tv/displays?establishmentId=unit-a2',{cookie:a,method:'DELETE',body:{id:displayId}})).status,404);
  assert.equal((await request('/api/admin/tv/displays?establishmentId=unit-a1',{cookie:a,method:'DELETE',body:{id:displayId}})).status,200);
  assert.equal((await request(`/api/tv/${displayId}/playlist`,{cookie:deviceCookie})).status,401);
  assert.equal((await request(`/api/tv/${displayId}/session`,{body:{token}})).status,401);
  assert.equal((await request(displayMedia,{cookie:deviceCookie})).status,401);
  pass('revocation immediately blocks playlist, media and pairing with previous token');
}

try {
  await mkdir(scratch,{recursive:true});
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase('mordome_tv_test');
  const migrationOutput = await run([path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy']);
  await writeFile(path.join(scratch,'migration-output.txt'),migrationOutput);
  pass('all real PostgreSQL migrations applied to an isolated database');
  await run([path.join(root,'node_modules/prisma/build/index.js'),'generate']);
  sql = new pg.Client({connectionString:databaseUrl}); await sql.connect(); await seed();
  pass('test fixtures created for two organizations and three stores');
  if (!process.argv.includes('--setup-only')) {
    await new Promise(resolve=>s3.listen(storagePort,'127.0.0.1',resolve));
    next = spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(appPort)], {cwd:root,env,stdio:['ignore','pipe','pipe']});
    next.stdout.on('data',chunk=>{nextLog+=chunk;}); next.stderr.on('data',chunk=>{nextLog+=chunk;});
    let ready = false;
    for (let n=0;n<120;n++) {
      if (next.exitCode !== null) throw Error(`Next exited: ${nextLog.slice(-5000)}`);
      try { if ((await fetch(origin+'/api/health')).ok) {ready=true;break;} } catch {}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert.ok(ready,`Next server did not become ready: ${nextLog.slice(-5000)}`);
    await verifyApi();

  }
  console.log(JSON.stringify({success:true,checks},null,2));
  await writeFile(path.join(scratch,'result.json'),JSON.stringify({success:true,checks},null,2));
} catch(error) {
  console.error(error);
  console.error(`Logs locais do teste: ${scratch}`);
  if (!checks.length) console.error(postgresLog.slice(-5000));
  await writeFile(path.join(scratch,'result.json'),JSON.stringify({success:false,checks,error:String(error)},null,2));
  process.exitCode=1;
} finally {
  if (next) { next.kill('SIGTERM'); await new Promise(resolve=>setTimeout(resolve,500)); }
  await writeFile(path.join(scratch,'next-output.txt'),nextLog);
  s3.closeAllConnections(); s3.close();
  if(sql) await sql.end();
  if (postgres.process && postgres.process.exitCode === null) await postgres.stop().catch(()=>{});
}

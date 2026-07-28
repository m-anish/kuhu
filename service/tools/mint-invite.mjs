// Mint an invite link from the command line.
//
//   node tools/mint-invite.mjs --site-admin            # remote, site admin, 48h
//   node tools/mint-invite.mjs --service-admin --team 901
//   node tools/mint-invite.mjs --local --team 1        # against local dev
//   node tools/mint-invite.mjs --hours 168 --note Ramesh
//
// This is the bootstrap: the first admin cannot be invited from inside the app,
// because there is nobody to invite them. Afterwards, admins invite everyone
// else from the Admin section of /post and this script is not needed.
//
// Only the hash goes into the database. The link is printed once, here.

import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const role = has('--site-admin') ? 'site_admin'
           : has('--service-admin') ? 'service_admin'
           : has('--admin') ? 'site_admin'          // legacy spelling
           : 'poster';
const local = has('--local');
const hours = parseInt(val('--hours', '48'), 10);
// Site admins land on the global root (900); service admins on a service
// root (901 = electricity); posters on a crew (1).
const defaultTeam = role === 'site_admin' ? '900' : role === 'service_admin' ? '901' : '1';
const team = val('--team', defaultTeam);
const note = val('--note', null);
const origin = val('--origin', local ? 'http://localhost:8788' : 'https://kuhuapp.starstucklab.com');

const raw = crypto.getRandomValues(new Uint8Array(24));
const token = Buffer.from(raw).toString('base64url');
const hash = Buffer.from(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
).toString('hex');

const sql = `INSERT INTO invites (token_hash, team_id, service_id, role, note, expires_at)
VALUES ('${hash}', ${Number(team)}, (SELECT service_id FROM teams WHERE id = ${Number(team)}), '${role}', ${note ? `'${note.replace(/'/g, "''")}'` : 'NULL'}, datetime('now', '+${hours} hours'));`;

execFileSync('npx', [
  'wrangler', 'd1', 'execute', 'kuhu',
  local ? '--local' : '--remote',
  '--command', sql,
], { stdio: 'inherit' });

console.log(`\n  role     ${role}`);
console.log(`  expires  in ${hours}h`);
console.log(`  link     ${origin}/join#t=${token}\n`);
console.log('  Send it, once. It dies on use.\n');

# service/

The kuhu service: a Cloudflare Worker, a D1 database, and one PWA with two
faces. No framework, no build step — the app is plain HTML, CSS, and ES
modules, served straight off the Worker's asset binding.

Live: **https://kuhu-app.anishmg.workers.dev**

## The two faces

| Path | Who | What |
|---|---|---|
| `/` | Households | Pick areas, allow notifications, see what's coming. |
| `/post` | The team | Join once with an invite code, then post notices. |

## How a poster joins

Invite code, not OTP. The team gets a code; a lineman enters it once on their
phone with their name, and the server returns a bearer token that lives in
`localStorage` from then on. Only the token's SHA-256 hash is stored — the
database never holds anything that could be replayed, and rotating a team's
access is one `UPDATE teams SET invite_code`. No SMS, no DLT paperwork, no
per-message cost.

## How push works

Payloadless. The server sends a VAPID-signed POST with **no body** to each
subscription endpoint; the service worker wakes, calls
`POST /api/subscriptions/pending` for its own endpoint, and renders exactly one
notification (`tag` = notice id, so a notice can never stack up). That avoids
implementing RFC 8291 payload encryption, and means notice text never sits
inside a third-party push service.

## API

Public, cacheable, CORS-open:

```
GET  /api/regions                     every region
GET  /api/regions/{slug}/next-cuts    upcoming notices for one region
GET  /api/vapid-key                   push public key
```

Poster, `Authorization: Bearer <token>`:

```
POST /api/auth/claim                  {code, name} → {token, team, regions}
POST /api/notices                     {region, kind, from, to, reason_en, reason_hi}
POST /api/notices/{id}/cancel
GET  /api/team/regions                what this poster may post to
GET  /api/team/notices                the team's recent notices
```

Subscriber:

```
POST   /api/subscriptions             {endpoint, keys, regions[], lang}
DELETE /api/subscriptions             {endpoint}
POST   /api/subscriptions/pending     {endpoint} → what to show
```

A gadget that wants to know about power cuts polls `next-cuts` and needs
nothing else — no key, no account. MQTT publishing is not built yet; it is the
next thing.

## Running it

```bash
npm install
npm run db:local && npm run db:seed:local
VAPID_PRIVATE_JWK="$(cat your-key.jwk)" npx wrangler dev
```

Local dev seeds three wards and the invite code `KUHU-CHANGE-ME`.

## Deploying it

```bash
npm run vapid                     # generate a keypair, once
# → public key into wrangler.toml [vars]
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler d1 create kuhu       # → database_id into wrangler.toml
npm run db:remote && npm run db:seed:remote
npx wrangler deploy
```

**Change the invite code before anyone real uses it** — `seed.sql` ships an
obvious placeholder on purpose:

```bash
npx wrangler d1 execute kuhu --remote --command "UPDATE teams SET invite_code='YOUR-CODE' WHERE id=1;"
```

Rotating the VAPID keypair invalidates every existing push subscription and
every subscriber has to tap "Notify me" again. Generate once; leave it alone.

## Regions and teams

Regions are the first-class object: a notice belongs to a region, a
subscription is a set of regions. Teams are scoped to regions and nest via
`teams.parent_id` — a parent team may post to every region in its subtree, a
child only to its own. Both are enforced by a recursive CTE in `teamRegions()`
and verified in practice. Today there is one team and three wards; growing to
a district with area crews under it is inserts, not a migration.

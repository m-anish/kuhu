# service/

The kuhu service: a Cloudflare Worker, a D1 database, and one PWA with two
faces. No framework, no build step — the app is plain HTML, CSS, and ES
modules, served straight off the Worker's asset binding.

Live: **https://kuhuapp.starstucklab.com**

## The two faces

| Path | Who | What |
|---|---|---|
| `/` | Households | Pick areas, allow notifications, see what's coming. |
| `/post` | The team | Post notices; admins also manage people and areas. |
| `/join` | Anyone invited | Where an invite link lands. Used once, then dead. |

## How a poster joins

**A link, sent on WhatsApp, that dies when used.** An admin mints an invite from
the Admin section of `/post`, picks the role the person will have, and shares it
— the app opens WhatsApp with the message prefilled. The recipient taps it,
sees which team is inviting them and as what, types their name, and is in. Their
role was decided by the admin before the link existed; there is nothing for them
to choose or get wrong.

An invite dies on **first use**, and separately on expiry (24h / 2 days / 7 days,
admin's choice), and can be cancelled before either. The token rides in the URL
**fragment** (`/join#t=…`), so it never reaches the server in a request line and
never lands in a log or a `Referer` header — the page reads it client-side and
POSTs it. A `?t=` query is accepted as a fallback for in-app browsers that
rewrite links.

Only SHA-256 hashes are stored, for both invites and the resulting poster
tokens. The database holds nothing replayable.

## Roles

| Role | Can |
|---|---|
| `poster` | Post and cancel notices for the team's areas. |
| `admin` | Everything a poster can, plus: mint and cancel invite links, see and remove team members, add areas, rename areas. |

Two invariants are enforced server-side, not just hidden in the UI: an admin
**cannot revoke themselves**, and the **last remaining admin cannot be
removed**. Between them a team can't lock itself out.

Removing someone sets `revoked_at` rather than deleting the row — their token
stops working on the next request, while "who posted this notice" survives.

## The first admin

There is nobody to invite the first admin, so they are minted from the command
line:

```bash
node tools/mint-invite.mjs --admin --hours 168 --note "who it's for"
node tools/mint-invite.mjs --admin --local          # against local dev
```

It prints the link once. After that, admins invite everyone else from the app
and this script is not needed again.

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

Joining (public, but useless without a live invite token):

```
GET  /api/invites/preview?t=…         {valid, team, role} — what the link offers
POST /api/invites/redeem              {token, name, phone} → {token, team, role}
```

Poster, `Authorization: Bearer <token>`:

```
GET  /api/me                          {name, role, regions}
POST /api/notices                     {region, kind, from, to, reason_en, reason_hi}
POST /api/notices/{id}/cancel
GET  /api/team/regions                what this poster may post to
GET  /api/team/notices                the team's recent notices
```

Admin, same header, `role=admin` (everything below 403s for a plain poster):

```
POST /api/invites                     {role, hours, note} → {url, expires_at}
GET  /api/invites                     open / used / expired / revoked
POST /api/invites/{id}/revoke
GET  /api/team/members
POST /api/team/members/{id}/revoke
POST /api/regions                     {slug, name_en, name_hi}
POST /api/regions/{slug}/rename       {name_en, name_hi} — names only, never the slug
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

Local dev seeds three wards and no users; mint yourself in with
`node tools/mint-invite.mjs --admin --local`.

### Changing the app's files

The service worker caches the shell. It uses stale-while-revalidate so an
update always lands by the next load, but **bump `CACHE` in `app/sw.js`**
whenever you change a shell asset if you want the update to land immediately —
a fixed cache name with cache-first was how an earlier version managed to serve
its own stale JavaScript forever.

## Deploying it

```bash
npm run vapid                     # generate a keypair, once
# → public key into wrangler.toml [vars]
npx wrangler secret put VAPID_PRIVATE_JWK
npx wrangler d1 create kuhu       # → database_id into wrangler.toml
npm run db:remote && npm run db:seed:remote
npx wrangler deploy
```

Then mint the first admin (see above) and send them the link.

Rotating the VAPID keypair invalidates every existing push subscription and
every subscriber has to tap "Notify me" again. Generate once; leave it alone.

### The hostname

`kuhuapp.starstucklab.com` is attached by the `custom_domain` route in
`wrangler.toml`, which is also what makes Cloudflare issue a certificate for
it. Two things learned the hard way:

- **A hand-made CNAME to `kuhu-app.*.workers.dev` does not work.** It resolves,
  Cloudflare proxies it, finds no origin, and returns `522` — with no
  certificate, so HTTPS fails first. Custom domains are a Worker binding, not a
  DNS record you write yourself. If a manual record already occupies the name,
  the binding fails with `409 Conflict`; delete the record first.
- **Adding `routes` while `workers_dev` is unset disables the workers.dev
  URL.** Wrangler warns and moves on; the old URL starts 404ing. That's why
  `workers_dev = true` is pinned explicitly above.

One label deep is deliberate: free-plan Universal SSL covers
`*.starstucklab.com` but not `app.kuhu.starstucklab.com`. A second-level
subdomain would need Advanced Certificate Manager.

## Regions and teams

Regions are the first-class object: a notice belongs to a region, a
subscription is a set of regions. Teams are scoped to regions and nest via
`teams.parent_id` — a parent team may post to every region in its subtree, a
child only to its own. Both are enforced by a recursive CTE in `teamRegions()`
and verified in practice. Today there is one team and three wards; growing to
a district with area crews under it is inserts, not a migration.

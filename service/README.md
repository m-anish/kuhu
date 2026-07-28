# service/

The kuhu service: a Cloudflare Worker, a D1 database, and one PWA with two
faces. No framework, no build step — the app is plain HTML, CSS, and ES
modules, served straight off the Worker's asset binding.

Live: **https://kuhuapp.starstucklab.com**

## The two faces

| Path | Who | What |
|---|---|---|
| `/` | Households | Pick areas, allow notifications, see what's coming. |
| `/post` | A crew | Post notices; admins also manage people, coverage and areas. |
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

## One notice, several areas

An outage rarely respects a boundary, so areas are multi-select. Posting writes
**one row per area**, sharing a `batch_id` — every consumer downstream (the
public notices endpoint, subscriptions, push) still deals with one notice in one
area of one service. The batch exists so the app can show the four rows as the
one act they were, and so cancelling any of them cancels all of them.

Push is deduplicated across the whole batch: somebody who follows three of the
four affected areas is still one person, gets one buzz, and sees all three of
their area names in it. Spending the notification budget once is the entire
promise of the app, and a multi-area notice is the easiest way to break it.

## Moving to a new phone

A signed-in person can mint a 30-minute link for themselves (**Got a new
phone?** on `/post`) and open it on the new device. It re-issues their token —
same person, same role, same history — and the old phone is signed out the
instant it's used. No admin errand, and nothing to recover, because there was
never a password.

Losing a phone entirely is still the admin's job: remove the person (which kills
the token immediately) and send them a fresh invite.

## Where a notice goes

Posting or cancelling fans out to three places at once, each swallowing its own
failures — a sulking broker or a revoked bot token must never fail the notice,
because the notice is the thing that matters:

| Channel | Who it's for | State |
|---|---|---|
| **Web push** | People with the app | Always on |
| **Telegram** | People who won't enable push | Optional; off until configured |
| **MQTT** (retained) | Machines | Optional; off until configured |

**Telegram**: create a bot with [@BotFather](https://t.me/BotFather), add it to
your channel as an admin, then set `TELEGRAM_CHAT_ID` in `wrangler.toml` and
`wrangler secret put TELEGRAM_BOT_TOKEN`. Messages are bilingual and carry the
same words the app shows, so there is only one version of the truth.

**MQTT**: set `MQTT_URL` (e.g. `mqtts://broker.example:8883`) plus
`MQTT_USERNAME` / `MQTT_PASSWORD` as secrets. Each affected area gets a
**retained** JSON payload on `kuhu/<service>/<area>/notices`, so a device that
boots at midday still learns about the afternoon's cut instead of waiting for
the next posting. The service sits in the path so a device can subscribe to
exactly what it cares about (`kuhu/electricity/+/notices`), and it says
"notices" rather than "cuts" because a cut is an electricity word. The client is ~60 lines of MQTT 3.1.1 over a raw Worker TCP socket —
CONNECT, CONNACK, PUBLISH, DISCONNECT, QoS 0. Packet encoding lives in
`src/mqtt-packets.js`, separate from the socket code so it can be tested
outside the Workers runtime:

```bash
node tools/mqtt-selftest.mjs        # encoder checks + a live broker handshake
```

The JSON API stays the canonical contract. MQTT is a courtesy for things that
would rather be told than asked.

## Roles

| Role | Can |
|---|---|
| `poster` | Post and cancel notices for their crew's areas, on their crew's service. |
| `service_admin` | That, plus: invite and remove people, add and rename their service's areas, and choose which areas a crew covers — all within their own service. |
| `site_admin` | That, plus: **creating services**, and reaching into every one of them. |

Scope and powers are separate ideas. **Powers** come from the role; **scope**
comes from where you sit in the team tree:

```
kuhu                        ← site admins      sees every service
  └── Electricity           ← service admins   sees one service
        └── Local line crew ← posters          sees their own areas
```

One recursive query answers "what may this person see?" at every level, so a
site admin is not a special case anywhere — they simply sit at the root. Three
invariants are enforced server-side, not merely hidden in the UI: nobody may
revoke themselves, nobody may grant or revoke authority above their own, and
the last site admin cannot be removed.

Removing someone sets `revoked_at` rather than deleting the row — their token
stops working on the next request, while "who posted this notice" survives.


## The first admin

There is nobody to invite the first admin, so they are minted from the command
line:

```bash
node tools/mint-invite.mjs --site-admin --hours 168 --note "who it's for"
node tools/mint-invite.mjs --site-admin --local            # against local dev
node tools/mint-invite.mjs --service-admin --team 901      # an electricity admin
node tools/mint-invite.mjs --team 1 --note "Ramesh"        # a poster on a crew
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

Public, cacheable, CORS-open. One discovery call, then one call per thing you
care about:

```
GET  /api/services                                  every enabled service, with its areas
GET  /api/services/{service}/areas/{area}/notices   what's coming
GET  /api/vapid-key                                 push public key
```

`/api/services` also carries each service's `kinds` and `reasons`, which is how
the app knows to say "power cut" for one service and "tanker coming" for
another without shipping either word.

Joining (public, useless without a live invite token):

```
GET  /api/invites/preview?t=…      {valid, team, role, service}
POST /api/invites/redeem           {token, name, phone} → {token, team, role}
```

Poster, `Authorization: Bearer <token>`:

```
GET  /api/me                       {name, role, team, services[], can{}}
POST /api/notices                  {service, regions[], kind, from, to, reason_en, reason_hi}
POST /api/notices/{id}/cancel      cancels the whole batch it belongs to
GET  /api/team/notices             recent notices across everything you reach
POST /api/me/move                  → a 30-minute link to move to another phone
```

Admin (`service_admin` within its service; `site_admin` everywhere):

```
POST /api/invites                  {role, hours, note, team}
GET  /api/invites                  open / used / expired / revoked
POST /api/invites/{id}/revoke
GET  /api/team/members
POST /api/team/members/{id}/revoke
GET  /api/areas                    every area that exists
POST /api/services/{service}/coverage   {area, on, team}  — what this crew answers for
```

Site admin only — geography is shared by every service, so only the top may
edit it:

```
POST /api/areas                    {slug, name_en, name_hi}
POST /api/areas/{slug}/rename      {name_en, name_hi}  — names only, never the slug
```

Subscriber:

```
POST   /api/subscriptions          {endpoint, keys, lang, topics:[{service, area}]}
DELETE /api/subscriptions          {endpoint}
POST   /api/subscriptions/pending  {endpoint} → what to show
```


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

## Services, geography and teams

**A service is a row.** `services` holds its slug, display names, icon, accent,
and — as JSON — the `kinds` of notice it can carry and its `reasons` presets.
Adding water is an `INSERT` plus a crew; no code changes and nothing deploys.
Nothing under `src/` mentions electricity.

```sql
INSERT INTO services (slug, name_en, name_hi, icon, accent, kinds, reasons, sort)
VALUES ('water', 'Water', 'पानी', '💧', '#6ba3c4',
  '[{"key":"supply_cut","en":"No supply","hi":"पानी नहीं आएगा"},
    {"key":"tanker","en":"Tanker coming","hi":"टैंकर आएगा"}]',
  '[{"en":"Pipeline repair","hi":"पाइपलाइन की मरम्मत"}]', 2);
```

Then give it a root team under `kuhu`, a crew under that, and some coverage.

**Geography is shared.** `regions` has no owner — Naddi is Naddi whether the
notice is about power or water. Which areas a crew answers for lives in
`team_regions`, so two services can cover the same village without arguing.

**Teams nest, and that tree is the hierarchy.** See Roles above. A crew's
reach is its own coverage plus every crew beneath it, which is why the same
query serves a lineman and a site admin.

**The slug is permanent**, for both services and areas: it appears in public
API URLs and in every subscriber's saved selection. Display names change
freely; slugs never do.

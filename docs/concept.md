# kuhu — product concept

*Written 2026-07-27 at project birth to encode decisions so later design work
doesn't re-litigate them. Season 1 built what's below; see `service/README.md`
for what actually exists and the "Open questions" section for what's settled.*

## The problem

Power cuts in small-town and rural India are frequent, often *known in advance*
by the local electrical team (maintenance windows, load shedding, storm
repairs) — and yet the knowledge travels by word of mouth, arriving after the
inverter is already beeping. The people with the information have no simple way
to publish it; the people who want it have no simple way to receive it.

Electricity is not special in this. Water arrives on a schedule that changes
without warning; roads close; a tank gets cleaned. The same gap exists for each
of them, and the same small machine closes it. kuhu therefore carries
**community notices**, of which power cuts are the first kind — one product,
several services, rather than one app per utility.

## The actors

1. **The team** — a local electrician and their crew. They post notices from
   their phones: region, time window, reason, in English or हिंदी as each
   member prefers. The posting interface must survive: rain on the screen, a
   40-second attention budget, and users who have never seen a dashboard.
2. **Households** — subscribe (no account beyond a push subscription), pick one
   or more regions, receive a quiet notification before a cut. Nothing else.
   Ever. The notification budget is sacred — kuhu is non-intrusive by identity.
3. **Gadgets** — inverters, home automations, sibling machines. They either
   poll a JSON API or subscribe to MQTT. Both are offered (decided): pull is
   the canonical contract, push is a courtesy.

## Decisions already made

### A notice belongs to a service AND an area
Not to the world. An area is a locality / ward / feeder / village; a service is
electricity, water, or whatever comes next. A subscription is a set of
(service, area) pairs, so somebody can follow water for the village and
electricity for the shop without following either everywhere. The API
namespaces by both: `/api/services`, then
`/api/services/{service}/areas/{area}/notices`.

### Teams nest, and that tree is also the admin hierarchy
`teams.parent_id` gives a crew a parent. Rooting it properly turns it into the
whole authority model: a global `kuhu` team holds site admins, a service root
holds that service's admins, crews hang beneath. Permissions flow downward —
you may reach your own areas plus every crew below you. A crew's areas live in
`team_regions` rather than on the area itself, because geography is shared.

### Delivery channels, in order
1. **Web push via a PWA** (core, v1): free, no per-message cost, works on
   Android Chrome and modern iOS; no app store between a lineman and publish.
2. **Telegram channel mirror** (v1.x): nearly free to operate, trivial to push
   to; per-region channels.
3. **WhatsApp Cloud API** (later): where the actual reach is, but costs per
   conversation and needs Meta business verification. Design notices so they
   mirror cleanly; don't build it first.
4. **SMS: no.** DLT registration in India is its own kind of power cut.

### Gadget API — both pull and push
- **Pull (canonical):** `GET /api/services/{service}/areas/{area}/notices` —
  plain JSON, aggressively cacheable. Dumb devices poll every few minutes and
  that's fine.
- **Push (courtesy):** retained MQTT on `kuhu/<service>/<area>/notices`. The
  service is in the path so a device can subscribe to exactly what it cares
  about (`kuhu/electricity/+/notices`), and it says "notices" rather than
  "cuts" because a cut is an electricity word. Fits the family: jigawatt and
  lokki already speak MQTT.
- Webhooks: later, if anyone asks.

### Bilingual by construction
Every notice carries `en` and `hi` fields. The poster writes in their
preferred language; the other side is assisted (templated phrases first —
"Line maintenance / लाइन की मरम्मत" — machine translation only as fallback,
clearly marked). UI strings are authored in both languages together.

### Stack
Cloudflare Workers + D1 (+ KV for push subscriptions), one PWA with two faces
(post / subscribe). Same shelf as the hub. Free tier holds a town.

## The notice (sketch)

```json
{
  "id": "ntc_...",
  "service": "electricity",
  "area": "naddi",
  "kind": "cut",
  "window": { "from": "2026-07-28T16:00+05:30", "to": "2026-07-28T18:00+05:30" },
  "reason": { "en": "Line maintenance", "hi": "लाइन की मरम्मत" },
  "posted_by": "...",
  "posted_at": "...",
  "status": "scheduled | cancelled",
  "batch_id": "bat_..."
}
```

`kind` is defined by the service, not by this schema: electricity offers
`cut / advisory / restored`, water would offer `supply_cut / advisory /
tanker`. Posting to several areas at once writes one row per area sharing a
`batch_id`, so the act can be shown, and cancelled, as the single thing it
was.

## Open questions

**Settled in Season 1:**

- *Auth for posters* → **single-use invite links**, not OTP and not reusable
  codes. An admin mints a link with the role baked in, sends it over WhatsApp
  (which is where this crew already lives), and it dies on first use. The
  burden sits with the admin, which is the right place for it: they know their
  own crew, so they are the identity check. Only hashes are stored.
- *Handing a link over in person* → **QR**, drawn in the browser next to the
  link. The reason to scan it from inside kuhu rather than with the phone's own
  camera is narrow but real: the camera opens Safari, and an iOS Home Screen app
  does not share Safari's storage, so the token would land where the app cannot
  see it. Scanned text is only ever mined for a token, never followed.
- *A service admin is one service* → enforced by where the row sits, not by the
  form that created it. Invite placement is derived from the role: a site admin
  gets the global root, a service admin gets that service's root team, a poster
  gets a crew. Inheriting the inviter's team is what let a service admin land on
  the root and see everything.
- *A poster is narrower than a service* → their invite names areas, and those
  resolve to a crew covering exactly them. Reach is still read off the team, so
  the settled rule below holds; what changed is that an invite can now shape the
  crew rather than only choose one.
- *Roles* → `poster`, `service_admin`, `site_admin`. Admins invite, remove and
  manage coverage; only a site admin edits geography, because areas are shared
  by every service. Three server-side invariants stop anyone locking anyone
  out: no self-revocation, nobody may grant or revoke authority above their
  own, and the last site admin cannot be removed.
- *Renaming areas* → admins can change display names freely; the slug is
  immutable because it is in the public API URL and in every subscriber's saved
  selection.
- *Services are data, not code* → a service row carries its own name, icon,
  accent, notice kinds and reason presets. Adding water is an `INSERT` plus a
  crew; nothing is deployed, and no code anywhere says the word "electricity".
  The alternative — a `kind` enum in the schema and a translation string per
  kind — makes every new facet a migration and a release.
- *Geography is shared between services* → Naddi is Naddi whether the notice is
  about power or water, so areas have no owner. Which areas a crew answers for
  lives in a join table, which also means two services can cover the same
  village without arguing about it.
- *The admin hierarchy is the team tree* → site admin above service admin above
  crew, expressed as position in the same nested-team structure that already
  existed. Role grants powers; position grants visibility. A site admin is not
  a special case in any query — they simply sit at the root.
- *Complexity is hidden until earned* → with one service enabled, the interface
  never says "service". The switcher appears only for someone who can reach
  more than one.
- *Where a poster's reach comes from* → **their team, and only their team.**
  A poster may post to their team's regions plus every descendant team's. Reach
  is deliberately **not** derived from a region hierarchy as well. Two sources
  of authority can disagree — a lineman in a district crew who should somehow
  only reach three villages — and then every permission question needs a
  tie-break rule that someone has to hold in their head. One rule, one place.
  If areas ever nest (see [roadmap.md](roadmap.md)), that tree governs who
  *hears* a notice, never who may *post* one.
- *Subscriber region discovery* → a plain list of regions, chosen as chips.
  Fine at three wards; revisit if a district's worth ever appears at once.

**Still open:**

- Whether posters need a *verified* phone number rather than a self-declared
  one. Researched 2026-07-27: there is no free SMS OTP for India — DLT
  registration is mandatory and costs ~₹7,000 one-time before a single message
  is sent. WhatsApp Cloud API authentication messages (~₹0.13 each, no platform
  fee, no DLT since it isn't SMS) are the cheap path if verification is ever
  wanted. At a one-crew scale the admin vouching for people they already know is
  both free and stronger than an OTP, which only proves possession of a SIM.

- Whether "it's back" notifications are default-on. The `restored` kind exists
  and can be posted, but it spends the one-notification-per-cut budget twice —
  probably it should be opt-in per subscriber.
- Free-text reasons are stored only in the language they were typed in — kuhu
  will not invent a translation it cannot vouch for. Whether the other language
  should get an assisted (clearly-marked) translation is undecided.

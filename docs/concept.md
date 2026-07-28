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

### Regions are the first-class object
A notice is published *to a region* (locality / ward / feeder / village), not
to the world. A subscription is a set of regions. The API namespaces by region
from day one (`/api/regions`, `/api/regions/{id}/next-cuts`) so multi-region
growth is not a breaking change.

### Teams are scoped and can nest
A team owns one or more regions. `team.parent_id` exists from the first schema:
a district office is a parent team whose scope is the union of its children's.
Permissions flow downward (post to your regions, see your subtree). **v1 ships
with exactly one team and one region** — the hierarchy costs nothing now and
saves a migration later.

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
- **Pull (canonical):** `GET /api/regions/{id}/next-cuts` — plain JSON,
  aggressively cacheable (edge-cached; notices change rarely). Dumb devices
  poll every few minutes and that's fine.
- **Push (courtesy):** MQTT topic tree `kuhu/<region>/cuts`, retained
  messages. Fits the family: jigawatt and lokki already speak MQTT.
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
  "region": "ward-3",
  "kind": "cut",
  "window": { "from": "2026-07-28T16:00+05:30", "to": "2026-07-28T18:00+05:30" },
  "reason": { "en": "Line maintenance", "hi": "लाइन की मरम्मत" },
  "posted_by": "team_...",
  "posted_at": "...",
  "status": "scheduled | live | done | cancelled"
}
```

`kind` is open beyond `cut` (voltage advisory, restoration ETA, "it's back") —
"primarily power cuts, but other things might be there."

## Open questions

**Settled in Season 1:**

- *Auth for posters* → **single-use invite links**, not OTP and not reusable
  codes. An admin mints a link with the role baked in, sends it over WhatsApp
  (which is where this crew already lives), and it dies on first use. The
  burden sits with the admin, which is the right place for it: they know their
  own crew, so they are the identity check. Only hashes are stored.
- *Roles* → `poster` and `admin`. Admins invite, remove, and manage areas. Two
  server-side invariants stop a team locking itself out: no self-revocation,
  and the last admin cannot be removed.
- *Renaming areas* → admins can change display names freely; the slug is
  immutable because it is in the public API URL and in every subscriber's saved
  selection.
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
- MQTT publishing (`kuhu/<region>/cuts`, retained). Designed, not built; the
  JSON poll endpoint covers gadgets meanwhile.
- Free-text reasons are stored only in the language they were typed in — kuhu
  will not invent a translation it cannot vouch for. Whether the other language
  should get an assisted (clearly-marked) translation is undecided.

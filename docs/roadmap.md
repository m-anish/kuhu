# kuhu — roadmap and ideas

*Last revised 2026-07-27. This is the thinking-ahead file: what is built, what
is next, what is deliberately refused, and why. Decisions already settled live
in [concept.md](concept.md); this is where the unsettled things wait.*

kuhu's constraint is not technical. It is that a notification is a small
intrusion into someone's evening, and the whole promise is that kuhu spends
that budget once and then shuts up. Nearly every idea below is judged against
that, not against feature count.

---

## Built

The service runs at [kuhuapp.starstucklab.com](https://kuhuapp.starstucklab.com).

- Two faces: subscribe (`/`) and post (`/post`), one PWA, English and हिंदी.
- Posting to **several areas at once** — one act, one row per area tied by a
  batch id, cancelled together, and one notification even for someone who
  follows three of them.
- **Invite links**: single-use, expiring, role baked in by the admin, shared
  over WhatsApp. No codes, no passwords.
- **Admin role**: invite, remove, add areas, rename areas. Cannot self-revoke;
  last admin cannot be removed.
- **Self-service phone move**: mint a 30-minute link on the old phone, open it
  on the new one, old phone signs out.
- Public JSON API for gadgets, payloadless web push for people.
- **Telegram mirror** (`@kuhunotices`) and **retained MQTT**
  (`kuhu/<area>/cuts`, HiveMQ) — neither able to fail a notice, and both
  silently off until configured. An hourly cron clears retained payloads once
  their window has passed.
- Admin panel as collapsible sections; the subscriber face points at Telegram
  and at the API/MQTT for anyone who would rather not use notifications.
- Storage-container warnings and a paste-a-link fallback, because an installed
  app on iOS cannot see Safari's sign-in.

---

## Next — small, and probably worth it

**Per-region Telegram channels.** Today the mirror posts every area to one
channel. A district would want one channel per area — the schema change is a
`telegram_chat_id` on `regions` plus an admin field.

**Devices should ignore stale retained state anyway.** The hourly cron clears
expired topics, but a device that boots in the gap between expiry and the next
run will still read a finished cut. Firmware should check the `to` timestamp
rather than trusting that the topic is current — worth saying plainly in
whatever integration note jigawatt and lokki end up with.

**Confirm the in-app browser detection on a real phone.** The `wv` User-Agent
token is the standard Android WebView marker and the warning is written to be
true either way, but it is heuristic. Watch one real lineman open one real
WhatsApp link before trusting it.

**Offline posting queue.** A lineman up a pole is precisely the person with no
signal, and precisely the person who most needs to post. The service worker
could accept a notice, hold it, and send it when the connection returns — with
honest UI about what has and hasn't gone out. This is the single most
field-relevant improvement on the list.

**Opt-in "power's back".** The `restored` kind already exists and can be
posted, but sending it by default spends the notification budget twice per
outage. It should be a per-subscriber choice, defaulting to off.

---

## Later — worth doing when there is evidence, not before

**Phone verification.** Researched 2026-07-27: no free SMS OTP exists for
India. DLT registration is mandatory and runs ~₹5,900 + GST one-time before a
single message is sent. WhatsApp Cloud API authentication messages are the
cheap route (~₹0.13 each, no platform fee, no DLT, since it isn't SMS). But at
one-crew scale the admin already knows everyone he invites, which is a stronger
check than proving possession of a SIM.

**Google sign-in.** Would buy self-service recovery and one account across
devices. Costs an OAuth flow, a consent screen in the wrong language, and a
Google-account requirement. The phone-move link above already covers the common
case.

*Both of the above share one trigger: the day an admin no longer personally
knows the people he is inviting. Cross that threshold and do both. Before it,
neither earns its complexity.*

**Multi-device rather than move.** Today a person is one phone; moving
transfers. A crew member wanting a phone *and* a tablet would need a tokens
table (one person, many devices) rather than a single `token_hash`.

**Token expiry / session hygiene.** Poster tokens currently never expire; only
revocation stops them. A lost-and-unreported phone therefore keeps working.
Fine at this size, wrong at ten times this size.

**Nested areas (state → district → area).** Cheap in the schema: one
`regions.parent_id` column and the same recursive CTE already running in
production for nested teams. Notices would still attach to a leaf area; the
tree would only change who *hears* about one.

The valuable half is **hierarchical subscribing** — pick "Kangra", get
everything beneath it. One subtlety decides whether it works: the expansion has
to happen at *notify* time, not at subscribe time. Expanding when someone
subscribes would freeze their selection, so an area added under Kangra next
year would reach nobody who had already subscribed. Walk *up* from the notice's
area to its ancestors instead, and match subscriptions against that set. The
`SELECT DISTINCT` fan-out written for multi-area notices already protects the
one-buzz promise here — somebody subscribed to both Kangra and Naddi must still
get exactly one notification — and that is the first thing to regression-test.

**Settled, so don't re-litigate it:** poster reach stays derived from the team
tree alone, never from the region tree. See [concept.md](concept.md).

**The real cost is not the schema, it is the interface.** Six chips on one
screen is a good interface for a lineman in the rain. A state → district → area
tree on a 360px phone, for readers who may not read comfortably, is a hard
design problem, and it — not the SQL — decides whether this feature helps or
just makes the app worse. Watch a real person use it before building.

**Area discovery at scale.** Six chips are a fine interface. Sixty are not — a
district would need search, or a map, or "enter the code on the pole outside
your house". Closely related to the tree above, and probably the same piece of
work.

**More than one crew.** The schema already nests teams and the recursive scope
query is tested, but nothing in the UI creates a team or moves an area between
teams. That work is real but not hard, and should follow a real second crew
rather than precede it.

**An audit trail.** Who posted, who cancelled, who removed whom. `posted_by`
survives revocation deliberately, so half of this already exists in the data;
it just has nowhere to be read.

**Did the cut actually happen?** The most interesting long idea, and the one
most like its sibling [forsyth](https://github.com/m-anish/forsyth): compare
what was announced against what occurred, and publish the crew's accuracy over
time. A team whose 4pm cuts reliably start at 4pm earns a different kind of
trust. Needs a source of ground truth — a subscriber tapping "still on" /
"it's off", or a cheap mains-sense device, which jigawatt's hardware could
plausibly become.

**Beyond Hindi.** Pahari and Gaddi are what people actually speak in these
valleys. The i18n structure takes another language without argument; finding
someone to write the strings honestly is the hard part.

**Low-literacy affordances.** Icons over words for the reason presets, and
possibly voice input for free text. Worth watching a real lineman before
guessing which.

---

## Deliberately not doing

- **SMS.** DLT paperwork, per-message cost, and a worse experience than the
  free channel everyone already has open.
- **Passwords.** They need a recovery channel, which needs a verified identity,
  which is the expense we just avoided. An unguessable token that is never
  typed is both kinder and safer.
- **Accounts for subscribers.** A household should be able to receive notices
  without existing in a database as a person. Picking regions and allowing
  notifications is the entire relationship.
- **Marketing notifications.** Not once, not ever, not for anything. The moment
  kuhu sends something that isn't a notice, everyone turns it off, and rightly.
- **Ads, tracking, analytics on subscribers.** Nothing about who reads what.

---

## Open questions worth sitting with

- Should a notice be editable, or only cancellable-and-reposted? Editing is
  friendlier; it also means the notification someone already read no longer
  matches the record.
- What happens when a cut overruns its window? Silence, or an automatic
  "still off" that costs another notification?
- Who cancels a notice when the person who posted it has gone home? Currently
  any teammate can, which seems right, but nobody has tested it under pressure.

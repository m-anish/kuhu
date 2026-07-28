# AGENTS.md — orientation for AI assistants

## What this is

kuhu is a power-cut notice service: a local electrician's team posts updates
(region, time window, reason) from their phones in English or हिंदी; subscribed
households get quiet notifications for the regions they chose; smart devices
consume the same notices via a JSON API (pull) or MQTT (push). Named for the
koel's call — heard, never seen. Read `docs/concept.md` before designing
anything; it encodes the decisions already made (regions as the first-class
object, hierarchical teams, web push first, Telegram mirror, WhatsApp later,
no SMS) so they don't get re-litigated.

## Family context

This is a spoke of [starstucklab](https://github.com/m-anish/starstucklab),
which lives at `../starstucklab` on disk alongside the sibling spokes
(`../jigawatt`, `../lokki`, `../forsyth`, `../sirious`). Conventions to honor:

- **Voice**: canonical in `../starstucklab/kit/VOICE.md` and
  `../starstucklab/src/data/persona_preamble.txt`. Load it; don't improvise a
  "similar" tone. kuhu's own register is *the quiet signal*: mellow,
  non-intrusive, bilingual, never dramatic. It says what it knows, once,
  softly, and goes quiet.
- **Site** (`site/`): zero-build static — plain HTML/CSS, no framework, no
  build step. It vendors the lab kit in `site/assets/kit/` (synced by
  `../starstucklab/kit/sync-kit.sh`); kuhu's own `styles.css` overrides the
  `--sl-*` tokens (sage `#8fb573`, dawn amber `#d9a866`) and keeps the
  canonical family-band and footer markup from `kit/partials/`.
- **Hub card**: kuhu's card lives in
  `../starstucklab/src/data/machines.json`; the card blurb/image tooling is
  `../starstucklab/tools/gen_machine_cards.py` (harvests this site's og: tags).

## Where things go

- `site/` — the marketing/landing page, deployed via Cloudflare Pages at
  https://kuhu.starstucklab.com (DNS/Pages setup is handled by the owner, not
  by assistants).
- `service/` — the actual service: Cloudflare Worker + D1 + a two-faced PWA
  (`/` subscribe, `/post` publish), deployed at kuhuapp.starstucklab.com.
  Read `service/README.md` for the API surface and the deploy steps. Auth is
  invite-code → bearer token (hash-stored); push is payloadless VAPID.
- `docs/` — concept and, later, architecture documents.

## Guardrails

- Don't invent engineering that hasn't happened. The status line is honest
  about what is built versus merely intended ("Season 1 · First call": service,
  admin role, Telegram mirror and MQTT all work; there is still no real crew
  using it) — keep it that way when things change.
- **A poster's reach comes from their team, and only their team** — their
  team's regions plus every descendant team's. Do not add a second source of
  authority from the region side, even if areas gain a parent/child tree later:
  two sources can disagree and then every permission question needs a tie-break
  someone has to remember. The reasoning is in `docs/concept.md`.
- Don't edit sibling repos from here (the hub card is the one exception, done
  from `../starstucklab`).
- Hindi copy is a first-class deliverable, not a translation afterthought —
  when writing UI strings, write both languages together.

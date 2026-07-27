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
- `service/` — the actual service (planned: Cloudflare Workers + D1, one PWA
  with a posting face and a subscribing face, web push). Empty in Season 0.
- `docs/` — concept and, later, architecture documents.

## Guardrails

- Don't invent engineering that hasn't happened; the status is honest
  ("Season 0 · Clearing its throat") and should stay that way.
- Don't edit sibling repos from here (the hub card is the one exception, done
  from `../starstucklab`).
- Hindi copy is a first-class deliverable, not a translation afterthought —
  when writing UI strings, write both languages together.

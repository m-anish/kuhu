# kuhu

![status](https://img.shields.io/badge/status-second_word-8fb573)
![scope](https://img.shields.io/badge/scope-community_notices-4a5d43)
![delivery](https://img.shields.io/badge/delivery-push_%2B_telegram_%2B_mqtt-6b8f5a)
![api](https://img.shields.io/badge/api-JSON-555555)
![language](https://img.shields.io/badge/language-EN_%2B_%E0%A4%B9%E0%A4%BF%E0%A4%82%E0%A4%A6%E0%A5%80-d9a866)
![license](https://img.shields.io/badge/license-MIT-blue)

*A soft call before things go off.*

> Heard, never seen. The power steps out at four tomorrow; kuhu thought you'd
> like to know before it did.

kuhu carries community notices. The people who actually keep a thing running —
an electrician, a water operator — post from their phones in whichever of
English or हिंदी they prefer, through an interface with nothing on it that
doesn't need to be there. Households that have subscribed hear about it the way
you hear a koel: quietly, from somewhere nearby, before the thing it was
announcing happens. Gadgets that would rather not be surprised can ask an API,
or listen on MQTT.

**Electricity is the first service, not the only possible one.** Water, or
anything else a neighbourhood needs warning about, is a row in a table carrying
its own vocabulary — not a fork of this code.

A [starstucklab](https://starstucklab.com) project. Site:
[kuhu.starstucklab.com](https://kuhu.starstucklab.com) · App:
[kuhuapp.starstucklab.com](https://kuhuapp.starstucklab.com)

---

## The shape of it

Three audiences, one notice:

- **A crew posts.** Area, kind, window, reason — under a minute, bilingual by
  choice, from a phone with monsoon rain on the screen. Each crew sees only its
  own service, so nobody scrolls past somebody else's job.
- **Households listen.** Subscribers pick what they want warning about — this
  area's power, that area's water — and get a quiet notification before it
  happens, and nothing else, ever.
- **Gadgets ask, or subscribe.** Cache-friendly JSON at
  `GET /api/services/<service>/areas/<area>/notices`, and retained MQTT on
  `kuhu/<service>/<area>/notices` for devices that prefer to be told — which
  includes kuhu's own siblings; [jigawatt](https://github.com/m-anish/jigawatt)
  and [lokki](https://github.com/m-anish/lokki) already speak MQTT.

## How it is put together

**A service is data.** Its name, icon, accent, the kinds of notice it can carry
("power cut", "no supply", "tanker coming") and its reason presets all live in
one row. Adding water needs an `INSERT` and a crew — no deploy.

**Geography is shared.** Naddi is Naddi whether the notice is about power or
water, so areas belong to nobody. Each crew declares which areas it answers
for.

**Authority is one tree.** Site admins sit above service admins, who sit above
crews:

```
kuhu                        ← site admins      every service
  └── Electricity           ← service admins   one service
        └── Local line crew ← posters          their own areas
```

Role decides what powers you have; position in the tree decides what you can
see. One recursive query answers "what may this person touch?" at every level,
which is why a site admin is not a special case anywhere in the code.

**Complexity hides itself.** With a single service switched on, the word
"service" never appears in the interface. A lineman is shown areas, a window
and a reason — nothing else.

## Getting a notice out

- **One PWA, two faces** — a big-button posting screen for the crew at `/post`,
  a subscribe screen for everyone else at `/`. Installable, offline-tolerant,
  no app store between a lineman and the publish button.
- **Invite links, not passwords** — an admin mints a link, shares it on
  WhatsApp, and it dies the moment it is used. The role is decided before the
  link exists.
- **Three ways out at once** — payloadless web push, a Telegram mirror, and
  retained MQTT. None of them can fail a notice; the notice is the thing that
  matters.

Details, endpoints and deployment: [service/README.md](service/README.md).

## Status

**Season 2 · A second word — beta.** Posting, subscribing, cancelling, invite
links, the three-tier admin hierarchy, the public API and both mirrors work end
to end, and a second service has been stood up in testing and taken down again,
which is the only honest way to claim the multi-service part. Six real areas
around Dharamshala are configured. What it still does not have is a real crew
using it. It has not met a monsoon. See
[docs/roadmap.md](docs/roadmap.md).

## Repository

| Path | What |
|---|---|
| [`site/`](site/) | Marketing/landing site (Cloudflare Pages → kuhu.starstucklab.com) |
| [`docs/roles.md`](docs/roles.md) | Who's who: subscriber, poster, service admin, site admin |
| [`docs/concept.md`](docs/concept.md) | The product concept and every settled decision |
| [`docs/roadmap.md`](docs/roadmap.md) | What's next, what's refused, and why |
| [`service/`](service/) | The service itself — Cloudflare Worker + D1 + the two-faced PWA |

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Part of [starstucklab](https://github.com/m-anish/starstucklab) — building
small machines for an indifferent universe. Sibling machines:
[jigawatt](https://github.com/m-anish/jigawatt) (disagrees with lightning),
[forsyth](https://github.com/m-anish/forsyth) (knew it would rain),
[lokki](https://github.com/m-anish/lokki) (coordinated light),
[Sirious](https://github.com/m-anish/sirious) (a finderscope with opinions).</sub>

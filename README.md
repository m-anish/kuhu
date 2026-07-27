# kuhu

![status](https://img.shields.io/badge/status-clearing_its_throat-8fb573)
![scope](https://img.shields.io/badge/scope-power--cut_notices-4a5d43)
![delivery](https://img.shields.io/badge/delivery-web_push-6b8f5a)
![api](https://img.shields.io/badge/api-JSON_%2B_MQTT-555555)
![language](https://img.shields.io/badge/language-EN_%2B_%E0%A4%B9%E0%A4%BF%E0%A4%82%E0%A4%A6%E0%A5%80-d9a866)
![license](https://img.shields.io/badge/license-MIT-blue)

*A soft call before the power turns.*

> Heard, never seen. The power steps out at four tomorrow; kuhu thought you'd
> like to know before it did.

kuhu is a small notice service for power cuts. The people who actually operate
the local grid — an electrician and their team — post updates from their phones
in whichever of English or हिंदी they prefer, through an interface with nothing
on it that doesn't need to be there. Households that have subscribed hear about
it the way you hear a koel: quietly, from somewhere nearby, before the thing it
was announcing happens. Gadgets that would rather not be surprised can ask an
API, or listen on MQTT.

A [starstucklab](https://starstucklab.com) project. Site:
[kuhu.starstucklab.com](https://kuhu.starstucklab.com)

---

## The shape of it

Three audiences, one notice:

- **The team posts.** A lineman taps out a notice — region, window, reason —
  in under a minute, bilingual by choice, from a phone with monsoon rain on the
  screen. No dashboards to learn. No accounts to forget.
- **Households listen.** Subscribers pick the region (or regions) they care
  about and get a quiet notification before a cut, and nothing else, ever.
- **Gadgets ask, or subscribe.** A plain cache-friendly JSON API for devices
  that poll (`GET /api/regions/{id}/next-cuts`), and an MQTT topic tree
  (`kuhu/<region>/cuts`) for devices that prefer to be told — which includes
  kuhu's own siblings; [jigawatt](https://github.com/m-anish/jigawatt) and
  [lokki](https://github.com/m-anish/lokki) already speak MQTT.

**Regions are the first-class object.** A notice is published *to a region*,
not to the world. Teams are scoped to regions and can nest — a district office
above area teams above linemen — with permissions flowing downward. Version one
ships with one team and one region, but the schema is born knowing better. The
full concept, including the delivery-channel reasoning (web push first, a
Telegram mirror nearly free, WhatsApp later, SMS never — DLT paperwork is its
own kind of power cut), lives in [docs/concept.md](docs/concept.md).

## Planned architecture

- **One PWA, two faces** — a big-button posting screen for the team, a
  subscribe screen for everyone else. Installable, offline-tolerant, no app
  store between a lineman and the publish button.
- **Web push** for notifications — free, no per-message cost, works on Android
  and modern iOS.
- **Cloudflare Workers + D1** for the service itself, same shelf as the rest of
  the lab.

## Status

**Season 0 · Clearing its throat.** There is a name, a concept document, and a
site. There is no code yet, and kuhu is honest about that — it would rather say
nothing than say something that isn't so, which is, incidentally, the entire
product philosophy.

## Repository

| Path | What |
|---|---|
| [`site/`](site/) | Marketing/landing site (Cloudflare Pages → kuhu.starstucklab.com) |
| [`docs/concept.md`](docs/concept.md) | The product concept: actors, regions, channels, API shape |
| [`service/`](service/) | The service itself (Workers + D1) — placeholder, Season 1 work |

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Part of [starstucklab](https://github.com/m-anish/starstucklab) — building
small machines for an indifferent universe. Sibling machines:
[jigawatt](https://github.com/m-anish/jigawatt) (disagrees with lightning),
[forsyth](https://github.com/m-anish/forsyth) (knew it would rain),
[lokki](https://github.com/m-anish/lokki) (coordinated light),
[Sirious](https://github.com/m-anish/sirious) (a finderscope with opinions).</sub>

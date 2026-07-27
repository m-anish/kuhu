# kuhu

![status](https://img.shields.io/badge/status-first_call-8fb573)
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
not to the world. Teams are scoped to regions and nest — a district office
above area teams above linemen — with permissions flowing downward, enforced by
a recursive query and verified in practice. The full concept, including the
delivery-channel reasoning (web push first, a Telegram mirror nearly free,
WhatsApp later, SMS never — DLT paperwork is its own kind of power cut), lives
in [docs/concept.md](docs/concept.md).

## Architecture

- **One PWA, two faces** — a big-button posting screen for the team at `/post`,
  a subscribe screen for everyone else at `/`. Installable, offline-tolerant,
  no app store between a lineman and the publish button.
- **Invite links, not OTPs** — an admin mints a link, shares it on WhatsApp, and
  it dies the moment it is used (or when it expires, or if they cancel it). The
  role is decided by the admin before the link exists, so the person joining has
  nothing to configure. Only hashes are stored. No SMS, no DLT paperwork, no
  per-message cost.
- **An admin role** — admins invite and remove people, add areas, and rename
  them. A team cannot lock itself out: nobody can revoke themselves, and the
  last admin cannot be removed.
- **Payloadless web push** — the server tickles the subscription, the service
  worker asks what changed and shows one notification. Notice text never rests
  inside a third-party push service.
- **Cloudflare Workers + D1**, same shelf as the rest of the lab.

Details, endpoints, and deployment: [service/README.md](service/README.md).

## Status

**Season 1 · First call — beta.** The service is built and deployed at
[kuhuapp.starstucklab.com](https://kuhuapp.starstucklab.com): posting to one or
several areas, subscribing, cancelling, invite links, the admin role, the
public API, and the team hierarchy all work end to end. Six real areas around
Dharamshala are configured. What it does not yet have is a real crew using it,
MQTT publishing, or a Telegram mirror — see [docs/roadmap.md](docs/roadmap.md).
It has not met a monsoon. Notices so far have been posted only by its author,
to an empty audience. They went through.

## Repository

| Path | What |
|---|---|
| [`site/`](site/) | Marketing/landing site (Cloudflare Pages → kuhu.starstucklab.com) |
| [`docs/concept.md`](docs/concept.md) | The product concept: actors, regions, channels, API shape |
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

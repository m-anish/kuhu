# Who's who in kuhu

**Four kinds of people. Find yourself, read that bit, stop.**

| You are | You have | Read |
|---|---|---|
| Someone who wants to know before the power goes | no account | [Subscriber](#subscriber) |
| On a crew, you post the notices | a phone that's signed in | [Poster](#poster) |
| You run one service | same, plus an Admin section | [Service admin](#service-admin) |
| You run all of kuhu | same, plus Services | [Site admin](#site-admin) |

> **Note on names.** In the app the third one is called **service admin**. If
> someone says "the admin", they usually mean this. The fourth is **site
> admin** — there are only one or two of those.

---

## The shape of it

Three levels. Each one only sees its own branch.

```
kuhu                        ← site admin: everything
  └── Electricity           ← service admin: this service only
        └── Local line crew ← posters: their own areas
```

Plus subscribers, who sit outside all of it and just receive.

**Two different things decide what you can do:**

- **Your role** → what you're *allowed* to do
- **Where you sit** → what you can *see*

That's why a service admin never sees another service. Not hidden. Just not below them.

---

## Subscriber

**No account. No app required. No name given.**

### What you do
1. Open the site
2. Tap a service (⚡ Electricity)
3. Tick your areas
4. Tap **Notify me**

Done. Now you hear nothing until there's something to hear.

### What you get
- **One** notification per notice
- One more if it's cancelled
- Nothing else. Ever.

Follow three areas and one notice covers all three? **Still one buzz.**

### Other ways to get it
- **Telegram** — join the channel, no app
- **JSON / MQTT** — for inverters and home automation, no key needed

### What you never do
- Make an account
- Give a phone number
- Get marketing

---

## Poster

**You're on a crew. You post notices.**

### Your job is one screen
Open **Post a notice**, work down:

1. **Kind** — power cut? advisory? restored?
2. **Area** — tap all that apply
3. **When** — three shortcuts fill the times, or set them yourself
4. **Reason** — tap a preset, or type your own
5. **Publish**

### Things worth knowing

**Multiple areas = one notice.** Not four notices. Cancel it and all four cancel.

**Presets come with Hindi already written.** Type your own and it goes out only in the language you typed it in.

**Cancelling works.** Recent notices → Cancel. Everyone who was told, gets told.

**New phone?** *This phone* → *Move me to a new phone* → scan the QR on the new one. Your name and history come with you.

### What you can't do
- Invite people
- Add or rename areas
- See other crews

Lost your phone? **Ask your admin.** They remove it and send a fresh invite.

---

## Service admin

**You run one service. Everything you see is that service.**

You can do everything a poster does, **plus three things**.

### 1 · Bring people in

Admin → People:
- Pick what they'll be (poster / service admin)
- Pick how long the link lives
- **Make invite link** → send on WhatsApp, or let them scan the QR

**The link works once, then dies.** It also expires. Their role was set by you before the link existed — nothing for them to choose or get wrong.

Sent it to the wrong person? **Cancel link**, before they open it.

### 2 · Take people out

**Remove** next to their name.
- Their phone stops working immediately
- Their old notices keep their name on them
- You can't remove yourself
- You can't remove anyone senior to you

### 3 · Areas

Admin → Areas. The heading names your service, so you always know which map you're editing.

Add one, rename one, or tap to say whether your crew answers for it.

> ⚠️ **The short id is permanent.** It's in web addresses and in every subscriber's saved choices. Names can change. The id can't.

> **Areas belong to your service alone.** An electricity feeder and a water zone divide the same valley differently.

### What you can't do
- Create a service
- Touch another service

Need either? **Ask a site admin.**

---

## Site admin

**You sit above every service.** Everything a service admin can do, you can do in all of them — plus one thing only you can do.

### Only you: create a service

Admin → Services. A service brings its own vocabulary, and you write it as you create it:

| Field | What it is |
|---|---|
| **Kinds of notice** | What it can announce. Water: *No supply*, *Tanker coming* |
| **Areas** | How this service divides the map. **Give it at least one** |
| **Reason presets** | Optional. One tap instead of typing in the rain |

A service with **no areas** can't be subscribed to or posted about.

It arrives with its own admin group and a first crew, ready to invite into.

### Inviting across services

When you make an invite you also pick **where it lands** — which service, which crew.

A service admin never sees that choice. They only have one answer.

### Things worth not breaking

- 🔒 **The last site admin can't be removed.** Nobody can remove themselves. kuhu refuses rather than lock everyone out.
- 🔒 **A short id is permanent** once anyone has subscribed to it.
- 🔒 **Removing a person keeps their notices.** Removing a service doesn't — only remove an empty one.

### App looking stale?

Version sits bottom-right of every screen. If the server is ahead of your phone, it becomes a button. **Tap it** — clears the cache and reloads.

---

## Quick comparison

| | Subscriber | Poster | Service admin | Site admin |
|---|:--:|:--:|:--:|:--:|
| Receive notices | ✅ | ✅ | ✅ | ✅ |
| Post a notice | — | ✅ | ✅ | ✅ |
| Cancel a notice | — | ✅ | ✅ | ✅ |
| Invite people | — | — | ✅ | ✅ |
| Remove people | — | — | ✅ | ✅ |
| Add / rename areas | — | — | ✅ | ✅ |
| Create a **service** | — | — | — | ✅ |
| See **other** services | — | — | — | ✅ |

---

## In the app itself

Signed in? There's a **Help** link in the footer with a guide for your own role — the same thing, written as a walkthrough.

Rules here are the readable version. The ones that actually bind are enforced on the server, not in the screen.

// Telegram mirror.
//
// Not everyone will enable web push, and a Telegram channel costs nothing to
// run and nothing per message. A notice is mirrored to a channel as plain text
// in both languages — the same words the app shows, so nobody has to reconcile
// two versions of the truth.
//
// Configure with:
//   wrangler secret put TELEGRAM_BOT_TOKEN      (from @BotFather)
//   TELEGRAM_CHAT_ID = "@yourchannel"           in wrangler.toml [vars]
//
// Both unset = silently disabled, which is the state kuhu ships in.

const IST = 'Asia/Kolkata';

function fmtWindow(fromIso, toIso, lang) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const sameDay = day.format(from) === day.format(to);
  const word = lang === 'hi' ? 'से' : 'to';
  return sameDay
    ? `${day.format(from)}, ${time.format(from)} ${word} ${time.format(to)}`
    : `${day.format(from)} ${time.format(from)} ${word} ${day.format(to)} ${time.format(to)}`;
}

const HEAD = {
  cut:      { en: 'Power cut',  hi: 'बिजली कटौती' },
  advisory: { en: 'Advisory',   hi: 'सूचना' },
  restored: { en: 'Restored',   hi: 'बिजली बहाल' },
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * Compose the channel message. Bilingual, because the channel has both kinds
 * of reader and neither should have to guess.
 */
export function composeMessage({ kind, status, from, to, reason_en, reason_hi, areas_en, areas_hi }) {
  const cancelled = status === 'cancelled';
  const head = HEAD[kind] || HEAD.cut;
  const mark = cancelled ? '⊘' : (kind === 'restored' ? '✓' : '⚡');

  const en = [
    `${mark} <b>${escapeHtml(areas_en)}</b> — ${escapeHtml(head.en)}${cancelled ? ' (cancelled)' : ''}`,
    escapeHtml(fmtWindow(from, to, 'en')),
    reason_en ? escapeHtml(reason_en) : '',
  ].filter(Boolean).join('\n');

  const hi = [
    `<b>${escapeHtml(areas_hi)}</b> — ${escapeHtml(head.hi)}${cancelled ? ' (रद्द)' : ''}`,
    escapeHtml(fmtWindow(from, to, 'hi')),
    reason_hi ? escapeHtml(reason_hi) : '',
  ].filter(Boolean).join('\n');

  return `${en}\n\n${hi}`;
}

/** Fire-and-forget. A broken channel must never break posting a notice. */
export async function mirrorToTelegram(env, notice) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { skipped: true };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: composeMessage(notice),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: false,
      }),
    });
    if (!res.ok) console.error('telegram', res.status, (await res.text()).slice(0, 200));
    return { ok: res.ok };
  } catch (err) {
    console.error('telegram', err.message);
    return { ok: false };
  }
}

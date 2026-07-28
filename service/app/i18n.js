// Both languages, written together — never a translation afterthought.

export const STRINGS = {
  en: {
    dir_note: '',
    // subscribe face
    sub_title: 'Know before the power goes.',
    sub_lede: 'Pick the areas you live or work in. You will get one quiet notification before a cut, and nothing else, ever.',
    your_areas: 'Your areas',
    notify_me: 'Notify me',
    notify_off: 'Stop notifications',
    notify_on_ok: 'Listening. You will hear from kuhu only when there is something to say.',
    notify_off_ok: 'Quiet. kuhu will not send you anything.',
    upcoming: 'Coming up',
    none_upcoming: 'Nothing scheduled. The power, for now, intends to stay.',
    pick_one: 'Pick at least one area first.',
    push_denied: 'Notifications are blocked for this site in your browser settings.',
    push_unsupported: 'This browser cannot receive notifications. The list above still works.',
    // poster face
    post_title: 'Post a notice.',
    post_lede: 'Your team posts here. Everyone subscribed to that area hears about it once.',
    join_title: 'Join your team',
    join_lede: 'Enter the invite code your team gave you. You only do this once on this phone.',
    join_by_link: 'You need an invite link from your team admin. Ask them to send you one on WhatsApp — it opens this page and signs you in.',
    invite_code: 'Invite code',
    your_name: 'Your name',
    join: 'Join',
    joined_as: 'Joined as',
    bad_code: 'That code was not recognised.',
    area: 'Area',
    when: 'When',
    starts: 'Starts',
    ends: 'Ends',
    quick: 'Quick',
    in_2h: 'Next 2 hours',
    tonight: 'This evening',
    tomorrow_am: 'Tomorrow morning',
    reason: 'Reason',
    reason_other: 'Or write it yourself',
    kind: 'Kind',
    kind_cut: 'Power cut',
    kind_advisory: 'Advisory',
    kind_restored: 'Restored',
    publish: 'Publish notice',
    published: 'Posted. The area has been told.',
    published_many: 'Posted to {n} areas. Everyone has been told once.',
    your_notices: 'Your recent notices',
    cancel_notice: 'Cancel',
    cancelled_ok: 'Cancelled. Everyone has been told that too.',
    need_reason: 'Say why, in either language.',
    bad_window: 'The end must come after the start.',
    sign_out: 'Sign out of this phone',
    // joining by link
    checking: 'Checking the link…',
    link_dead_title: 'This link no longer works.',
    link_dead_body: 'Invite links are good once, and not for long. Ask whoever sent it for a fresh one.',
    join_as: 'Join {team} as {role}.',
    join_lede2: 'Tell us who you are. This phone will remember you afterwards.',
    your_phone: 'Phone number (optional)',
    need_name: 'A name, please.',
    role_admin: 'an admin',
    role_poster: 'a poster',
    offline: 'No connection. Try again in a moment.',
    // moving to a new phone
    move_title: 'Got a new phone?',
    move_help: 'Make a link on your old phone and open it on the new one. No admin needed.',
    move_make: 'Move me to a new phone',
    move_warn: 'Open this on the new phone within 30 minutes. This phone will be signed out once you do.',
    move_head: 'Move {name} to this phone.',
    move_lede: 'Your team, your role and your notices all come with you. Wherever you made this link will be signed out.',
    move_confirm: 'Move me here',
    // pasting a link (the fallback when a link can't be tapped in the right place)
    paste_title: 'Have a link?',
    paste_help: 'Paste an invite link, or a link you made on another phone.',
    paste_ph: 'Paste the link here',
    paste_go: 'Continue',
    paste_bad: "That doesn't look like a kuhu link.",
    // iOS home-screen app storage warning
    ios_warn_title: 'Using an iPhone?',
    ios_warn_body: 'The Home Screen app keeps its own separate sign-in from Safari. Add kuhu to your Home Screen first, then paste this link inside the app — otherwise you will be signed in here but not there.',
    ios_copy: 'Copy this link',
    ios_dismiss: 'Continue in Safari anyway',
    inapp_warn_title: 'Opened from inside WhatsApp?',
    inapp_warn_body: "This built-in browser signs in separately from Chrome and from the Home Screen app. Copy the link and open it in Chrome instead, or you'll be signed in here only.",
    inapp_dismiss: 'Continue here anyway',
    move_title_alt: 'New phone, or the Home Screen app?',
    move_help_alt: 'Make a link here and paste it into the other one. On iPhone the Home Screen app signs in separately from Safari, so it needs its own link.',
    // theme
    theme_auto: 'Theme: follows your phone',
    theme_light: 'Theme: light',
    theme_dark: 'Theme: dark',
    // admin structure
    people: 'People',
    this_phone: 'This phone',
    // other ways to hear
    other_ways: 'Other ways to know',
    tg_note: 'Prefer Telegram? Every notice is posted to the channel too — no app, no notifications to allow.',
    tg_join: 'Join the Telegram channel',
    devices_title: 'For devices and tinkerers',
    devices_note: 'Notices are published as retained MQTT on kuhu/<area>/cuts, and served as plain JSON at /api/regions/<area>/next-cuts — no key, no account. Inverters, home automations, and the other machines in the lab can read either.',
    devices_api: 'See the JSON for an area',
    // support
    support_note: 'kuhu is free, and intends to stay that way. The chai that keeps it awake is not.',
    support_chai: '☕ Buy me a chai',
    support_kofi: '♥ Ko-fi',
    // admin
    admin: 'Admin',
    invite_someone: 'Invite someone',
    invite_as: 'Joining as',
    invite_note: 'Note to yourself (optional)',
    invite_note_ph: 'e.g. Ramesh, north side',
    invite_valid: 'Link works for',
    hours_24: '24 hours',
    hours_48: '2 days',
    hours_168: '7 days',
    make_link: 'Make invite link',
    link_ready: 'Link ready. It works once, then dies.',
    share_whatsapp: 'Share on WhatsApp',
    copy_link: 'Copy link',
    copied: 'Copied.',
    wa_message: 'Join the {team} power-cut notices on kuhu. Tap here — the link works once: {url}',
    open_invites: 'Invite links',
    no_invites: 'No invite links yet.',
    state_open: 'waiting',
    state_used: 'used',
    state_expired: 'expired',
    state_revoked: 'cancelled',
    revoke: 'Cancel link',
    members: 'Your team',
    remove_member: 'Remove',
    removed_ok: 'Removed. That phone is signed out.',
    last_admin: 'That is the last admin — make someone else an admin first.',
    areas_admin: 'Areas',
    add_area: 'Add an area',
    area_slug: 'Short id (permanent)',
    area_slug_help: 'Lowercase letters, numbers, hyphens. Used in web addresses — it cannot be changed later.',
    area_en: 'Name in English',
    area_hi: 'नाम (हिंदी)',
    save_area: 'Add area',
    area_added: 'Area added.',
    rename: 'Rename',
    rename_saved: 'Renamed.',
    slug_fixed: 'The short id stays the same. Only the names change.',
    // shared
    to: 'to',
    cancelled_label: 'cancelled',
    subscribe_link: 'Subscribe instead',
    post_link: 'Team login',
    cancel: 'Cancel',
  },
  hi: {
    dir_note: '',
    sub_title: 'बिजली जाने से पहले जानें।',
    sub_lede: 'अपने इलाके चुनिए। कटौती से पहले एक शांत सूचना मिलेगी — और उसके अलावा कभी कुछ नहीं।',
    your_areas: 'आपके इलाके',
    notify_me: 'मुझे सूचित करें',
    notify_off: 'सूचनाएँ बंद करें',
    notify_on_ok: 'सुन रहे हैं। ज़रूरत होने पर ही kuhu बोलेगा।',
    notify_off_ok: 'शांत। अब kuhu कुछ नहीं भेजेगा।',
    upcoming: 'आगे',
    none_upcoming: 'फ़िलहाल कोई कटौती तय नहीं है।',
    pick_one: 'पहले कम से कम एक इलाका चुनिए।',
    push_denied: 'आपके ब्राउज़र में इस साइट की सूचनाएँ बंद हैं।',
    push_unsupported: 'यह ब्राउज़र सूचनाएँ नहीं ले सकता। ऊपर की सूची फिर भी काम करती है।',
    post_title: 'सूचना डालें।',
    post_lede: 'आपकी टीम यहाँ से सूचना डालती है। उस इलाके के सभी लोगों को एक बार पता चल जाता है।',
    join_title: 'अपनी टीम से जुड़ें',
    join_lede: 'टीम से मिला निमंत्रण कोड डालिए। इस फ़ोन पर यह सिर्फ़ एक बार करना है।',
    join_by_link: 'जुड़ने के लिए एडमिन से निमंत्रण लिंक चाहिए। उनसे WhatsApp पर भेजने को कहिए — लिंक यही पन्ना खोलेगा और आपको साइन इन कर देगा।',
    invite_code: 'निमंत्रण कोड',
    your_name: 'आपका नाम',
    join: 'जुड़ें',
    joined_as: 'जुड़े हैं',
    bad_code: 'यह कोड सही नहीं है।',
    area: 'इलाका',
    when: 'कब',
    starts: 'शुरू',
    ends: 'ख़त्म',
    quick: 'तुरंत',
    in_2h: 'अगले 2 घंटे',
    tonight: 'आज शाम',
    tomorrow_am: 'कल सुबह',
    reason: 'वजह',
    reason_other: 'या ख़ुद लिखिए',
    kind: 'प्रकार',
    kind_cut: 'बिजली कटौती',
    kind_advisory: 'सूचना',
    kind_restored: 'बिजली बहाल',
    publish: 'सूचना भेजें',
    published: 'भेज दी गई। इलाके को पता चल गया है।',
    published_many: '{n} इलाकों में भेज दी गई। सबको एक बार पता चल गया है।',
    your_notices: 'आपकी हाल की सूचनाएँ',
    cancel_notice: 'रद्द करें',
    cancelled_ok: 'रद्द कर दी गई। यह भी सबको बता दिया गया है।',
    need_reason: 'किसी एक भाषा में वजह लिखिए।',
    bad_window: 'ख़त्म होने का समय शुरू के बाद होना चाहिए।',
    sign_out: 'इस फ़ोन से साइन आउट करें',
    checking: 'लिंक जाँचा जा रहा है…',
    link_dead_title: 'यह लिंक अब काम नहीं करता।',
    link_dead_body: 'निमंत्रण लिंक एक ही बार चलता है, और थोड़ी देर के लिए। जिसने भेजा था, उनसे नया माँग लीजिए।',
    join_as: '{team} में {role} के रूप में जुड़ें।',
    join_lede2: 'बताइए आप कौन हैं। यह फ़ोन आपको आगे याद रखेगा।',
    your_phone: 'फ़ोन नंबर (ज़रूरी नहीं)',
    need_name: 'नाम लिखिए।',
    role_admin: 'एडमिन',
    role_poster: 'सूचना डालने वाले',
    offline: 'कनेक्शन नहीं है। थोड़ी देर में दोबारा कोशिश कीजिए।',
    move_title: 'नया फ़ोन लिया है?',
    move_help: 'पुराने फ़ोन पर लिंक बनाइए और नए फ़ोन पर खोलिए। एडमिन की ज़रूरत नहीं।',
    move_make: 'मुझे नए फ़ोन पर ले जाएँ',
    move_warn: 'इसे 30 मिनट के अंदर नए फ़ोन पर खोलिए। खोलते ही यह फ़ोन साइन आउट हो जाएगा।',
    move_head: '{name} को इस फ़ोन पर लाएँ।',
    move_lede: 'आपकी टीम, आपका काम और आपकी सूचनाएँ — सब साथ आ जाएँगी। जहाँ से यह लिंक बनाया था, वहाँ साइन आउट हो जाएगा।',
    move_confirm: 'मुझे यहाँ ले आएँ',
    paste_title: 'लिंक है आपके पास?',
    paste_help: 'निमंत्रण लिंक, या दूसरे फ़ोन पर बनाया हुआ लिंक यहाँ पेस्ट कीजिए।',
    paste_ph: 'लिंक यहाँ पेस्ट कीजिए',
    paste_go: 'आगे बढ़ें',
    paste_bad: 'यह kuhu का लिंक नहीं लग रहा।',
    ios_warn_title: 'iPhone इस्तेमाल कर रहे हैं?',
    ios_warn_body: 'होम स्क्रीन ऐप का साइन-इन Safari से अलग होता है। पहले kuhu को होम स्क्रीन पर जोड़िए, फिर यह लिंक ऐप के अंदर पेस्ट कीजिए — वरना यहाँ साइन इन होंगे, ऐप में नहीं।',
    ios_copy: 'यह लिंक कॉपी करें',
    ios_dismiss: 'Safari में ही आगे बढ़ें',
    inapp_warn_title: 'WhatsApp के अंदर से खोला है?',
    inapp_warn_body: 'यह अंदर वाला ब्राउज़र Chrome और होम स्क्रीन ऐप से अलग साइन इन होता है। लिंक कॉपी करके Chrome में खोलिए, वरना सिर्फ़ यहीं साइन इन रहेंगे।',
    inapp_dismiss: 'यहीं आगे बढ़ें',
    move_title_alt: 'नया फ़ोन, या होम स्क्रीन ऐप?',
    move_help_alt: 'यहाँ लिंक बनाइए और दूसरे में पेस्ट कीजिए। iPhone पर होम स्क्रीन ऐप अलग से साइन इन होता है, इसलिए उसे अपना लिंक चाहिए।',
    theme_auto: 'रंग: फ़ोन के अनुसार',
    theme_light: 'रंग: हल्का',
    theme_dark: 'रंग: गहरा',
    people: 'लोग',
    this_phone: 'यह फ़ोन',
    other_ways: 'जानने के और तरीके',
    tg_note: 'Telegram ज़्यादा सुविधाजनक है? हर सूचना चैनल पर भी जाती है — न ऐप, न सूचनाओं की अनुमति।',
    tg_join: 'Telegram चैनल से जुड़ें',
    devices_title: 'उपकरणों और शौक़ीनों के लिए',
    devices_note: 'सूचनाएँ kuhu/<area>/cuts पर retained MQTT के रूप में और /api/regions/<area>/next-cuts पर सादे JSON में मिलती हैं — न चाबी, न खाता। इन्वर्टर, होम ऑटोमेशन और लैब की बाक़ी मशीनें दोनों पढ़ सकती हैं।',
    devices_api: 'किसी इलाके का JSON देखिए',
    support_note: 'kuhu मुफ़्त है, और आगे भी रहेगा। जो चाय इसे जगाए रखती है, वह नहीं।',
    support_chai: '☕ एक चाय पिला दीजिए',
    support_kofi: '♥ Ko-fi',
    admin: 'एडमिन',
    invite_someone: 'किसी को बुलाएँ',
    invite_as: 'किस रूप में',
    invite_note: 'अपने लिए नोट (ज़रूरी नहीं)',
    invite_note_ph: 'जैसे: रमेश, उत्तर की तरफ़',
    invite_valid: 'लिंक कब तक चले',
    hours_24: '24 घंटे',
    hours_48: '2 दिन',
    hours_168: '7 दिन',
    make_link: 'निमंत्रण लिंक बनाएँ',
    link_ready: 'लिंक तैयार है। एक बार चलेगा, फिर ख़त्म।',
    share_whatsapp: 'WhatsApp पर भेजें',
    copy_link: 'लिंक कॉपी करें',
    copied: 'कॉपी हो गया।',
    wa_message: '{team} की बिजली कटौती सूचनाओं से जुड़िए — kuhu पर। यहाँ दबाइए, लिंक एक ही बार चलेगा: {url}',
    open_invites: 'निमंत्रण लिंक',
    no_invites: 'अभी कोई निमंत्रण लिंक नहीं है।',
    state_open: 'इंतज़ार में',
    state_used: 'इस्तेमाल हुआ',
    state_expired: 'समय ख़त्म',
    state_revoked: 'रद्द',
    revoke: 'लिंक रद्द करें',
    members: 'आपकी टीम',
    remove_member: 'हटाएँ',
    removed_ok: 'हटा दिया। वह फ़ोन साइन आउट हो गया।',
    last_admin: 'यह आख़िरी एडमिन हैं — पहले किसी और को एडमिन बनाइए।',
    areas_admin: 'इलाके',
    add_area: 'नया इलाका जोड़ें',
    area_slug: 'छोटी आईडी (हमेशा के लिए)',
    area_slug_help: 'अंग्रेज़ी के छोटे अक्षर, अंक, हाइफ़न। वेब पते में इस्तेमाल होती है — बाद में बदली नहीं जा सकती।',
    area_en: 'Name in English',
    area_hi: 'नाम (हिंदी)',
    save_area: 'इलाका जोड़ें',
    area_added: 'इलाका जुड़ गया।',
    rename: 'नाम बदलें',
    rename_saved: 'नाम बदल गया।',
    slug_fixed: 'छोटी आईडी वही रहेगी। सिर्फ़ नाम बदलते हैं।',
    to: 'से',
    cancelled_label: 'रद्द',
    subscribe_link: 'सूचनाएँ लेनी हैं',
    post_link: 'टीम लॉगिन',
    cancel: 'रद्द करें',
  },
};

/** Reason presets — the five things it almost always is. */
export const REASONS = [
  { en: 'Line maintenance',        hi: 'लाइन की मरम्मत' },
  { en: 'Transformer work',        hi: 'ट्रांसफ़ॉर्मर का काम' },
  { en: 'Storm damage',            hi: 'तूफ़ान से नुक़सान' },
  { en: 'Scheduled load shedding', hi: 'निर्धारित लोड शेडिंग' },
  { en: 'Pole and wire work',      hi: 'खंभे और तार का काम' },
];

/**
 * Pull an invite token out of whatever the person pasted — a whole link, a
 * link with a ?t= query, or the bare token on its own. Tokens are base64url
 * from 24 random bytes, so 32 chars of that alphabet.
 */
export function parseInviteToken(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const m = s.match(/[#?&]t=([A-Za-z0-9_-]{20,})/) || s.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : '';
}

/**
 * iOS gives a Home Screen web app its own storage, separate from Safari's — so
 * signing in on one does nothing for the other. Detecting the combination lets
 * us warn before someone joins in the wrong place.
 */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * An app's own built-in browser (WhatsApp, Facebook, Instagram) rather than the
 * real one. On Android these are WebViews, which keep their own storage — so
 * signing in here does nothing for Chrome or for an installed app. The `wv`
 * token is Android WebView's own marker.
 */
export function isInAppBrowser() {
  const ua = navigator.userAgent;
  return /\bwv\b/.test(ua) || /FBAN|FBAV|Instagram|Line\//.test(ua);
}

/* ── theme ──────────────────────────────────────────────────────────────
   Three states, not two: "auto" follows the phone, which is what most people
   want and what makes the app match everything else on their screen at dusk.
   An explicit choice is remembered and overrides the system. */

const THEMES = ['auto', 'light', 'dark'];

export function pickTheme() {
  const saved = localStorage.getItem('kuhu.theme');
  return THEMES.includes(saved) ? saved : 'auto';
}

/** Apply a theme and remember it. `auto` removes the attribute so the CSS
 *  media query takes over again. */
export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'auto';
  localStorage.setItem('kuhu.theme', t);
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  paintThemeColor();
  return t;
}

export function nextTheme(current) {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
}

/** Keep the browser chrome (status bar, address bar) in step with the page. */
function paintThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  if (bg) meta.content = bg;
}

/** Wire the cycling button present in every masthead. */
export function initTheme(t) {
  let theme = applyTheme(pickTheme());
  const btn = document.querySelector('#theme');
  if (!btn) return;

  const paint = () => {
    const icon = { auto: '◐', light: '☀', dark: '☾' }[theme];
    btn.querySelector('.theme-icon').textContent = icon;
    const label = t(`theme_${theme}`);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  };

  btn.addEventListener('click', () => {
    theme = applyTheme(nextTheme(theme));
    paint();
  });

  // Following the system means noticing when the system changes its mind.
  window.matchMedia('(prefers-color-scheme: light)')
    .addEventListener('change', () => { if (theme === 'auto') paintThemeColor(); });

  paint();
  return { repaint: paint };
}

export function pickLang() {
  const saved = localStorage.getItem('kuhu.lang');
  if (saved === 'en' || saved === 'hi') return saved;
  return (navigator.language || 'en').startsWith('hi') ? 'hi' : 'en';
}

export function setLang(lang) {
  localStorage.setItem('kuhu.lang', lang);
  document.documentElement.lang = lang;
}

/** Times are always shown in IST — that is where the poles are. */
const IST = 'Asia/Kolkata';

export function fmtWindow(fromIso, toIso, lang) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: IST });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
  const sameDay = day.format(from) === day.format(to);
  const word = STRINGS[lang].to;
  return sameDay
    ? `${day.format(from)}, ${time.format(from)} ${word} ${time.format(to)}`
    : `${day.format(from)} ${time.format(from)} ${word} ${day.format(to)} ${time.format(to)}`;
}

/** <input type="datetime-local"> value → ISO instant. */
export function localToIso(value) {
  return value ? new Date(value).toISOString() : '';
}

/** Date → <input type="datetime-local"> value, in the phone's own clock. */
export function isoToLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

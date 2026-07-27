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
    your_notices: 'Your recent notices',
    cancel_notice: 'Cancel',
    cancelled_ok: 'Cancelled. Everyone has been told that too.',
    need_reason: 'Say why, in either language.',
    bad_window: 'The end must come after the start.',
    sign_out: 'Sign out of this phone',
    // shared
    to: 'to',
    cancelled_label: 'cancelled',
    subscribe_link: 'Subscribe instead',
    post_link: 'Team login',
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
    your_notices: 'आपकी हाल की सूचनाएँ',
    cancel_notice: 'रद्द करें',
    cancelled_ok: 'रद्द कर दी गई। यह भी सबको बता दिया गया है।',
    need_reason: 'किसी एक भाषा में वजह लिखिए।',
    bad_window: 'ख़त्म होने का समय शुरू के बाद होना चाहिए।',
    sign_out: 'इस फ़ोन से साइन आउट करें',
    to: 'से',
    cancelled_label: 'रद्द',
    subscribe_link: 'सूचनाएँ लेनी हैं',
    post_link: 'टीम लॉगिन',
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
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST });
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

// Both languages, written together — never a translation afterthought.

import { APP_VERSION } from '/version.js';

/**
 * Show which version this phone is running, and check it against the server.
 * A PWA can sit on cached code for a while; rather than leaving anyone to
 * wonder, the footer states the version and offers a real fix when it is
 * behind. Purging the caches and unregistering the worker is what a user
 * cannot do for themselves on a phone.
 */
export async function initVersion() {
  const el = document.querySelector('#version');
  if (!el) return;
  el.textContent = `v${APP_VERSION}`;
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || version === APP_VERSION) return;

    el.textContent = `v${APP_VERSION} → v${version}`;
    el.classList.add('stale');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const refresh = async () => {
      el.textContent = '…';
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      location.reload();
    };
    el.addEventListener('click', refresh);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') refresh(); });
  } catch {
    // Offline. The version already shown is the honest one.
  }
}

export const STRINGS = {
  en: {
    dir_note: '',
    // subscribe face
    sub_title: 'Know before it happens.',
    sub_lede: 'Pick what you want warning about. You will get one quiet notification before it happens, and nothing else, ever.',
    your_areas: 'Your areas',
    notify_me: 'Notify me',
    notify_off: 'Stop notifications',
    notify_on_ok: 'Listening. You will hear from kuhu only when there is something to say.',
    notify_off_ok: 'Quiet. kuhu will not send you anything.',
    upcoming: 'Coming up',
    none_upcoming: 'Nothing scheduled. Everything, for now, intends to keep working.',
    pick_one: 'Pick at least one area first.',
    push_denied: 'Notifications are blocked for this site in your browser settings.',
    push_unsupported: 'This browser cannot receive notifications. The list above still works.',
    // poster face
    post_title: 'Post a notice',
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
    kind: 'Kind of notice',
    publish: 'Publish notice',
    published: 'Posted. The area has been told.',
    published_many: 'Posted to {n} areas. Everyone has been told once.',
    your_notices: 'Recent notices',
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
    role_poster: 'a poster',
    role_service_admin: 'a service admin',
    role_site_admin: 'a site admin',
    // Button labels. The forms above are written for the sentence "Join X as
    // …", and reading "a poster" on a chip makes it look like a description
    // rather than something to tap.
    pick_poster: 'Poster',
    pick_service_admin: 'Service admin',
    pick_site_admin: 'Site admin',
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
    // services
    svc_no_areas: 'No areas yet for this service. Nothing to subscribe to until an admin adds some.',
    no_areas: 'No areas yet for this service. Ask an admin to add some.',
    no_areas_admin: 'No areas yet. Add them under "Areas we cover" below, then come back.',
    scope_site: 'You are a site admin: everything below covers every service.',
    scope_service: 'You are an admin for {service}. Everything below covers that service only.',
    services_title: 'Services',
    services_help: 'The kinds of thing kuhu carries notices about. Each brings its own words and its own areas.',
    add_service: 'Add a service',
    svc_en: 'Name in English',
    svc_hi: 'नाम (हिंदी)',
    svc_icon: 'Icon',
    svc_slug: 'Short id (permanent)',
    svc_kinds: 'Kinds of notice',
    svc_kinds_help: 'What this service can announce — "No supply", "Tanker coming". Both languages, because a notice is shown in whichever the reader chose.',
    svc_areas: 'Areas',
    svc_areas_help: 'The parts of the map this service divides into. A service with no areas cannot be subscribed to or posted about, so give it at least one — you can add more later.',
    svc_reasons: 'Reason presets',
    svc_reasons_help: 'Common reasons, offered as one tap so nobody types in the rain. Optional.',
    add_row: 'Add another',
    save_service: 'Create service',
    service_added: 'Service created, with a crew ready to be invited into.',
    need_kind: 'A service needs at least one kind of notice.',
    invite_where: 'Into which',
    invite_which_service: 'Into which service',
    invite_which_crew: 'Into which crew',
    service: 'Service',
    no_service: 'Your team is not attached to a service yet. Ask an admin.',
    coverage_title: 'Areas',
    coverage_for: 'Areas · {service}',
    coverage_help: 'These belong to {service}. Tap one to add or remove it from what your crew answers for.',
    geography_title: 'All areas in {service}',
    geography_help: 'Each service divides the map its own way — electricity feeders are not water zones. Areas added here belong to this service alone.',
    // theme
    theme_auto: 'Theme: follows your phone',
    theme_light: 'Theme: light',
    theme_dark: 'Theme: dark',
    // admin structure
    people: 'People',
    this_phone: 'This phone',
    // other ways to hear
    foot_repo: 'Source on GitHub',
    foot_site: 'About kuhu',
    foot_help: 'Help',
    // areas as a tree
    whole_region: 'All of it',
    whole_region_note: 'The whole region is selected, so every area inside it is included — including any added later. Tap "All of it" again to pick areas one by one.',
    area_inside: 'Inside',
    area_inside_help: 'Leave this alone for a normal area. Pick something to nest this one inside it — that is what turns the outer one into a region.',
    inside_nothing: '— nothing, it stands on its own —',
    inside_of: 'inside {region}',
    nest: 'Move',
    save_nesting: 'Save',
    nesting_saved: 'Moved.',
    // qr
    qr_invite_hint: 'Standing next to them? Let them scan this instead of sending anything.',
    qr_move_hint: 'Open kuhu on the new phone, tap Scan a code, and point it at this.',
    qr_alt: 'QR code for the invite link',
    scan_open: 'Scan a code',
    scan_hint: 'Point the camera at the QR code',
    scan_denied: 'kuhu needs camera permission to scan. You can still paste the link below.',
    scan_nocam: 'No camera found on this phone. Paste the link below instead.',
    scan_busy: 'The camera is busy in another app. Close it and try again.',
    scan_failed: 'The camera would not start. Paste the link below instead.',
    scan_notlink: 'That code is not a kuhu invite link.',
    // help
    help_title: 'How kuhu works',
    help_lede_poster: 'A short guide to posting notices. Two minutes, and you have it.',
    help_lede_service_admin: 'A short guide to running your service — your crew, your areas, your notices.',
    help_lede_site_admin: 'A short guide to running kuhu — services, people, and what not to break.',
    help_lede_anon: 'Sign in and this page shows the guide for whatever you do here.',
    help_signed_out: 'Signed out',
    help_signed_out_body: 'The team guides open once you sign in — you are shown the one for your own role, and only that one.',
    help_everyone: 'For everyone',
    help_guide_poster: 'Posting',
    help_guide_service_admin: 'Running a service',
    help_guide_site_admin: 'Running kuhu',
    help_pick: 'You can read:',
    other_ways: 'Other ways to know',
    tg_note: 'Prefer Telegram? Every notice is posted to the channel too — no app, no notifications to allow.',
    tg_join: 'Join the Telegram channel',
    devices_title: 'For devices and tinkerers',
    devices_note: 'Notices are published as retained MQTT on kuhu/<service>/<area>/notices, and served as plain JSON at /api/services/<service>/areas/<area>/notices — no key, no account. Inverters, home automations, and the other machines in the lab can read either.',
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
    wa_message: 'Join the {team} notices on kuhu. Tap here — the link works once: {url}',
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
    last_admin: 'That is the last site admin — make someone else one first.',
    areas_admin: 'Areas',
    add_area: 'Add an area',
    area_slug: 'Short id (permanent)',
    area_slug_help: 'Lowercase letters, numbers, hyphens. Used in web addresses and must be unique across kuhu, so it cannot be changed later.',
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
    sub_title: 'होने से पहले जानिए।',
    sub_lede: 'जिस चीज़ की चेतावनी चाहिए वह चुनिए। होने से पहले एक शांत सूचना मिलेगी — और उसके अलावा कभी कुछ नहीं।',
    your_areas: 'आपके इलाके',
    notify_me: 'मुझे सूचित करें',
    notify_off: 'सूचनाएँ बंद करें',
    notify_on_ok: 'सुन रहे हैं। ज़रूरत होने पर ही kuhu बोलेगा।',
    notify_off_ok: 'शांत। अब kuhu कुछ नहीं भेजेगा।',
    upcoming: 'आगे',
    none_upcoming: 'फ़िलहाल कुछ तय नहीं है। सब कुछ, अभी के लिए, चलता रहना चाहता है।',
    pick_one: 'पहले कम से कम एक इलाका चुनिए।',
    push_denied: 'आपके ब्राउज़र में इस साइट की सूचनाएँ बंद हैं।',
    push_unsupported: 'यह ब्राउज़र सूचनाएँ नहीं ले सकता। ऊपर की सूची फिर भी काम करती है।',
    post_title: 'सूचना डालें',
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
    kind: 'सूचना किस बारे में',
    publish: 'सूचना भेजें',
    published: 'भेज दी गई। इलाके को पता चल गया है।',
    published_many: '{n} इलाकों में भेज दी गई। सबको एक बार पता चल गया है।',
    your_notices: 'हाल की सूचनाएँ',
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
    role_poster: 'सूचना डालने वाले',
    role_service_admin: 'सेवा एडमिन',
    role_site_admin: 'साइट एडमिन',
    pick_poster: 'सूचना डालने वाला',
    pick_service_admin: 'सेवा एडमिन',
    pick_site_admin: 'साइट एडमिन',
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
    svc_no_areas: 'इस सेवा में अभी कोई इलाका नहीं है। जब तक एडमिन जोड़ें, यहाँ कुछ चुनने को नहीं है।',
    no_areas: 'इस सेवा में अभी कोई इलाका नहीं है। एडमिन से जोड़ने को कहिए।',
    no_areas_admin: 'अभी कोई इलाका नहीं है। नीचे "हमारे इलाके" में जोड़िए, फिर वापस आइए।',
    scope_site: 'आप साइट एडमिन हैं: नीचे सब कुछ सभी सेवाओं के लिए है।',
    scope_service: 'आप {service} के एडमिन हैं। नीचे सब कुछ सिर्फ़ उसी सेवा के लिए है।',
    services_title: 'सेवाएँ',
    services_help: 'kuhu जिन चीज़ों की सूचना देता है। हर सेवा के अपने शब्द और अपने इलाके होते हैं।',
    add_service: 'नई सेवा जोड़ें',
    svc_en: 'Name in English',
    svc_hi: 'नाम (हिंदी)',
    svc_icon: 'चिह्न',
    svc_slug: 'छोटी आईडी (हमेशा के लिए)',
    svc_kinds: 'सूचना के प्रकार',
    svc_kinds_help: 'यह सेवा क्या बता सकती है — "पानी नहीं आएगा", "टैंकर आएगा"। दोनों भाषाओं में, क्योंकि सूचना उसी भाषा में दिखती है जो पढ़ने वाले ने चुनी है।',
    svc_areas: 'इलाके',
    svc_areas_help: 'यह सेवा नक्शे को जिन हिस्सों में बाँटती है। बिना इलाके की सेवा में न कोई जुड़ सकता है न सूचना जा सकती है — कम से कम एक दीजिए, बाकी बाद में जुड़ सकते हैं।',
    svc_reasons: 'तैयार वजहें',
    svc_reasons_help: 'आम वजहें, एक दबाने पर — ताकि बारिश में कुछ लिखना न पड़े। ज़रूरी नहीं।',
    add_row: 'एक और जोड़ें',
    save_service: 'सेवा बनाएँ',
    service_added: 'सेवा बन गई, और उसमें बुलाने के लिए एक टीम भी तैयार है।',
    need_kind: 'सेवा में कम से कम एक प्रकार की सूचना होनी चाहिए।',
    invite_where: 'कहाँ',
    invite_which_service: 'किस सेवा में',
    invite_which_crew: 'किस टीम में',
    service: 'सेवा',
    no_service: 'आपकी टीम अभी किसी सेवा से नहीं जुड़ी है। एडमिन से कहिए।',
    coverage_title: 'इलाके',
    coverage_for: 'इलाके · {service}',
    coverage_help: 'ये {service} के इलाके हैं। अपनी टीम की ज़िम्मेदारी में जोड़ने या हटाने के लिए दबाइए।',
    geography_title: '{service} के सारे इलाके',
    geography_help: 'हर सेवा नक्शे को अपने हिसाब से बाँटती है — बिजली के फ़ीडर और पानी के ज़ोन एक जैसे नहीं होते। यहाँ जोड़े गए इलाके सिर्फ़ इसी सेवा के हैं।',
    theme_auto: 'रंग: फ़ोन के अनुसार',
    theme_light: 'रंग: हल्का',
    theme_dark: 'रंग: गहरा',
    people: 'लोग',
    this_phone: 'यह फ़ोन',
    foot_repo: 'GitHub पर कोड',
    foot_site: 'kuhu के बारे में',
    foot_help: 'मदद',
    // areas as a tree
    whole_region: 'पूरा इलाका',
    whole_region_note: 'पूरा क्षेत्र चुना हुआ है, इसलिए उसके अंदर के सारे इलाके शामिल हैं — बाद में जोड़े गए भी। एक-एक इलाका चुनना हो तो "पूरा इलाका" दोबारा दबाइए।',
    area_inside: 'किसके अंदर',
    area_inside_help: 'सामान्य इलाके के लिए इसे ऐसे ही छोड़ दीजिए। कुछ चुनेंगे तो यह इलाका उसके अंदर आ जाएगा — इसी से बाहर वाला "क्षेत्र" बनता है।',
    inside_nothing: '— किसी के अंदर नहीं —',
    inside_of: '{region} के अंदर',
    nest: 'हटाएँ-जोड़ें',
    save_nesting: 'सहेजें',
    nesting_saved: 'हो गया।',
    // qr
    qr_invite_hint: 'सामने ही खड़े हैं? कुछ भेजने की बजाय उन्हें यही स्कैन करने दीजिए।',
    qr_move_hint: 'नए फ़ोन पर kuhu खोलिए, कोड स्कैन करें दबाइए, और इसकी तरफ़ कैमरा कीजिए।',
    qr_alt: 'निमंत्रण लिंक का QR कोड',
    scan_open: 'कोड स्कैन करें',
    scan_hint: 'कैमरा QR कोड की तरफ़ कीजिए',
    scan_denied: 'स्कैन करने के लिए kuhu को कैमरे की अनुमति चाहिए। नीचे लिंक चिपकाया भी जा सकता है।',
    scan_nocam: 'इस फ़ोन में कैमरा नहीं मिला। नीचे लिंक चिपका दीजिए।',
    scan_busy: 'कैमरा किसी और ऐप में चल रहा है। उसे बंद करके फिर कोशिश कीजिए।',
    scan_failed: 'कैमरा शुरू नहीं हो पाया। नीचे लिंक चिपका दीजिए।',
    scan_notlink: 'यह कोड kuhu का निमंत्रण लिंक नहीं है।',
    // help
    help_title: 'kuhu कैसे चलता है',
    help_lede_poster: 'सूचना डालने की छोटी-सी गाइड। दो मिनट, और बात समझ आ जाएगी।',
    help_lede_service_admin: 'अपनी सेवा चलाने की छोटी-सी गाइड — आपकी टीम, आपके इलाके, आपकी सूचनाएँ।',
    help_lede_site_admin: 'kuhu चलाने की छोटी-सी गाइड — सेवाएँ, लोग, और क्या न तोड़ें।',
    help_lede_anon: 'साइन इन कीजिए, और यह पन्ना आपके काम की गाइड दिखा देगा।',
    help_signed_out: 'साइन आउट हैं',
    help_signed_out_body: 'टीम की गाइड साइन इन करने पर खुलती हैं — आपको अपने काम की गाइड दिखती है, सिर्फ़ वही।',
    help_everyone: 'सबके लिए',
    help_guide_poster: 'सूचना डालना',
    help_guide_service_admin: 'सेवा चलाना',
    help_guide_site_admin: 'kuhu चलाना',
    help_pick: 'आप पढ़ सकते हैं:',
    other_ways: 'जानने के और तरीके',
    tg_note: 'Telegram ज़्यादा सुविधाजनक है? हर सूचना चैनल पर भी जाती है — न ऐप, न सूचनाओं की अनुमति।',
    tg_join: 'Telegram चैनल से जुड़ें',
    devices_title: 'उपकरणों और शौक़ीनों के लिए',
    devices_note: 'सूचनाएँ kuhu/<service>/<area>/notices पर retained MQTT के रूप में और /api/services/<service>/areas/<area>/notices पर सादे JSON में मिलती हैं — न चाबी, न खाता। इन्वर्टर, होम ऑटोमेशन और लैब की बाक़ी मशीनें दोनों पढ़ सकती हैं।',
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
    wa_message: '{team} की सूचनाओं से जुड़िए — kuhu पर। यहाँ दबाइए, लिंक एक ही बार चलेगा: {url}',
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
    last_admin: 'यह आख़िरी साइट एडमिन हैं — पहले किसी और को बनाइए।',
    areas_admin: 'इलाके',
    add_area: 'नया इलाका जोड़ें',
    area_slug: 'छोटी आईडी (हमेशा के लिए)',
    area_slug_help: 'अंग्रेज़ी के छोटे अक्षर, अंक, हाइफ़न। वेब पते में इस्तेमाल होती है और पूरे kuhu में अलग होनी चाहिए — बाद में बदली नहीं जा सकती।',
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


/**
 * Pull an invite token out of whatever the person pasted — a whole link, a
 * link with a ?t= query, or the bare token on its own. Tokens are base64url
 * from 24 random bytes, so 32 chars of that alphabet.
 */
/**
 * Nest a flat area list by `parent`. Areas whose parent is not in the list
 * become roots, which is what you want when coverage hands you a child but not
 * the region above it.
 */
export function regionTree(regions) {
  const nodes = new Map((regions || []).map((r) => [r.slug, { ...r, children: [] }]));
  const roots = [];
  for (const n of nodes.values()) {
    const parent = n.parent ? nodes.get(n.parent) : null;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

/** Every leaf at or below a node — where a notice can actually land. */
export function leavesOf(node) {
  if (!node.children.length) return [node];
  return node.children.flatMap(leavesOf);
}

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

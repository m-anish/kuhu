// MQTT 3.1.1 packet encoding — pure functions, no I/O.
//
// Kept separate from mqtt.js so it can be exercised outside the Workers
// runtime: mqtt.js imports `cloudflare:sockets`, which Node refuses to load,
// and an encoder nobody can test is an encoder nobody should trust.

const enc = new TextEncoder();

/** MQTT's variable-length integer: 7 bits per byte, high bit = "more follows". */
export function encodeLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

/** A UTF-8 string, length-prefixed with two big-endian bytes. */
export function encodeString(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
}

export function buildConnect({ clientId, username, password, keepalive = 30 }) {
  let flags = 0x02;                                  // clean session
  if (username) flags |= 0x80;
  if (password) flags |= 0x40;
  const variable = [
    ...encodeString('MQTT'),
    4,                                               // protocol level 3.1.1
    flags,
    keepalive >> 8, keepalive & 0xff,
  ];
  const payload = [
    ...encodeString(clientId),
    ...(username ? encodeString(username) : []),
    ...(password ? encodeString(password) : []),
  ];
  const body = [...variable, ...payload];
  return new Uint8Array([0x10, ...encodeLength(body.length), ...body]);
}

export function buildPublish(topic, payload, { retain = true } = {}) {
  const body = [...encodeString(topic), ...enc.encode(payload)];
  const header = 0x30 | (retain ? 0x01 : 0x00);      // QoS 0, no dup
  return new Uint8Array([header, ...encodeLength(body.length), ...body]);
}

export const DISCONNECT = new Uint8Array([0xe0, 0x00]);

/**
 * `kuhu/<service>/<area>/notices` — one retained payload per service per area.
 * The service is in the path so a device can subscribe to exactly what it
 * cares about (`kuhu/electricity/+/notices`), and "notices" rather than "cuts"
 * because a cut is an electricity word and this tree is not only electricity.
 */
export function topicFor(service, area) {
  return `kuhu/${service}/${area}/notices`;
}

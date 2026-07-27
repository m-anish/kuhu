// A very small MQTT 3.1.1 publisher, so the gadgets can be told rather than
// having to ask.
//
// Workers can open raw TCP, so this speaks the protocol directly instead of
// pulling in a library: CONNECT → CONNACK → PUBLISH → DISCONNECT, QoS 0,
// retained. Retained matters — a device that boots at midday should learn
// about this afternoon's cut without waiting for the next one to be posted.
//
// Packet encoding lives in mqtt-packets.js so it can be tested outside the
// Workers runtime. This file is only the socket conversation.
//
// Configure with:
//   MQTT_URL = "mqtts://broker.example:8883"   in wrangler.toml [vars]
//   wrangler secret put MQTT_USERNAME
//   wrangler secret put MQTT_PASSWORD
//
// Unset = silently disabled. The JSON API remains the canonical contract;
// this is a courtesy for things that would rather be told than poll.

import { connect } from 'cloudflare:sockets';
import { buildConnect, buildPublish, DISCONNECT } from './mqtt-packets.js';

export { topicFor } from './mqtt-packets.js';

/**
 * Publish a batch of [topic, payload] pairs over one connection.
 * Fire-and-forget: a sulking broker must never fail a notice.
 */
export async function publishMqtt(env, messages) {
  if (!env.MQTT_URL || messages.length === 0) return { skipped: true };

  let socket;
  try {
    const url = new URL(env.MQTT_URL);
    const secure = url.protocol === 'mqtts:' || url.protocol === 'ssl:';
    socket = connect(
      { hostname: url.hostname, port: Number(url.port) || (secure ? 8883 : 1883) },
      secure ? { secureTransport: 'on' } : {},
    );

    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    await writer.write(buildConnect({
      clientId: `kuhu-${Math.random().toString(36).slice(2, 10)}`,
      username: env.MQTT_USERNAME,
      password: env.MQTT_PASSWORD,
    }));

    // CONNACK is 4 bytes: 0x20 0x02 <flags> <return code>; 0 means accepted.
    const { value: ack } = await reader.read();
    if (!ack || ack[0] !== 0x20 || ack[3] !== 0x00) {
      throw new Error(`connack ${ack ? ack[3] : 'none'}`);
    }

    for (const [topic, payload] of messages) {
      await writer.write(buildPublish(topic, payload));
    }
    await writer.write(DISCONNECT);
    await writer.close();
    return { ok: true, published: messages.length };
  } catch (err) {
    console.error('mqtt', err.message);
    return { ok: false };
  } finally {
    try { await socket?.close(); } catch { /* already gone */ }
  }
}

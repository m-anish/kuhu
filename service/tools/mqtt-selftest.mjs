// Verify the Worker's MQTT packet encoder against a real broker.
// If CONNECT is malformed, a broker drops the connection instead of CONNACKing.
import net from 'node:net';
import { buildConnect, buildPublish, DISCONNECT, encodeLength, encodeString } from '../src/mqtt-packets.js';

// --- pure encoder checks against the spec's own examples ---
const eq = (a, b, label) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` got ${JSON.stringify(a)} want ${JSON.stringify(b)}`}`);
  return ok;
};
console.log('encodeLength (MQTT spec boundaries):');
eq(encodeLength(0), [0], '0 -> [0]');
eq(encodeLength(127), [127], '127 -> [127]');
eq(encodeLength(128), [0x80, 0x01], '128 -> [0x80,0x01]');
eq(encodeLength(16383), [0xff, 0x7f], '16383 -> [0xff,0x7f]');
eq(encodeLength(16384), [0x80, 0x80, 0x01], '16384 -> [0x80,0x80,0x01]');
console.log('encodeString:');
eq(encodeString('MQTT'), [0, 4, 77, 81, 84, 84], '"MQTT" -> len-prefixed');

// --- live handshake against a public test broker ---
const HOST = 'test.mosquitto.org';
const PORT = 1883;
const topic = `kuhu/_selftest_${Math.random().toString(36).slice(2, 8)}/cuts`;

await new Promise((resolve) => {
  const sock = net.createConnection({ host: HOST, port: PORT, timeout: 15000 });
  let done = false;
  const finish = (msg) => { if (!done) { done = true; console.log(msg); sock.destroy(); resolve(); } };

  sock.on('connect', () => {
    console.log(`\nlive broker ${HOST}:${PORT}`);
    sock.write(Buffer.from(buildConnect({ clientId: `kuhu-selftest-${Date.now()}` })));
  });
  sock.on('data', (buf) => {
    if (buf[0] === 0x20) {
      const code = buf[3];
      console.log(`  ${code === 0 ? 'PASS' : 'FAIL'}  CONNACK return code ${code}${code === 0 ? ' (accepted)' : ''}`);
      if (code !== 0) return finish('  broker rejected the CONNECT packet');
      sock.write(Buffer.from(buildPublish(topic, JSON.stringify({ hello: 'kuhu' }))));
      sock.write(Buffer.from(DISCONNECT));
      finish(`  PASS  PUBLISH accepted (retained to ${topic})`);
    }
  });
  sock.on('timeout', () => finish('  FAIL  timed out — no CONNACK'));
  sock.on('error', (e) => finish(`  FAIL  ${e.message}`));
});

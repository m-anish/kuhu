// Camera QR scanning, for the one case the phone's own camera app cannot fix.
//
// Pointing the normal camera app at an invite QR works fine and opens the
// link — in *Safari*. On iOS a Home Screen app has its own storage, so a token
// that lands in Safari is invisible to the installed kuhu, which is the bug
// the paste-a-link box already exists to work around. Scanning from inside the
// app puts the token where it is actually needed.
//
// Two decoders, in order of preference:
//   BarcodeDetector — native, instant, costs nothing. Chrome/Android.
//   jsQR — vendored, ~47 KB gzipped, fetched only when the native one is
//           missing, which in practice means iOS: exactly the case above.
//
// Scanned text is never navigated to. It is handed to parseInviteToken, which
// yields a token or nothing — so a QR code found on a wall cannot send anyone
// anywhere. The server still has to agree the token is real.

let jsQR = null;

export function scanSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;
}

/** Reason a scan could not start, as a string key the caller can translate. */
function reasonFor(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'scan_denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'scan_nocam';
  if (name === 'NotReadableError') return 'scan_busy';
  return 'scan_failed';
}

/**
 * Open a full-screen scanner. Resolves with the decoded string, or null if the
 * person backed out. Rejects only with a translatable reason key.
 *
 * @param {(key: string) => string} t
 */
export function openScanner(t) {
  return new Promise((resolve, reject) => {
    const root = document.createElement('div');
    root.className = 'scanner';
    root.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="scan-frame" aria-hidden="true"></div>
      <p class="scan-hint"></p>
      <button type="button" class="big ghost scan-cancel"></button>`;
    root.querySelector('.scan-hint').textContent = t('scan_hint');
    root.querySelector('.scan-cancel').textContent = t('cancel');

    const video = root.querySelector('video');
    let stream = null;
    let raf = 0;
    let done = false;

    const stop = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      // Release the camera. Forgetting this leaves the indicator lit and the
      // camera locked against every other app until the tab is closed.
      for (const track of stream?.getTracks() || []) track.stop();
      video.srcObject = null;
      root.remove();
      document.removeEventListener('keydown', onKey);
    };

    const finish = (text) => { stop(); resolve(text); };
    const onKey = (e) => { if (e.key === 'Escape') { stop(); resolve(null); } };

    root.querySelector('.scan-cancel').addEventListener('click', () => { stop(); resolve(null); });
    document.addEventListener('keydown', onKey);
    document.body.append(root);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (err) {
        stop();
        reject(new Error(reasonFor(err)));
        return;
      }

      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay policies; the frames still arrive */ }

      // Native first. Constructing it can throw where the API exists but QR is
      // not among the supported formats, so treat any failure as absence.
      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch { detector = null; }
      }

      let canvas = null;
      let ctx = null;
      if (!detector) {
        if (!jsQR) ({ default: jsQR } = await import('/vendor/jsqr.js'));
        if (done) return;                    // cancelled during the download
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d', { willReadFrequently: true });
      }

      const tick = async () => {
        if (done) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            if (detector) {
              const found = await detector.detect(video);
              if (found.length && found[0].rawValue) return finish(found[0].rawValue);
            } else {
              // Downscale: decoding is O(pixels), and a QR filling a third of
              // the frame is still comfortably readable at 480px wide.
              const w = Math.min(480, video.videoWidth);
              const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const got = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
              if (got?.data) return finish(got.data);
            }
          } catch { /* a bad frame is not a failure; the next one comes in 16ms */ }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
  });
}

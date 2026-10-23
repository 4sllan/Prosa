const { randomUUID } = require('node:crypto');
const { isTrustedAppUrl } = require('./permissions.cjs');

function createScreenSharingHandler({
  appUrl, isAppWebContents, fromFrame, desktopCapturer, platform, systemPreferences,
  setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const pending = new WeakMap();
  const options = { types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } };

  function trusted(sender, frame) {
    try {
      return !!sender && !sender.isDestroyed() && isAppWebContents(sender)
        && !!frame && !frame.detached && frame === sender.mainFrame
        && isTrustedAppUrl(frame.url, appUrl);
    } catch { return false; }
  }

  function permissionError() {
    if (platform !== 'darwin') return null;
    const status = systemPreferences.getMediaAccessStatus('screen');
    return status === 'denied' ? 'permission-denied'
      : status === 'restricted' ? 'permission-restricted' : null;
  }

  function active(entry) {
    return pending.get(entry.sender) === entry;
  }

  function send(entry, channel, payload) {
    if (!trusted(entry.sender, entry.frame)) return false;
    entry.frame.send(channel, payload);
    return true;
  }

  function finish(entry, status, code, source, notify = true) {
    if (!active(entry)) return;
    pending.delete(entry.sender);
    clearTimer(entry.timer);
    for (const [event, listener] of entry.listeners) entry.sender.removeListener(event, listener);
    entry.sources.clear();
    const callback = entry.callback;
    entry.callback = null;
    try {
      if (notify) send(entry, 'media:screen-result', { requestId: entry.id, status, code: code || null });
    } catch {} // A renderer can disappear between validation and sending.
    callback(source ? { video: source } : {});
  }

  function fail(entry) {
    if (!active(entry)) return;
    let code = 'capture-failed';
    try { code = permissionError() || code; } catch {}
    finish(entry, 'error', code);
  }

  async function enumerate(entry) {
    try {
      const code = permissionError();
      if (code) { finish(entry, 'error', code); return; }
      const sources = await desktopCapturer.getSources(options);
      if (!active(entry)) return;
      if (!trusted(entry.sender, entry.frame)) {
        finish(entry, 'cancelled', null, null, false);
        return;
      }
      const list = sources.slice(0, 128).map(source => {
        const id = randomUUID();
        entry.sources.set(id, source);
        return {
          id, name: String(source.name).slice(0, 512),
          thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
        };
      });
      if (!list.length) { finish(entry, 'error', 'no-sources'); return; }
      if (!send(entry, 'media:screen-request', { requestId: entry.id, sources: list })) {
        finish(entry, 'cancelled', null, null, false);
      }
    } catch { fail(entry); }
  }

  function request(details, callback) {
    const frame = details?.frame;
    let sender;
    try { sender = frame && fromFrame(frame); } catch {}
    if (!trusted(sender, frame) || details.userGesture !== true
      || details.videoRequested !== true || details.audioRequested === true || pending.has(sender)) {
      callback({});
      return;
    }
    const entry = {
      id: randomUUID(), sender, frame, callback, sources: new Map(), listeners: [], selecting: false,
    };
    pending.set(sender, entry);
    const cancelOnExit = () => finish(entry, 'cancelled', null, null, false);
    const navigate = (event, _url, _inPlace, isMainFrame) => {
      if (event.isMainFrame ?? isMainFrame) cancelOnExit();
    };
    entry.listeners = [
      ['did-start-navigation', navigate], ['destroyed', cancelOnExit],
      ['render-process-gone', cancelOnExit],
    ];
    for (const [event, listener] of entry.listeners) sender.on(event, listener);
    entry.timer = setTimer(() => finish(entry, 'error', 'timeout'), 60_000);
    void enumerate(entry);
  }

  function authorize(event) {
    if (!trusted(event?.sender, event?.senderFrame)) {
      throw new Error('Screen sharing request not allowed');
    }
  }

  async function respond(event, ...args) {
    authorize(event);
    const payload = args[0];
    const token = value => typeof value === 'string' && value.length > 0 && value.length <= 64;
    if (args.length !== 1 || !payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== 2
      || !Object.keys(payload).every(key => key === 'requestId' || key === 'sourceId')
      || !token(payload.requestId)
      || !(payload.sourceId === null || token(payload.sourceId))) {
      throw new Error('Invalid screen sharing response');
    }
    const entry = pending.get(event.sender);
    if (!entry || entry.frame !== event.senderFrame || entry.id !== payload.requestId) return false;
    if (payload.sourceId === null) { finish(entry, 'cancelled'); return true; }
    if (entry.selecting) return false;
    const source = entry.sources.get(payload.sourceId);
    if (!source) { finish(entry, 'error', 'source-unavailable'); return false; }
    entry.selecting = true;
    try {
      // Re-enumerate: the selected window may have closed while the picker was open.
      const sources = await desktopCapturer.getSources(options);
      if (!active(entry)) return false;
      if (!trusted(entry.sender, entry.frame)) {
        finish(entry, 'cancelled', null, null, false);
        return false;
      }
      const current = sources.find(item => item.id === source.id);
      const code = permissionError();
      if (code || !current) {
        finish(entry, 'error', code || 'source-unavailable');
        return false;
      }
      finish(entry, 'selected', null, current);
      return true;
    } catch { fail(entry); return false; }
  }

  function cancel(event, ...args) {
    authorize(event);
    if (args.length) throw new Error('Invalid screen sharing cancellation');
    const entry = pending.get(event.sender);
    if (!entry || entry.frame !== event.senderFrame) return false;
    finish(entry, 'cancelled');
    return true;
  }

  return { request, respond, cancel };
}

module.exports = { createScreenSharingHandler };

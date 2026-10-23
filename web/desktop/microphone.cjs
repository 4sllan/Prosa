const { isTrustedAppUrl } = require('./permissions.cjs');

function createMicrophoneAccessHandler({ platform, systemPreferences, appUrl, isAppWebContents }) {
  let pending = null;

  return async (event, ...args) => {
    const sender = event?.sender;
    const frame = event?.senderFrame;
    if (args.length || !sender || sender.isDestroyed() || !isAppWebContents(sender)
      || !frame || frame.detached || frame !== sender.mainFrame
      || !isTrustedAppUrl(frame.url, appUrl)) {
      throw new Error('Microphone access request not allowed');
    }
    if (platform !== 'darwin') return { status: 'not-applicable' };

    // Share only the in-flight operation; later attempts must query macOS again.
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        const status = systemPreferences.getMediaAccessStatus('microphone');
        if (status === 'not-determined') {
          const granted = await systemPreferences.askForMediaAccess('microphone');
          return { status: granted === true ? 'granted' : granted === false ? 'denied' : 'unknown' };
        }
        return { status: ['granted', 'denied', 'restricted'].includes(status) ? status : 'unknown' };
      }).catch(() => {
        throw new Error('Microphone authorization failed');
      }).finally(() => { pending = null; });
    }
    return pending;
  };
}

module.exports = { createMicrophoneAccessHandler };

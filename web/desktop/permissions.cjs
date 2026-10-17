const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'notifications', 'mediaKeySystem', 'fullscreen']);

function canUsePermission(permission, details, appUrl) {
  if (permission !== 'clipboard-sanitized-write') return ALLOWED_PERMISSIONS.has(permission);
  if (!details?.isMainFrame) return false;
  try {
    const requester = new URL(details.requestingUrl);
    const trusted = new URL(appUrl);
    if (trusted.protocol === 'file:') {
      return requester.protocol === 'file:' && requester.host === trusted.host
        && requester.pathname === trusted.pathname;
    }
    return ['http:', 'https:'].includes(trusted.protocol) && requester.origin === trusted.origin;
  } catch { return false; }
}

module.exports = { canUsePermission };

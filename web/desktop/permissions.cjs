const ALLOWED_PERMISSIONS = new Set(['media', 'display-capture', 'notifications', 'mediaKeySystem', 'fullscreen']);

function isTrustedAppUrl(url, appUrl) {
  try {
    const requester = new URL(url);
    const trusted = new URL(appUrl);
    if (trusted.protocol === 'file:') {
      return requester.protocol === 'file:' && requester.host === trusted.host
        && requester.pathname === trusted.pathname;
    }
    return ['http:', 'https:'].includes(trusted.protocol) && requester.origin === trusted.origin;
  } catch { return false; }
}

function canUsePermission(permission, details, appUrl) {
  if (permission !== 'clipboard-sanitized-write') return ALLOWED_PERMISSIONS.has(permission);
  return !!details?.isMainFrame && isTrustedAppUrl(details.requestingUrl, appUrl);
}

module.exports = { canUsePermission, isTrustedAppUrl };

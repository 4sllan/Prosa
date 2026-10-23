// providers/server.js — implementação do Service Layer sobre o backend atual.
// REST (api.js) para operações + WS (realtime.js) para eventos/sinalização.
// Comportamento idêntico ao anterior; trocar de provider não muda os callers.
import { api, uploadFiles } from '../../api.js';
import { wsSend, onWs } from '../realtime.js';

export function createServerProvider() {
  return {
    mode: 'server',

    config: {
      get: () => api('/config'),
    },

    auth: {
      login: (login, password) => api('/auth/login', { method: 'POST', body: { login, password } }),
      register: (username, email, password) => api('/auth/register', { method: 'POST', body: { username, email, password } }),
      logout: () => api('/auth/logout', { method: 'POST' }),
      requestPasswordReset: (email) => api('/auth/password/request', { method: 'POST', body: { email } }),
      confirmPasswordReset: (token, password) => api('/auth/password/confirm', { method: 'POST', body: { token, password } }),
    },

    users: {
      me: () => api('/users/@me'),
      get: (userId) => api(`/users/${userId}`),
      updateProfile: (body) => api('/users/@me', { method: 'PATCH', body }),
      setPresence: (presence) => api('/users/@me/presence', { method: 'PATCH', body: { presence } }),
      changePassword: (current, next) => api('/users/@me/password', { method: 'PATCH', body: { current, next } }),
      presences: () => api('/users/@me/presences'),
    },

    contacts: {
      list: () => api('/users/@me/relationships'),
      request: (username) => api('/users/@me/relationships', { method: 'POST', body: { username } }),
      accept: (userId) => api(`/users/@me/relationships/${userId}/accept`, { method: 'POST' }),
      remove: (userId) => api(`/users/@me/relationships/${userId}`, { method: 'DELETE' }),
      block: (userId) => api(`/users/@me/relationships/${userId}/block`, { method: 'POST' }),
      unblock: (userId) => api(`/users/@me/relationships/${userId}/block`, { method: 'DELETE' }),
    },

    communities: {
      list: () => api('/communities'),
      get: (id) => api(`/communities/${id}`),
      create: (body) => api('/communities', { method: 'POST', body }),
      update: (id, body) => api(`/communities/${id}`, { method: 'PATCH', body }),
      delete: (id) => api(`/communities/${id}`, { method: 'DELETE' }),
      leave: (id) => api(`/communities/${id}/leave`, { method: 'POST' }),
      invites: (id) => api(`/communities/${id}/invites`),
      createInvite: (id, body = {}) => api(`/communities/${id}/invites`, { method: 'POST', body }),
      revokeInvite: (id, code) => api(`/communities/${id}/invites/${code}`, { method: 'DELETE' }),
      acceptInvite: (code) => api(`/communities/invite/${code}/accept`, { method: 'POST' }),
      inviteMember: () => { throw new Error('communities.inviteMember indisponível no modo server'); },
      kick: (id, uid) => api(`/communities/${id}/members/${uid}/kick`, { method: 'POST' }),
      ban: (id, uid, body = {}) => api(`/communities/${id}/members/${uid}/ban`, { method: 'POST', body }),
      unban: (id, uid) => api(`/communities/${id}/bans/${uid}`, { method: 'DELETE' }),
      bans: (id) => api(`/communities/${id}/bans`),
      setRole: (id, uid, role) => api(`/communities/${id}/members/${uid}`, { method: 'PATCH', body: { role } }),
      auditLog: (id) => api(`/communities/${id}/audit-log`),
      createCategory: (id, body) => api(`/communities/${id}/categories`, { method: 'POST', body }),
      deleteCategory: (id, catId) => api(`/communities/${id}/categories/${catId}`, { method: 'DELETE' }),
      createChannel: (id, body) => api(`/communities/${id}/channels`, { method: 'POST', body }),
      updateChannel: (id, chId, body) => api(`/communities/${id}/channels/${chId}`, { method: 'PATCH', body }),
      deleteChannel: (id, chId) => api(`/communities/${id}/channels/${chId}`, { method: 'DELETE' }),
    },

    dms: {
      list: () => api('/dms'),
      open: (userId) => api(`/dms/open/${userId}`, { method: 'POST' }),
      createGroup: (body) => api('/dms/group', { method: 'POST', body }),
      leave: (chId) => api(`/dms/${chId}/leave`, { method: 'POST' }),
    },

    messages: {
      list: (chId, { before, limit } = {}) => {
        const qs = new URLSearchParams();
        if (before) qs.set('before', before);
        if (limit) qs.set('limit', String(limit));
        const q = qs.toString();
        return api(`/channels/${chId}/messages${q ? '?' + q : ''}`);
      },
      send: (chId, body) => api(`/channels/${chId}/messages`, { method: 'POST', body }),
      edit: (chId, mid, body) => api(`/channels/${chId}/messages/${mid}`, { method: 'PATCH', body }),
      delete: (chId, mid) => api(`/channels/${chId}/messages/${mid}`, { method: 'DELETE' }),
      pin: (chId, mid) => api(`/channels/${chId}/messages/${mid}/pin`, { method: 'POST' }),
      unpin: (chId, mid) => api(`/channels/${chId}/messages/${mid}/pin`, { method: 'DELETE' }),
      react: (chId, mid, emoji) => api(`/channels/${chId}/messages/${mid}/reactions/${encodeURIComponent(emoji)}`, { method: 'PUT' }),
      unreact: (chId, mid, emoji) => api(`/channels/${chId}/messages/${mid}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
      markRead: (chId, body = {}) => api(`/channels/${chId}/read`, { method: 'POST', body }),
      pins: (chId) => api(`/channels/${chId}/pins`),
      typing: (chId) => wsSend('TYPING', { channelId: chId }),
    },

    files: {
      upload: (list) => uploadFiles(list),
    },

    misc: {
      voiceState: (chId) => api(`/channels/${chId}/voice`),
      search: (q, channelId) => api(`/search?q=${encodeURIComponent(q)}${channelId ? `&channelId=${channelId}` : ''}`),
      report: (body) => api('/reports', { method: 'POST', body }),
    },

    admin: {
      users: () => api('/admin/users'),
      suspend: (uid) => api(`/admin/users/${uid}/suspend`, { method: 'POST' }),
      unsuspend: (uid) => api(`/admin/users/${uid}/unsuspend`, { method: 'POST' }),
      communities: () => api('/admin/communities'),
      reports: () => api('/admin/reports'),
      resolveReport: (id, status) => api(`/admin/reports/${id}/resolve`, { method: 'POST', body: { status } }),
      stats: () => api('/admin/stats'),
    },

    events: {
      send: (t, d) => wsSend(t, d),
      on: (type, fn) => onWs(type, fn),
      setPresence: (presence) => wsSend('PRESENCE_SET', { presence }),
      joinVoice: (channelId) => wsSend('VOICE_JOIN', { channelId }),
      leaveVoice: (channelId) => wsSend('VOICE_LEAVE', { channelId }),
      updateVoice: (channelId, state) => wsSend('VOICE_UPDATE', { channelId, state }),
      signal: (channelId, to, data) => wsSend('SIGNAL', { channelId, to, data }),
    },
  };
}

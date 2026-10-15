import { db } from './db.js';
import { forbidden, notFound } from './util.js';

export const ROLE_LEVEL = { member: 0, moderator: 1, admin: 2, owner: 3 };

export const ROLE_PERMS = {
  member: new Set(['send_messages', 'join_voice', 'create_invite', 'react']),
  moderator: new Set(['send_messages', 'join_voice', 'create_invite', 'react', 'kick_members', 'manage_messages', 'mute_members']),
  admin: new Set(['send_messages', 'join_voice', 'create_invite', 'react', 'kick_members', 'manage_messages', 'mute_members', 'manage_channels', 'ban_members', 'manage_community', 'view_audit_log']),
  owner: new Set(['send_messages', 'join_voice', 'create_invite', 'react', 'kick_members', 'manage_messages', 'mute_members', 'manage_channels', 'ban_members', 'manage_community', 'view_audit_log', 'delete_community', 'manage_roles']),
};

export function getMember(communityId, userId) {
  return db.prepare('SELECT * FROM members WHERE community_id = ? AND user_id = ?').get(communityId, userId);
}

export function getRole(communityId, userId) {
  return getMember(communityId, userId)?.role ?? null;
}

export function hasPerm(communityId, userId, perm) {
  const member = getMember(communityId, userId);
  if (!member) return false;
  if (member.role === 'owner') return true;
  return ROLE_PERMS[member.role]?.has(perm) ?? false;
}

export function requirePerm(communityId, userId, perm) {
  const member = getMember(communityId, userId);
  if (!member) throw notFound('Comunidade não encontrada');
  if (member.role !== 'owner' && !ROLE_PERMS[member.role]?.has(perm)) throw forbidden();
  return member;
}

export function requireMember(communityId, userId) {
  const member = getMember(communityId, userId);
  if (!member) throw notFound('Comunidade não encontrada');
  return member;
}

// Channel access: community channels need membership; dm/group_dm need dm_membership
export function channelContext(channelId, userId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) throw notFound('Canal não encontrado');
  if (channel.type === 'dm' || channel.type === 'group_dm') {
    const m = db.prepare('SELECT 1 FROM dm_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
    if (!m) throw notFound('Canal não encontrado');
    return { channel, member: null };
  }
  const member = requireMember(channel.community_id, userId);
  return { channel, member };
}

export function channelMemberIds(channel) {
  if (channel.type === 'dm' || channel.type === 'group_dm') {
    return db.prepare('SELECT user_id FROM dm_members WHERE channel_id = ?').all(channel.id).map(r => r.user_id);
  }
  return db.prepare('SELECT user_id FROM members WHERE community_id = ?').all(channel.community_id).map(r => r.user_id);
}

export function communityMemberIds(communityId) {
  return db.prepare('SELECT user_id FROM members WHERE community_id = ?').all(communityId).map(r => r.user_id);
}

// Higher role beats lower; owner always wins; a moderator cannot kick an admin/owner
export function canActOn(actorRole, targetRole) {
  if (actorRole === 'owner') return true;
  if (targetRole === 'owner') return false;
  return ROLE_LEVEL[actorRole] > ROLE_LEVEL[targetRole];
}

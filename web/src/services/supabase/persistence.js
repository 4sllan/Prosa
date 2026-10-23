// supabase/persistence.js — espelho idempotente do domínio P2P no Postgres.
// O log local de eventos segue a fonte de verdade do nó; o Postgres é histórico
// consultável (PostgREST) independente de eventos Realtime. Tudo fire-and-forget:
// falha do hub nunca bloqueia o envio/local (D3/D4 — entrega continua efêmera).
import { getSupabase } from './client.js';
import { logDiag } from '../p2p/diag.js';

const iso = (ts) => new Date(ts).toISOString();
// roles P2P (admin/member) -> constraint do Postgres (owner/member)
const pgRole = (r) => (['owner', 'admin'].includes(r) ? 'owner' : 'member');

export function createPersistence({ client } = {}) {
  client ??= getSupabase();
  if (!client) return null;

  const report = (op) => ({ error }) => {
    if (error) logDiag('pg.' + op, error.code || error.message || 'err');
  };

  const upsertProfile = (pubkey, profile = {}) =>
    client.from('profiles').upsert({
      pubkey,
      ...(profile.displayName != null && { display_name: profile.displayName }),
      ...(profile.avatarUrl != null && { avatar_url: profile.avatarUrl }),
      ...(profile.bio != null && { bio: profile.bio }),
      ...(profile.statusText != null && { status_text: profile.statusText }),
      last_seen_at: iso(Date.now()),
    }).then(report('profiles'));

  const upsertConversation = (sp, createdBy) => sp &&
    client.from('conversations').upsert({
      id: sp.id,
      type: sp.type,
      name: sp.meta?.name ?? null,
      ...(createdBy && { created_by: createdBy }),
    }).then(report('conversations'));

  const upsertMember = (convId, pubkey, role = 'member') =>
    client.from('conversation_members').upsert({
      conversation_id: convId, pubkey, role: pgRole(role),
    }).then(report('members'));

  const removeMember = (convId, pubkey) =>
    client.from('conversation_members').delete()
      .eq('conversation_id', convId).eq('pubkey', pubkey).then(report('members.del'));

  const upsertRelationship = (owner, peer, state) =>
    client.from('relationships').upsert({ owner, peer, state, updated_at: iso(Date.now()) })
      .then(report('relationships'));

  // Convites não têm chave determinística — o "upsert" é: resolve o pendente do
  // par (from,to) ou cria um novo. Espelho dev, corrida é tolerável.
  async function syncInvite(from, to, status) {
    const { data: pending, error } = await client.from('invites')
      .select('id').eq('from_pubkey', from).eq('to_pubkey', to)
      .eq('status', 'pending').limit(1);
    if (error) return report('invites')({ error });
    if (status === 'pending') {
      if (!pending?.length) {
        await client.from('invites').insert({ from_pubkey: from, to_pubkey: to, status })
          .then(report('invites'));
      }
      return;
    }
    if (pending?.length) {
      await client.from('invites')
        .update({ status, resolved_at: iso(Date.now()) }).eq('id', pending[0].id)
        .then(report('invites'));
    }
  }

  const upsertMessage = (env) => {
    const m = env.body?.message || {};
    return client.from('messages').upsert({
      id: m.id || env.id,
      event_id: env.id,
      conversation_id: env.spaceId,
      channel_id: env.body?.channelId || m.channelId || 'chat',
      author: env.author,
      content: m.content ?? '',
      reply_to: typeof m.replyTo === 'string' ? m.replyTo : (m.replyTo?.id ?? null),
      attachments: m.attachments ?? [],
      created_at: iso(env.ts),
    }, { onConflict: 'id' }).then(report('messages'));
  };

  return {
    upsertProfile, upsertRelationship, syncInvite,

    // Espelha uma transição de contato: relationship nos dois sentidos conhecidos
    // localmente + desfecho do convite pendente. Chamado em 'contacts.changed'.
    async mirrorContact(contact, myPub) {
      if (!contact?.pubkey || contact.pubkey === myPub) return;
      await upsertProfile(contact.pubkey, contact.profile);
      await upsertRelationship(myPub, contact.pubkey, contact.state);
      const pair = {
        outgoing:  [myPub, contact.pubkey],
        incoming:  [contact.pubkey, myPub],
      }[contact.state];
      if (pair) await syncInvite(...pair, 'pending');
      if (contact.state === 'friend') {
        await syncInvite(myPub, contact.pubkey, 'accepted');
        await syncInvite(contact.pubkey, myPub, 'accepted');
      }
      if (contact.state === 'removed') {
        await syncInvite(myPub, contact.pubkey, 'cancelled');
        await syncInvite(contact.pubkey, myPub, 'cancelled');
      }
    },

    // Espelha um evento assinado já aplicado localmente. `sp` é o espaço vivo
    // (getSpace); sem ele não há como garantir a conversa — evento pulado.
    async mirrorEvent(env, sp) {
      try {
        await upsertProfile(env.author);
        switch (env.type) {
          case 'space.genesis': {
            await upsertConversation(sp, env.author);
            for (const m of sp?.members || []) await upsertMember(sp.id, m);
            for (const a of sp?.admins || []) await upsertMember(sp.id, a, 'owner');
            break;
          }
          case 'space.meta':
            await upsertConversation(sp);
            break;
          case 'member.add':
            await upsertMember(env.spaceId, env.body.userId);
            break;
          case 'member.remove':
            await removeMember(env.spaceId, env.body.userId);
            break;
          case 'member.role':
            await upsertMember(env.spaceId, env.body.userId, env.body.role);
            break;
          case 'message.send':
            await upsertConversation(sp);
            await upsertMember(env.spaceId, env.author);
            await upsertMessage(env);
            break;
          case 'message.edit':
            await client.from('messages')
              .update({ content: env.body.content ?? '', edited_at: iso(env.ts) })
              .eq('id', env.body.messageId).eq('author', env.author)
              .then(report('messages.edit'));
            break;
          case 'message.delete':
            await client.from('messages')
              .update({ content: '', deleted_at: iso(env.ts) })
              .eq('id', env.body.messageId)
              .then(report('messages.delete'));
            break;
          default: break; // channel.*/reaction/pin/file.* sem tabela própria nesta etapa
        }
      } catch (e) {
        logDiag('pg.mirror', e?.message || 'err');
      }
    },

    async getProfile(pubkey) {
      const { data, error } = await client.from('profiles')
        .select('pubkey,display_name,avatar_url,bio,status_text,fingerprint')
        .eq('pubkey', pubkey).limit(1);
      if (error) { report('profiles.get')({ error }); return null; }
      const r = data?.[0];
      return r && {
        displayName: r.display_name, avatarUrl: r.avatar_url,
        bio: r.bio, statusText: r.status_text, fingerprint: r.fingerprint,
      };
    },

    // Convites pendentes endereçados a mim — "inbox" para quem estava offline.
    async pendingInvites(toPubkey) {
      const { data, error } = await client.from('invites')
        .select('id,kind,from_pubkey,created_at')
        .eq('to_pubkey', toPubkey).eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) { report('invites.list')({ error }); return []; }
      return data || [];
    },

    // Histórico consultável direto do Postgres — independente de Realtime (CA-06).
    async messagesHistory(conversationId, { before, limit = 50 } = {}) {
      let q = client.from('messages').select('*')
        .eq('conversation_id', conversationId).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(limit);
      if (before) q = q.lt('created_at', before);
      const { data, error } = await q;
      if (error) { report('history')({ error }); return []; }
      return (data || []).reverse();
    },
  };
}

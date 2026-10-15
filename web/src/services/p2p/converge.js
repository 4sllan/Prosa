// p2p/converge.js — regras de convergência do modelo de dados P2P.
// LWW por (author, lamport-ish seq); tombstones vencem em mesma seq por ts.
// Permissões: eventos admin só valem se autor ∈ space.admins (definido em genesis).

const ADMIN_ROLES = new Set(['owner', 'admin']);

// aplica um evento ao estado derivado de um espaço
export function applyEventToProjection(proj, sp, env) {
  switch (env.type) {
    case 'space.genesis':
      sp.meta = { ...sp.meta, ...env.body.meta };
      sp.admins = new Set(env.body.admins || [env.author]);
      for (const m of env.body.members || []) sp.members.add(m);
      break;
    case 'space.meta':
      if (!isAdmin(sp, env.author)) break;
      proj.state.meta = lwwSet(proj.state.meta, env);
      sp.meta = { ...sp.meta, ...env.body.meta };
      break;
    case 'member.add':
      if (!isAdmin(sp, env.author) && env.author !== env.body.userId) break;
      sp.members.add(env.body.userId);
      break;
    case 'member.remove':
      if (!isAdmin(sp, env.author)) break;
      sp.members.delete(env.body.userId);
      break;
    case 'member.role':
      if (!isAdmin(sp, env.author)) break;
      proj.state[`role:${env.body.userId}`] = { role: env.body.role, ts: env.ts };
      break;
    case 'channel.create':
      if (!isAdmin(sp, env.author) && sp.type !== 'dm') break;
      sp.channels.set(env.body.channel.id, env.body.channel);
      break;
    case 'channel.remove':
      if (!isAdmin(sp, env.author)) break;
      sp.channels.delete(env.body.channelId);
      break;
    case 'message.send': {
      const m = { ...env.body.message, author: env.author, id: env.body.message.id || env.id, ts: env.ts, editedAt: null, deletedAt: null, reactions: {}, pinned: false, seqByAuthor: { [env.author]: env.seq } };
      proj.messages.set(m.id, m);
      break;
    }
    case 'message.edit': {
      const m = proj.messages.get(env.body.messageId);
      // só o autor edita; ordenação pela seq monotônica do próprio autor
      if (m && m.author === env.author && env.seq > (m.seqByAuthor?.[env.author] || 0)) {
        m.content = env.body.content; m.editedAt = env.ts;
        (m.seqByAuthor ||= {})[env.author] = env.seq;
      }
      break;
    }
    case 'message.delete': {
      const m = proj.messages.get(env.body.messageId);
      if (m && (m.author === env.author || isAdmin(sp, env.author))) {
        m.deletedAt = env.ts; m.content = '';
      }
      break;
    }
    case 'reaction': {
      const m = proj.messages.get(env.body.messageId);
      if (!m || m.deletedAt) break;
      const key = env.body.emoji;
      const set = new Set(m.reactions[key] || []);
      env.body.remove ? set.delete(env.author) : set.add(env.author);
      m.reactions[key] = [...set];
      break;
    }
    case 'pin': {
      const m = proj.messages.get(env.body.messageId);
      if (m) m.pinned = !env.body.remove;
      break;
    }
    case 'file.add': {
      proj.state[`file:${env.body.hash}`] = { ...env.body.file, ts: env.ts };
      break;
    }
    case 'file.remove': {
      delete proj.state[`file:${env.body.hash}`];
      break;
    }
    // controle efêmero nunca chega aqui (não assinado/persistido)
    default: break;
  }
}

function isAdmin(sp, author) {
  if (sp.type === 'dm') return true; // em DM todos são admin do próprio conteúdo
  return ADMIN_ROLES.has(proj0(sp, author));
}
function proj0(sp, author) {
  return (sp.admins && sp.admins.has(author)) ? 'admin' : 'member';
}
function lwwSet(cur, env) { return { value: env.body, ts: env.ts }; }

// convergência: qual dos dois eventos ganha para mesma chave lógica
export function lwwWinner(a, b) {
  if (!a) return b;
  if (a.ts !== b.ts) return a.ts > b.ts ? a : b;
  // mesmo ts — desempate por autor+seq determinísticos
  const ka = `${a.author}:${a.seq}`;
  const kb = `${b.author}:${b.seq}`;
  return ka > kb ? a : b;
}

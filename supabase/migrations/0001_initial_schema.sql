-- 0001_initial_schema.sql — schema inicial do Prosa no Supabase hospedado.
-- Espelho do dominio P2P: perfis por pubkey Ed25519, relacionamentos, convites,
-- conversas (espacos) e mensagens. Aplicar com:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_initial_schema.sql
-- DEV ONLY: politicas RLS permissivas para `anon` ate a fase de auth — o projeto
-- e de desenvolvimento/descartavel e nao deve receber dados reais.

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- Perfis: usuario = chave publica Ed25519 (hex). Sem contas/senhas nesta etapa.
create table if not exists profiles (
  pubkey text primary key,
  display_name text,
  avatar_url text,
  bio text not null default '',
  status_text text not null default '',
  fingerprint text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Relacionamentos: espelho dos estados de contacts.js
-- (outgoing/incoming/friend/blocked/removed).
create table if not exists relationships (
  owner text not null references profiles(pubkey) on delete cascade,
  peer text not null references profiles(pubkey) on delete cascade,
  state text not null check (state in ('outgoing','incoming','friend','blocked','removed')),
  updated_at timestamptz not null default now(),
  primary key (owner, peer)
);
create index if not exists idx_relationships_peer on relationships(peer);
create index if not exists idx_relationships_state on relationships(state);

-- Convites: enviados/recebidos e seu desfecho (aceito/recusado/cancelado).
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'friend' check (kind in ('friend')),
  from_pubkey text not null references profiles(pubkey) on delete cascade,
  to_pubkey text not null references profiles(pubkey) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_invites_to_status on invites(to_pubkey, status);
create index if not exists idx_invites_from on invites(from_pubkey);

-- Conversas: id = spaceId do nó P2P (dm:..., cm:...).
create table if not exists conversations (
  id text primary key,
  type text not null check (type in ('dm','group','community')),
  name text,
  created_by text references profiles(pubkey) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id text not null references conversations(id) on delete cascade,
  pubkey text not null references profiles(pubkey) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, pubkey)
);
create index if not exists idx_conversation_members_pubkey on conversation_members(pubkey);

-- Mensagens: id = id da mensagem no evento; event_id = envelope P2P
-- (spaceId:author:seq) — chave de deduplicacao do espelho.
create table if not exists messages (
  id text primary key,
  event_id text unique,
  conversation_id text not null references conversations(id) on delete cascade,
  channel_id text not null,
  author text not null references profiles(pubkey) on delete cascade,
  content text not null,
  reply_to text references messages(id) on delete set null,
  attachments jsonb not null default '[]',
  created_at timestamptz not null,
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);
create index if not exists idx_messages_author on messages(author);

-- RLS — DEV ONLY: permissiva para `anon` ate a fase de autenticacao.
alter table profiles enable row level security;
alter table relationships enable row level security;
alter table invites enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

create policy profiles_dev_all on profiles for all to anon using (true) with check (true);
create policy relationships_dev_all on relationships for all to anon using (true) with check (true);
create policy invites_dev_all on invites for all to anon using (true) with check (true);
create policy conversations_dev_all on conversations for all to anon using (true) with check (true);
create policy conversation_members_dev_all on conversation_members for all to anon using (true) with check (true);
create policy messages_dev_all on messages for all to anon using (true) with check (true);

insert into schema_migrations (version) values ('0001_initial_schema');

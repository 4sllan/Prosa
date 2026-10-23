-- 0002_space_mailbox.sql — mailbox de eventos do Prosa no Supabase hospedado.
-- Envelopes assinados completos por espaço (convergência offline) + genesis da
-- conversa para reconstruir espaços desconhecidos no boot.
-- Spec: docs/specs/supabase-friends-realtime.md (RF-07/RF-08, D2/D3 adotadas).
-- Aplicar com:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_space_mailbox.sql
-- DEV ONLY: mesma politica RLS permissiva do 0001 — projeto dev/descartavel.

create table if not exists space_events (
  event_id text primary key,          -- envelope id: spaceId:author:seq (dedupe/idempotencia)
  space_id text not null,
  author text not null,
  seq integer not null,
  type text not null,
  ts bigint not null,
  envelope jsonb not null             -- envelope P2P completo, com assinatura verificavel
);
create index if not exists idx_space_events_order on space_events(space_id, author, seq);

-- genesis assinado do espaco — permite reconstruir espaco desconhecido no boot
-- (mesmo formato do envelope space.genesis usado por acceptSpaceInvite).
alter table conversations add column if not exists genesis jsonb;

-- RLS — DEV ONLY: permissiva para `anon` ate a fase de autenticacao.
alter table space_events enable row level security;
create policy space_events_dev_all on space_events for all to anon using (true) with check (true);

insert into schema_migrations (version) values ('0002_space_mailbox');

# Tasks: Supabase (hospedado) — PostgreSQL, Realtime e integração com o nó P2P

**Plano da spec:** `docs/specs/supabase-local-backend.md` (R2 em revisão — backend hospedado)
**Status geral:** revisão pendente — T1/T2 alteradas pela mudança local → hospedado
**Ordem de execução:** T1 → T2 → T3 → T4 → T5 → T6 → T7 (sequencial; T4/T5/T6 tocam módulos distintos mas dependem de T3)

---

## T1 — Projeto Supabase hospedado configurado e acessível

- Status: concluída
- Requisitos/aceite: RF-01, RNF-01, RNF-02, RNF-03, CA-01
- Dependências: nenhuma técnica. Pré-requisito externo **parcialmente atendido**: usuário criou o projeto `bveprzynkfsqrgyomrzn` e forneceu host/porta/senha do Postgres; falta a `anon public key` para API/Realtime.
- Escopo e arquivos prováveis: `.env.example` (+`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`), `.env` local (não commitado).
- Implementação:
  1. ~~Criar projeto~~ **feito** — host `db.bveprzynkfsqrgyomrzn.supabase.co`.
  2. `.env` recebe `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (pendente) e `SUPABASE_DB_URL` (senha URL-encoded; **fora** de `VITE_*` — privilegiada). `.env.example` ganha placeholders (valores reais nunca commitados).
  3. Conectividade: porta 5432 acessível (`nc -z`); `psql "$SUPABASE_DB_URL"` autenticou — Postgres 17.11; PostgREST com `sb_publishable_*` passa auth (`PGRST205` em tabela inexistente); GoTrue `/auth/v1/health` ok. **Pendente:** Realtime retorna 404 — serviço **desabilitado** no projeto; usuário deve ativar em Dashboard → Settings → Realtime.
  4. Confirmar que nada depende de Docker local nesta etapa (compose legado segue D5).
- Testes e comandos de validação: `psql` ok; PostgREST ok com publishable key; falta handshake WS do Realtime após habilitação; `git status` sem segredos commitados.
- Critério de conclusão: ambiente alcança API e Realtime com a publishable key; credenciais fora do repo.
- Evidências: `.env` com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`sb_publishable_*`), `SUPABASE_DB_URL` e `SUPABASE_SECRET_KEY` (privilegiadas, fora de VITE_*); `psql` → `PostgreSQL 17.11`; `nc -z` ok; REST `PGRST205` (auth aceita); `/auth/v1/health` → GoTrue v2.197.0; Realtime habilitado pelo usuário no dashboard → handshake `wss://…/realtime/v1/websocket` **WS OPEN** confirmado em 2026-10-22; `libpq 18.6` via brew; instalação da Supabase CLI abortada após decisão por hospedado; `.env.example` com placeholders (sem segredos).

---

## T2 — Migração inicial do schema aplicada ao projeto hospedado

- Status: concluída
- Requisitos/aceite: RF-02, RF-03, §5, CA-02, D1(a), D6
- Dependências: T1
- Escopo e arquivos prováveis: `supabase/migrations/0001_initial_schema.sql`.
- Implementação:
  1. Criar `supabase/migrations/0001_initial_schema.sql` com `profiles`, `relationships`, `invites`, `conversations`, `conversation_members`, `messages` — campos, FKs, checks e índices do §5.
  2. RLS habilitado em todas com políticas permissivas `FOR ALL TO anon USING (true) WITH CHECK (true)` + comentário `-- DEV ONLY: permissiva até a fase de auth`.
  3. Aplicar ao projeto com `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_initial_schema.sql` (D6 resolvida — `psql` direto; libpq 18.6 instalado).
  4. Verificar: `\d` via psql — tabelas criadas; insert/select de amostra descartável; upsert idempotente por `event_id` funciona; conferir que nenhum objeto foi criado fora da migração.
- Testes e comandos de validação: queries de amostra via psql/API; migração idempotente ou documentada como single-run.
- Critério de conclusão: schema do §5 existe no projeto, criado só pela migração versionada; RLS ativo e documentado.
- Evidências: `supabase/migrations/0001_initial_schema.sql` criado e aplicado via `psql` (ON_ERROR_STOP, saída limpa: 7 tabelas + 6 índices + 6 policies + insert em `schema_migrations`); `\dt` lista profiles/relationships/invites/conversations/conversation_members/messages; amostra descartável inserida e removida; upsert por `event_id` idempotente (segunda inserção `0` linhas); `pg_policies` confirma `*_dev_all` em todas as tabelas; PostgREST com publishable key retornou a linha de teste em `messages` após `notify pgrst, 'reload schema'`.

---

## T3 — Módulo `services/supabase/` — client, config e presença

- Status: concluída
- Requisitos/aceite: RF-04, RNF-01, RNF-04, RNF-05, CA-03
- Dependências: T1 (endpoint real p/ verificação manual), T2 não é pré-requisito.
- Escopo e arquivos prováveis: `web/package.json` (+`@supabase/supabase-js`), `web/src/services/supabase/client.js`, `config.js`, `presence.js`; `web/src/services/p2p/node.js` (hook pós-init, opcional); `web/test/` novos testes.
- Implementação:
  1. `npm --prefix web install @supabase/supabase-js` (versão estável ≥7 dias).
  2. `config.js`: resolve url/anon key com precedência `localStorage.prosa_supabase` → `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` → default `http://localhost:54321`; flag `hubEnabled()`.
  3. `client.js`: cria/recupera o client; `connectHub({pubkey, displayName})` tolerante a falha (hub ausente = null, sem throw).
  4. `presence.js`: publica em `prosa:presence:<minha_pubkey>`; `watchPeer(pubkey)` assina canal do contato e emite `presence`/`offline`; re-inscrição em reconnect do realtime.
  5. `node.js`: após `initP2PNode`, chama `connectHub` best-effort; presença do hub alimenta o mesmo evento `presence` da store — sem alterar `transport.js`.
- Testes e comandos de validação: testes de resolução de config e tolerância a hub ausente; `npm --prefix web test`; verificação manual: dois clientes veem presença mútua.
- Critério de conclusão: presença via Realtime entre dois clientes; app funciona com hub desligado.
- Evidências: `@supabase/supabase-js@2.118.0` fixo em `web/` (versão de 2026-10-15, ≥7 dias); `web/src/services/supabase/{config,client,presence}.js` criados — config com precedência `localStorage.prosa_supabase` → `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; presença em canais `prosa:presence:<pubkey>` (track próprio + `watchPeer` por contato, sync→online / leave→offline); `node.js` inicializa presença best-effort pós-restore e expõe `node.hub`/`watchPresence` — falha do hub não quebra o boot P2P; `vite.config.js` passou a ler `.env` da raiz; 9 testes novos (config + presença) — `npm --prefix web test`: 251 pass, 0 fail; `npm run build` ok; `git diff --check` limpo; verificação live no hub hospedado: canal `prosa:presence:verif-t3` assinou, `track()` publicou e `presenceState` retornou a presença via sync. Detalhe corrigido durante a execução: a dependência foi inicialmente instalada no `package.json` raiz por engano e movida para `web/package.json`. Pendente observável apenas em runtime do app: presença mútua entre dois clientes reais (depende de T4 para efeito prático de pareamento).

---

## T4 — Sinalização WebRTC via Realtime + pareamento automático

- Status: concluída
- Requisitos/aceite: RF-06, RF-07, RF-09, §6, CA-04, CA-07, D2
- Dependências: T3
- Escopo e arquivos prováveis: `web/src/services/supabase/signaling.js`, `web/src/services/p2p/pairing.js`, `pairing-peer.js`, `node.js`, `web/test/` novos testes.
- Implementação:
  1. `signaling.js`: canal `prosa:user:<minha_pubkey>`; `sendSignal(to, payload)` (`{kind:'offer'|'answer'|'ice', from, to, data}`) e `onSignal(fn)`; ICE trickle — `onicecandidate` envia candidatos incrementalmente.
  2. `pairing.js`: nova via "hub" — `createHubOffer(pc, signaling)`/`acceptHubOffer` reusando `attachChannel`/`wirePairingPeer`; glare resolvido por pubkey menor (iniciador determinístico), mesma regra do `rtc.js`.
  3. Pareamento automático (D2): ao detectar contato online via presença e sem peer DC ativo, o lado de pubkey menor inicia a oferta; `hello` assinado e `attachPeer` inalterados.
  4. Fallback: fluxo manual por link intacto (`createPairingOffer`/`acceptPairingOffer`/`completePairing` continuam disponíveis).
  5. Reconexão do hub re-inscreve o canal do usuário; peers DC vivos não são tocados.
- Testes e comandos de validação: testes de codec de payload, seleção de iniciador e glare; `npm --prefix web test`; manual: dois clientes pareiam sem link, mensagens fluem por DC; cliente sem hub pareia por link.
- Critério de conclusão: pareamento automático funciona; manual intacto; sem regressão nos testes.
- Evidências: `web/src/services/supabase/signaling.js` — inbox `prosa:user:<pubkey>` + envio por broadcast `signal` no canal do destinatário (payload `{v,kind:'desc'|'ice',sess,from,to,data}`); `web/src/services/p2p/pairing-hub.js` — sessões por peer com ICE trickle, fila de candidatos pré-remoteDescription, renegociação por "perfect negotiation" (polite = maior pubkey, mesma regra de glare do rtc.js) e id de sessão para descartar sinais antigos; `node.js` — `createSignaling`+`createHubPairing` no boot best-effort, auto-pareamento ao ver contato online (só o iniciador) e re-pareamento quando o DC cai com peer ainda online no hub; `presence.js` ganhou `stateOf()`; lista de observados segue `contacts.changed` (blocked/removed não são vigiados). Decisão de implementação: a via hub ficou em `pairing-hub.js` em vez de alterar `pairing.js` — fluxo manual por link intacto (testes p2p-pairing-* continuam verdes). Testes: 15 novos (signaling, iniciador, dedupe de sessão, glare, fila de ICE, expiração) — `npm --prefix web test`: 266 pass, 0 fail; `npm run build` ok; `git diff --check` limpo. Verificação live: broadcast `signal` entre dois clients distintos no hub hospedado entregou `desc/sess` corretamente (broadcast não retorna ao mesmo socket por `self:false` — irrelevante entre dispositivos reais). Pendente observável no app: pareamento ponta-a-ponta entre dois clientes reais (WebRTC real) — caminho sinalizado e testado com fakes, mas o DC real só se valida no runtime.

---

## T5 — Espelhamento no Postgres + histórico via PostgREST

- Status: concluída
- Requisitos/aceite: RF-08, RNF-05, §5, CA-06, D3, D4
- Dependências: T2, T3
- Escopo e arquivos prováveis: `web/src/services/supabase/persistence.js`, `web/src/services/p2p/node.js`, `contacts.js`, `spaces.js`, `providers/p2p.js`; `web/test/` novos testes.
- Implementação:
  1. `persistence.js`: upserts idempotentes `upsertProfile`, `upsertRelationship`, `upsertInvite`, `upsertConversation`, `upsertMember`, `upsertMessage` (conflito por `event_id`); `messagesHistory(conversationId, {before, limit})` via PostgREST.
  2. `node.js`: após `applyEvent` aplicado, espelha por tipo — `message.send`→`messages`, `space.genesis`/`channel.*`/`member.*`→`conversations`/`conversation_members` (fire-and-forget com log; nunca bloqueia).
  3. `contacts.js`: `contact_req`/`accept`/`remove`/bloqueio espelham `relationships` + `invites` (estados da spec de amizade).
  4. Receptores também upsertam a mensagem recebida (D3) — dedupe pelo PK `event_id`.
  5. `providers/p2p.js`: `messages.list` pode ler o Postgres quando hub ativo com fallback ao log local; contrato da UI inalterado.
- Testes e comandos de validação: testes de mapeamento evento→linha e idempotência; `npm --prefix web test`; manual: mensagem aparece em `messages` e `GET /rest/v1/messages?conversation_id=eq.X` a retorna.
- Critério de conclusão: histórico consultável no Postgres sem evento Realtime; falha do hub não afeta envio.
- Evidências: `web/src/services/supabase/persistence.js` — upserts idempotentes (`messages` por `id`+`event_id`; `relationships`/`conversation_members`/`conversations`/`profiles` por PK; `invites` resolve o pendente do par antes de inserir); `mirrorEvent` cobre genesis/meta/member.*/message.send·edit·delete com FKs garantidas (profile→conversation→member→message) e é fire-and-forget com log `pg.*`; `mirrorContact` espelha relationship + convite (pending/accepted/cancelled) + perfil. `node.js`: espelho em eventos locais (via `setLocalEventListener`) e remotos aplicados (D3 — receptores também gravam), `contacts.changed` dispara `mirrorContact`, profile próprio no boot. `providers/p2p.js`: `messages.list` mescla `messagesHistory` (PostgREST, `deleted_at is null`, desc+reverse) com a projeção local sem duplicar por id — fallback local em erro. Testes: 11 novos — `npm --prefix web test`: 277 pass, 0 fail; `npm run build` ok; `git diff --check` limpo. Verificação live: genesis+message.send espelhados no Postgres hospedado via publishable key, re-envio do mesmo `event_id` não duplicou, `messagesHistory` leu a linha de volta; linhas de teste removidas. Escopo não coberto: `channel.*`, `reaction`, `pin`, `file.*` não têm tabela no schema 0001 — não espelhados nesta etapa.

---

## T6 — Convites e relacionamentos em tempo real

- Status: concluída
- Requisitos/aceite: RF-05, §6, CA-05
- Dependências: T3, T5
- Escopo e arquivos prováveis: `web/src/services/supabase/signaling.js` ou `events.js` (canal `prosa:user:*`), `web/src/services/p2p/contacts.js`, `node.js`; `web/test/` novos testes.
- Implementação:
  1. Ao espelhar `contact_req`, publicar broadcast `invite` no canal `prosa:user:<destinatário>`; aceite/recusa/cancelamento publicam `relationship` com novo estado.
  2. Receptor do evento atualiza store local (reaproveita handlers `contact_req`/`contact_accept`/`contact_remove`) e emite `contacts.changed` — UI atualiza sem reload.
  3. Evento Realtime serve de "acordar"/notificação: se peer DC aberto, controle continua indo por DC (dedupe natural pelo estado do contato).
- Testes e comandos de validação: testes de dispatch invite/relationship; `npm --prefix web test`; manual: convite de A chega em B online com tela atualizada, e estados enviado→aceito/recusado/cancelado refletem em `invites`.
- Critério de conclusão: fluxo completo de convite com evento Realtime e persistência coerentes.
- Evidências: `signaling.js` ganhou o evento `notify` no canal `prosa:user:*` (`sendNotify`/`onNotify`, mesmo filtro to/from do `signal`); `contacts.js` exporta `handleHubNotify` reaproveitando `handleContactReq`/`handleContactAccept`/`handleContactRemove` — todos idempotentes, duplicata DC+hub absorvida pelo estado do contato; `node.js` despacha notify e, no boot, recupera convites pendentes do Postgres (`pendingInvites`+`getProfile`) criando contatos `incoming` para quem me convidou offline; `providers/p2p.js` publica `invite` (request), `relationship:friend` (accept) e `relationship:removed` (remove) pelo hub além do DC. Testes: 7 novos — `npm --prefix web test`: 284 pass; `npm test` (server): 14 pass após `npm --prefix server install` (deps nunca tinham sido instaladas localmente — falha pré-existente por `ws` ausente); `npm run build` ok; `git diff --check` limpo. Verificação live: broadcast `notify` entregue entre dois clients no hub; `syncInvite`→`pendingInvites`→`getProfile`→`accepted` roundtrip no Postgres real; linhas de teste removidas. Pendente observável no app: UI atualizando sem reload em dois clientes reais.

---

## T7 — Documentação, variáveis de ambiente e limpeza do compose legado

- Status: concluída
- Requisitos/aceite: RF-10, RNF-01, RNF-03, CA-08, CA-09, CA-10, D5
- Dependências: T1–T6
- Escopo e arquivos prováveis: `.env.example`, `README.md`, `docker-compose.yml`, `docs/specs/supabase-local-backend.md` (notas finais).
- Implementação:
  1. `.env.example`: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` com placeholders e instrução "Dashboard → Settings → API Keys"; remover/deprecar `POSTGRES_*`/`DATABASE_URL`.
  2. README: seção "Supabase" — criar projeto no dashboard, obter credenciais, aplicar migrações (conforme D6), roteiro de teste entre dois clientes, aviso de projeto dev/descartável.
  3. **D5 — sujeito a autorização específica:** remover `docker-compose.yml` e, explicitamente autorizado, `docker compose down` + `docker volume rm prosa_prosa-pgdata`. Sem autorização, apenas marcar o arquivo como legado/deprecated.
  4. Revisar diff completo: nenhum segredo, nenhuma implementação de auth.
- Testes e comandos de validação: `npm test`, `npm --prefix web test`, `npm run build`, `git diff --check`; revisão do README executando os comandos documentados.
- Critério de conclusão: documentação executável; ambiente reproduzível do zero; sem auth implementado.
- Evidências: README ganhou "Hub Supabase (rendezvous + histórico)" com setup (criar projeto, habilitar Realtime, variáveis, `psql -f`), roteiro de teste entre dois clientes e aviso de projeto dev/descartável com RLS permissivo; limitações do modo P2P atualizadas (inbox de convites offline via Postgres). `.env.example` documenta `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`SUPABASE_DB_URL`/`SUPABASE_SECRET_KEY` com placeholders e avisos de privilégio; bloco `POSTGRES_*` já marcado como legado em T1. **D5 autorizado e executado:** `docker compose down` + `docker volume rm prosa_prosa-pgdata` + `docker-compose.yml` removido — volume nunca teve dados úteis (nenhum código o consumia; container estava em restart loop por `exec format error`). Validação: `npm test` 14 pass · `npm --prefix web test` 284 pass · `npm run build` ok · `git diff --check` limpo · revisão do diff sem segredos (só placeholders `<ref>`/`<senha>`) e sem nenhuma implementação de auth.

---

## Validação geral do plano

| Comando | Quando |
|---|---|
| `npm test` | T4–T7 (server intacto — regressão) |
| `npm --prefix web test` | toda task que tocar `web/` |
| `npm run build` | T3–T7 |
| `git diff --check` | T7 / revisão final |
| `curl` na API / dashboard do projeto | T1–T2 e verificações manuais |
| Manual dois clientes | T3 (presença), T4 (pareamento), T5 (histórico), T6 (convites) |

Aguardando aprovação das tasks e autorização para executar T1.

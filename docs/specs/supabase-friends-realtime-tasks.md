# Tasks: supabase-friends-realtime

**Spec de referência:** `docs/specs/supabase-friends-realtime.md` (aprovada em 2026-10-22; D1–D5 adotadas nas opções recomendadas)
**Status geral:** pendente — aguardando aprovação das tasks
**Ordem de execução:** T1 → T2 → T3 → T4 → T5 → T6 (T2 independente de T1; T3 e T4 dependem de T1; T5 depende de T3)

---

## T1 — Mailbox no Postgres: migração 0002 + espelhamento de envelopes completos

- Status: concluída
- Requisitos/aceite: RF-07, RF-08; contribui para CA-04, CA-05, CA-07
- Dependências: nenhuma
- Escopo e arquivos prováveis: `supabase/migrations/0002_space_mailbox.sql` (novo), `web/src/services/supabase/persistence.js`, `web/test/supabase-persistence.test.js`
- Implementação:
  1. Migração `0002`: tabela `space_events (event_id text PK, space_id text, author text, seq int, type text, ts bigint, envelope jsonb not null)` + índice `(space_id, author, seq)`; coluna `conversations.genesis jsonb`; policy dev `for all to anon using (true)`; registro em `schema_migrations`.
  2. `persistence.js`: `upsertSpaceEvent(env)` (upsert por `event_id`), `upsertGenesis(env)`; `mirrorEvent` passa a chamar `upsertSpaceEvent` para **todo** tipo aplicado (genérico, antes do switch) e `upsertGenesis` em `space.genesis`/`member.add` (genesis re-emitido também espelha).
  3. Aplicar `0002` ao projeto dev via `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f` (efeito externo: confirmar antes de rodar — mesmo procedimento já usado no `0001`).
- Testes e comandos de validação: testes de mapeamento envelope→linha e idempotência (client mockado); `npm --prefix web test`; verificação do schema via PostgREST após aplicar a migração.
- Critério de conclusão: `space_events` recebe todos os tipos de evento aplicados localmente/remotamente; `conversations.genesis` populada; migração aplicada ao projeto dev.
- Evidências: `supabase/migrations/0002_space_mailbox.sql` criada (tabela `space_events` PK `event_id` + índice `(space_id, author, seq)` + `conversations.genesis jsonb` + policy dev); `persistence.js` ganhou `upsertSpaceEvent` (genérico, antes do switch de `mirrorEvent`) e `upsertGenesis`; `eventlog.js` exporta `notifyLocalEvent` — chamado em `createSpace`/`acceptSpaceInvite` porque o genesis não passa por `emitEvent` (sem ele, espaços criados localmente nunca chegariam ao mailbox — ponto não previsto no plano, resolvido dentro do escopo). Migração aplicada ao projeto dev via `psql` (autorizada pelo usuário): `\d space_events` confirma PK/índice/policy e `conversations.genesis` existe; `schema_migrations` = 0001+0002. Testes: `npm --prefix web test` 299 pass (3 testes de persistência ajustados + 1 novo cobrindo envelope completo em `space_events`); `git diff --check` limpo. Nota: genesis re-emitido por `inviteToSpace` não é espelhado — convergência de membros coberta pelos eventos `member.add` no mailbox; `conversations.genesis` guarda o último genesis aplicado por cada lado.

---

## T2 — Presença confiável: status no track + reconciliação de fontes

- Status: concluída
- Requisitos/aceite: RF-01, RF-02, RF-03; CA-01, CA-02
- Dependências: nenhuma
- Escopo e arquivos prováveis: `web/src/services/supabase/presence.js`, `web/src/stores.js`, `web/src/services/providers/p2p.js`, `web/src/services/p2p/node.js`, `web/src/components/ConnectionsView.vue`, `web/test/` (novo teste de resolução de presença)
- Implementação:
  1. `presence.js`: payload `{displayName, status, ts}`; `syncPeer` repassa o `status` do track (default `online`); `stateOf` devolve o último status conhecido.
  2. Origem nos eventos: `node.js` emite `presence` com `source: 'dc' | 'hub'` (DC: `presence` control + `peer.open`/`peer.closed`; hub: `onPeer`).
  3. `stores.js`: `presences` derivado de `dc` e `hub` por usuário com precedência **DC > hub > offline**; `peer.closed` só zera a fonte DC — peer online no hub continua online (com o status do hub).
  4. `providers/p2p.js`: `users.setPresence` chama `node().hub?.presence?.publish({status})` (invisible→`offline` no hub) além do `p2pTransport.setPresence`; `users.presences()` inclui `stateOf` do hub para contatos observados.
  5. "Visto por último": `presenceLabel` offline no `ConnectionsView` mostra `visto em <data/hora>` a partir de `peers[pubkey].lastSeen` (kv local — sem nova consulta ao Postgres).
- Testes e comandos de validação: resolver (precedência, `peer.closed` com hub online, `invisible`→offline); `npm --prefix web test`; `npm run build`.
- Critério de conclusão: status idle/dnd visível via hub sem DC; peer online-no-hub não cai para offline quando o DC fecha; boot reflete presença do hub.
- Evidências: `presence-sources.js` (novo) resolve DC>hub>offline; `stores.js` roteia eventos por `source`; `presence.js` publica `status` no track e extrai o meta mais recente do `presenceState` (bug de reduce corrigido: `a=null` vencia metas sem `ts`); `transport.js` marca `source:'dc'` no dispatch — necessário porque envelopes DC já chegavam ao `emitToStore` duas vezes (dispatch do transporte + `node.receive`), e a via sem source cairia na fonte errada; `node.js` emite `source:'hub'` e passa a parear para qualquer status ≠ offline (idle/dnd também disparam `pair()`); `providers/p2p.js` unifica `users.setPresence`/`events.setPresence` em `applyPresence` (invisible→offline no hub) e `users.presences()` mescla `stateOf` do hub no boot; `ConnectionsView.vue` mostra "Visto em dd/mm hh:mm" via `knownPeers[].lastSeen` + `messageTime`. Testes: novo `presence-sources.test.js` (7 casos); `npm --prefix web test` 306 pass; `npm run build` ok; `git diff --check` limpo.

---

## T3 — Canal `prosa:space:*`: relay condicional de envelopes + typing

- Status: concluída
- Requisitos/aceite: RF-04, RF-05, RF-06; CA-03, CA-06 (parcial), CA-09
- Dependências: T1 (pull de lacuna usa `spaceEventsSince`)
- Escopo e arquivos prováveis: `web/src/services/supabase/space-channel.js` (novo), `web/src/services/supabase/persistence.js` (`spaceEventsSince`), `web/src/services/p2p/transport.js` (hook pós-broadcast), `web/src/services/p2p/node.js`, `web/src/services/providers/p2p.js`, `web/test/` (novo teste do canal)
- Implementação:
  1. `space-channel.js`: um canal `prosa:space:<spaceId>` por espaço conhecido (`join`/`leave` conforme `spaces.changed`); broadcast `relay` `{v:1,kind:'relay',env}` e `ctl` `{v:1,kind:'ctl',type:'typing',channelId,from,ts}`; dedupe preliminar por `env.id`.
  2. Política de publish (D1): relay só se `space.members` contém peer com `presence.stateOf(peer)==='online'` **e** `!p2pTransport.isOnline(peer)`.
  3. Hook único: `transport.js` ganha callback pós-`broadcast` (`configureTransport({ afterBroadcast })` ou listener equivalente) — o nó registra o relay aí, cobrindo todos os call sites existentes sem alterá-los.
  4. Recebimento: `relay` → `validateEnvelope` + `applyEvent` + `emitToStore('space.event')` + `mirrorEvent` (mesmo caminho de `node.receive`, sem tocar `lastSeen`/acks/estado DC).
  5. Reordenação: `env.seq > curMax+1` → buffer curto por `(spaceId, author)`; lacuna persistente → `spaceEventsSince(spaceId, have)` e aplica em ordem `(author, seq)`.
  6. `typing`: `providers/p2p.js` publica `ctl` quando há membro na condição do relay; recebimento emite `typing` no store com `peerId = from`.
- Testes e comandos de validação: política condicional (publica só sem DC), dispatch/filtro, dedupe, buffer+pull de lacuna, typing relay; `npm --prefix web test`.
- Critério de conclusão: mensagem chega por relay a membro online-no-hub sem DC; typing idem; nenhuma regressão no caminho DC.
- Evidências: `supabase/space-channel.js` (novo) — canal por espaço com `relay`/`ctl`, dedupe preliminar por `env.id`, subscribe sob demanda com timeout (padrão de `signaling.js`); `transport.js` ganhou hook `afterBroadcast` em `configureTransport` — cobre todos os call sites sem alterá-los; `relayToHub`/`spaceNeedsRelay` no nó aplicam D1: publica só se há membro sem DC e não observado-offline (membro não observado recebe best-effort — `presence.isWatching` distingue os dois casos); `p2p/relay.js` (novo) — ingestão ordenada: só aplica `seq == curMax+1` (o eventlog descarta retroativos, então fora de ordem bufferiza por `(space,autor)`), pull de `spaceEventsSince` na lacuna com `maxTries` — ajuste de projeto: `applyEvent` não exige consecutividade, o buffer é necessário (spec RF-06); recebimento reutiliza `validateEnvelope`+`applyEvent` sem tocar `lastSeen`/acks; canais entram no boot (`listSpaces`) e via genesis/`spaces.changed` no wrapper de `emitToStore`; typing via `ctl` quando `spaceNeedsRelay`. Testes: novo `space-channel.test.js` (11 casos: publish, filtros, dedupe, ordenação, gap/pull, esgotamento); `npm --prefix web test` 316 pass; `npm run build` ok; `git diff --check` limpo. Pendente: verificação live relay entre dois clientes (roteiro manual T6).

---

## T4 — Inbox de convergência no boot

- Status: concluída
- Requisitos/aceite: RF-09; CA-04, CA-05, CA-07
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/services/supabase/inbox.js` (novo), `web/src/services/p2p/node.js`, `web/test/` (novo teste de convergência)
- Implementação:
  1. `inbox.js`: `listMemberships(pubkey)` → espaços onde sou membro; `getGenesis(spaceId)`; `spaceEventsSince(spaceId, have)` paginado (limit 500, ordenado por `author, seq`).
  2. No boot do nó (após hub subir, antes/paralelo ao watch de presença): espaço desconhecido → `getGenesis` → `acceptSpaceInvite` (mesmo caminho de convite); espaço conhecido → pull de eventos `seq > have[author]` → `validateEnvelope` + `applyEvent` em ordem.
  3. Emite `spaces.changed`/`space.event` para a UI refletir o convergido; falhas individuais viram `logDiag` e não abortam o boot.
- Testes e comandos de validação: convergência ordenada, genesis→espaço novo, dedupe com eventos já locais, espaço sem genesis (skip); `npm --prefix web test`.
- Critério de conclusão: peer totalmente offline recebe, no boot, mensagens/edições/reações e descobre DM criada offline — sem DC.
- Evidências: `supabase/inbox.js` (novo) — `convergeInbox` itera `conversation_members`: espaço desconhecido é reconstruído pelo `conversations.genesis` assinado via `acceptSpaceInvite` (mesmo caminho do convite), espaço conhecido puxa `spaceEventsSince(spaceId, {have})` com `have = maxSeqMap` local; envelopes ingeridos por `receiveRelayed` (valida assinatura/seq, bufferiza lacunas, emite `space.event`/`spaces.changed` — UI atualiza incremental); erro por espaço vai a `logDiag` sem abortar o boot. `persistence.js` — `listMemberships`/`getGenesis` novos; `spaceEventsSince` ganhou paginação por `range` e filtro `have` client-side (cobre autores novos). `node.js` — convergência dispara assíncrona após o hub subir, sem bloquear o boot. Testes: novo `supabase-inbox.test.js` (5 casos: reconstrução, pull parcial, genesis ausente, erro isolado, hub desligado) + 3 em `supabase-persistence.test.js`; `npm --prefix web test` 324 pass; `npm run build` ok; `git diff --check` limpo. Pendente: verificação manual dois-clientes do cenário offline→restart (T6).

---

## T5 — Indicador de estado de envio na UI

- Status: concluída
- Requisitos/aceite: RF-10 (D5 adotada)
- Dependências: T3 (confirmação do relay)
- Escopo e arquivos prováveis: `web/src/stores.js`, `web/src/components/ChatView.vue`, `web/src/services/providers/p2p.js`, `web/src/services/p2p/transport.js`
- Implementação:
  1. `store.pendingSends` (`Set` de messageId/envId): `sendMessage` marca pendente; resolve quando `waitAcks(env.id, membrosOnline)` retorna ≥1 ACK **ou** o relay de T3 confirma publish; timeout (~5 s) marca "sem confirmação" (estado discreto, não erro).
  2. `ChatView.vue`: indicador pequeno na mensagem própria (ícone/label "enviando…" / "sem confirmação"), coerente com a linguagem visual existente.
- Testes e comandos de validação: transição pendente→entregue por ACK e por relay; timeout; `npm --prefix web test`, `npm run build`.
- Critério de conclusão: usuário distingue mensagem em trânsito de entregue/confirmada pelo hub.
- Evidências: `p2p/delivery.js` (novo) — `trackSendDelivery` resolve 'delivered' no primeiro a confirmar (>=1 ACK ou publish do relay) e 'unconfirmed' no timeout de 5 s; `transport.js` — `waitAcks` ganhou parâmetro `expect` (expect=1 = resolve no primeiro ACK, sem esperar o grupo); `node.js` — `relayConfirms` guarda a promise de `publishRelay` por env.id (`relayConfirm`) e `trackDelivery` junta ACKs de membros online-no-DC + confirmação do relay; `providers/p2p.js` — `messages.send` broadcasta com `expectAck:true` (receptores DC respondem `ack`) e devolve `delivery`; `stores.js` — `sendStates[messageId]` reativo ('sending'→ausente/'unconfirmed'); `ChatView.vue`+`style.css` — label "enviando…"/"sem confirmação" discreto ao lado do horário, só em mensagens próprias. Testes: novo `send-delivery.test.js` (7 casos: ACK, relay, timeout, sem alvos, primeiro-a-confirmar, expect=1, resposta de ack); `npm --prefix web test` 331 pass; `npm run build` ok; `git diff --check` limpo. Nota: estado é por `message.id` e efêmero (não persiste restart — o envelope já está no mailbox para convergência).

---

## T6 — Documentação e validação integrada

- Status: concluída
- Requisitos/aceite: RNF-05; CA-08, CA-10
- Dependências: T1–T5
- Escopo e arquivos prováveis: `README.md` (seção Hub Supabase + limitações), evidências deste plano
- Implementação:
  1. README: relay condicional `prosa:space:*`, mailbox `space_events`/`genesis` (cresce sem TTL), presença com status e precedência, indicador de envio, limitações (anexos continuam DC-only; exposição ampliada → projeto dev/descartável), roteiro de teste atualizado.
  2. Revisão do diff completo: sem segredos, sem código fora de escopo.
- Testes e comandos de validação: `npm test`, `npm --prefix web test`, `npm run build`, `git diff --check`; roteiro manual de dois clientes (CA-03/04/05/08).
- Critério de conclusão: documentação executável e coerente com a implementação; suites verdes.
- Evidências: `README.md` — seção Hub Supabase reescrita: presença com status e precedência DC>hub>offline, relay condicional `prosa:space:*` + buffer/pull, mailbox `space_events`/`conversations.genesis` + convergência de boot, indicador de envio; setup ganhou a migração `0002`; "Teste entre dois clientes" virou roteiro manual de 5 passos (presença, relay, offline→restart); limitações atualizadas (anexos DC-only, mailbox sem TTL, espaços pré-0002 sem genesis, exposição ampliada → dev/descartável). Revisão de diff: 13 arquivos modificados + 9 novos, todos dentro do escopo da spec; sem segredos (só placeholders); nenhum refactor fora de escopo. Validação: `npm test` 14 pass (servidor inalterado), `npm --prefix web test` 331 pass, `npm run build` ok, `git diff --check` limpo. Pendente por natureza manual: execução do roteiro dois-clientes do README (CA-03/04/05/08) — requer duas instâncias reais do app.

---

## Validação geral do plano

| Comando | Quando |
|---|---|
| `npm --prefix web test` | toda task que tocar `web/` |
| `npm test` | regressão do servidor (inalterado) — T6 |
| `npm run build` | T2, T5, T6 |
| `git diff --check` | T6 / revisão final |
| `psql "$SUPABASE_DB_URL" -f 0002` | T1 (efeito externo — confirmar antes) |
| Manual dois clientes | T3 (relay/typing), T4 (convergência offline), T2 (presença), T6 |

Plano concluído: T1–T6 executadas e validadas. Pendente por natureza manual: roteiro dois-clientes do README (presença, relay, convergência offline, fallback).

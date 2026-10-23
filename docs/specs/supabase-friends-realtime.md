# Spec: Interação entre amigos — mensagens instantâneas, presença confiável e tempo real via Supabase

**Nome da spec:** `supabase-friends-realtime`
**Status:** aprovada em 2026-10-22 ("continuar" após análise; decisões D1–D5 confirmadas pelo usuário nas opções recomendadas)
**Data:** 2026-10-22
**Origem:** pedido do usuário — "melhorar a interação entre amigos priorizando mensagens instantâneas, presença online confiável e atualização em tempo real, aproveitando o Supabase"; análise Fase 1 concluída em 2026-10-22.
**Relação com specs anteriores:** estende `supabase-local-backend` (hub concluído). Revê a decisão D4 daquela spec ("entrega 100% efêmera") — ver D3 em §11.

---

## 1. Objetivo e contexto

Aproximar a experiência entre amigos de um mensageiro convencional, mantendo a arquitetura P2P: mensagem deve chegar em segundos mesmo sem DataChannel aberto, presença deve refletir o estado real (online/ausente/ocupado) sem depender do pareamento, e a UI deve se atualizar em tempo real — usando o hub Supabase já existente.

### Fatos da análise (base desta spec)

- O transporte de dados é exclusivamente `RTCDataChannel`; com peer offline (ou DC impossível), `p2pTransport.send` enfileira em `pendingQueue` **em memória** (perdida no restart) e a mensagem só é entregue no próximo pareamento (`web/src/services/p2p/transport.js`).
- O espelho no Postgres grava `message.send` imediatamente, mas o destinatário só lê `messagesHistory` ao abrir um canal de um **espaço já conhecido localmente** (`providers/p2p.js`); não existe descoberta de conversas no boot. DM criada com peer offline nunca é aprendida: `createSpace` envia `space_invite` só por DC (`spaces.js:43`).
- Presença tem duas fontes sem reconciliação: `peer.closed` escreve `offline` mesmo com o peer online no hub (`stores.js:135`); o status escolhido pelo usuário (idle/dnd/invisible) só vai por DC — `presence.publish()` do hub nunca é chamada (`supabase/presence.js`).
- `users.presences()` do provider só consulta peers DC — no boot todos aparecem offline até o pareamento completar.
- O canal `prosa:space:<spaceId>` previsto na spec anterior §6 **não foi implementado** — nenhum evento de domínio (edit/delete/reaction/pin/member.*/typing) trafega pelo hub; `postgres_changes` não é usado.
- `applyEvent` aceita `seq > curMax` sem exigir consecutividade (`eventlog.js:40`): um evento que chega **depois** de um seq maior do mesmo autor é descartado permanentemente — relevante para relay não ordenado.

---

## 2. Escopo

### Incluído

- **Presença confiável:** status do usuário no payload do `track`; reconciliação determinística entre presença DC e presença hub; presença de boot a partir do `stateOf` do hub; "visto por último" best-effort a partir de `profiles.last_seen_at`.
- **Canal de espaço `prosa:space:<spaceId>`:** relay de envelopes assinados de domínio quando membros estão online no hub mas sem DC; `typing` pelo mesmo canal quando o destinatário não tem DC.
- **Convergência offline (mailbox):** migração `0002` com `space_events` (envelopes completos assinados) e `conversations.genesis`; boot descobre conversas do usuário e puxa eventos faltantes em ordem — convergência sem depender do peer online.
- Indicador mínimo de estado de envio na UI (pendente → entregue), se D5 adotado.
- Testes de regressão do código novo + roteiro manual entre dois clientes.

### Fora de escopo (nesta etapa)

- Supabase Auth, login/cadastro, RLS restritivo (permanece permissivo de dev — a exposição amplia-se com o mailbox e segue documentada como limitação de projeto descartável).
- `postgres_changes` como fonte de eventos (avaliada e rejeitada — ver §11/D4).
- Relay de **mídia/arquivos** (bytes de anexos continuam só por DC; envelope chega, conteúdo do arquivo não — limitação documentada).
- `voice_state`/sinalização de mídia pelo canal de espaço (voz exige DC de qualquer forma).
- Provider `server` e backend Express (inertes); IPC do Electron (nenhum novo).
- Push nativo/notificações de sistema; retenção/TTL de `space_events` (dev ilimitado).
- Persistência da `pendingQueue` do transporte (problema ortogonal; o mailbox cobre o caso de uso ponta a ponta).

---

## 3. Regras de negócio

1. **DC continua o transporte preferencial.** O hub relaya um envelope apenas quando há membro online-no-hub sem DC alcançável (D1); nunca substitui o DataChannel entre peers conectados.
2. **O canal do hub não é confiável.** Todo envelope relayado passa por `validateEnvelope` + `applyEvent` (assinatura Ed25519 + seq), como se viesse por DC. Payloads de broadcast são dados, não instruções.
3. **Fonte de verdade inalterada:** o log local de eventos. `space_events` no Postgres é espelho consultável para convergência; escrita idempotente por `event_id`.
4. **Presença efetiva = união ordenada de fontes** (ver §6): DC aberto vence (carrega status rico); sem DC, hub; sem ambos, offline. Nenhuma fonte sobrescreve a outra cegamente no store.
5. **Descoberta de conversas:** no boot, o nó consulta suas memberships no Postgres; espaço desconhecido é reconstruído pelo `genesis` assinado espelhado — mesmo caminho de `acceptSpaceInvite`.
6. **Idempotência ponta a ponta:** o mesmo evento por DC + relay + pull aplica uma única vez (dedupe por `env.id`/`author:seq` já existente).

---

## 4. Requisitos

### Funcionais

- **RF-01** O `track` de presença publica `{displayName, status, ts}` com `status ∈ {online, idle, dnd, offline}`; `users.setPresence` propaga ao hub além do DC; `invisible` é publicado como `offline` para observadores (semântica existente preservada — o CSS já trata `invisible` como offline).
- **RF-02** Resolver único de presença no store: `presences[userId]` passa a ser derivado de duas fontes (`dc`, `hub`) com precedência DC > hub > offline; `peer.closed` não apaga presença de hub e evento de hub não apaga status rico do DC.
- **RF-03** No boot (e ao observar novo contato), `users.presences()` inclui o `stateOf` do hub para contatos observados — amigos online aparecem online antes do pareamento completar.
- **RF-04** Canal `prosa:space:<spaceId>` criado para cada espaço do nó quando o hub está ativo; remetente publica `{v, kind:'relay', env}` somente se existir membro online-no-hub e sem DC (D1); `typing` publica `{v, kind:'ctl', type:'typing', channelId}` quando o espaço tem membro nessa condição.
- **RF-05** Envelope recebido por `relay` é validado (assinatura + espaço conhecido + seq) e aplicado pelo mesmo caminho de `node.receive` para eventos de domínio; tráfego de relay **não** alimenta `lastSeen`/ACKs do transporte nem marca peer como DC-online.
- **RF-06** Lacuna de seq detectada em relay (evento chegou fora de ordem) → buffer curto por `(spaceId, author)`; se a lacuna persistir, pull de `space_events` recupera os faltantes em ordem `(author, seq)`.
- **RF-07** Migração `0002` cria `space_events (event_id PK, space_id, author, seq, type, ts, envelope jsonb)` + índice `(space_id, author, seq)`, e coluna `conversations.genesis jsonb`; RLS segue a política dev existente.
- **RF-08** `mirrorEvent` passa a gravar o envelope completo em `space_events` para **todos** os tipos aplicados (não só `message.*`), e `space.genesis`/`member.add` atualizam `conversations.genesis` — idempotente por `event_id`.
- **RF-09** No boot com hub: (a) `conversation_members` → espaços onde sou membro; (b) espaço desconhecido → `conversations.genesis` → `acceptSpaceInvite`; (c) por espaço, pull de `space_events` com `seq > have[author]` ordenado → aplica via validação+`applyEvent` (equivalente a `handleSyncEvent`).
- **RF-10** (D5) Estado de envio na UI: mensagem recém-enviada marca "enviando…" até `waitAcks` de ao menos um peer **ou** publicação do relay confirmada; timeout marca "entregue ao hub/sem confirmação" sem bloquear.

### Não funcionais

- **RNF-01** Nenhuma credencial nova nem privilegiada no app; somente `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` já existentes.
- **RNF-02** Protocolo de fio P2P inalterado: mesmo envelope assinado, mesmos tipos; hub é transporte alternativo. Um cliente sem hub continua 100% compatível.
- **RNF-03** Degradação: hub ausente/indisponível → comportamento atual integral; falha de publish/pull nunca bloqueia envio nem aplicação local.
- **RNF-04** Nenhuma dependência nova no renderer; nenhum IPC novo no Electron.
- **RNF-05** Fan-out contido: publish de relay apenas quando necessário (D1); canais de espaço por espaço conhecido — impacto de quota do Realtime documentado no README.
- **RNF-06** Suites `npm test` e `npm --prefix web test` verdes; `npm run build` ok.

---

## 5. Estado, persistência e migrações

### Migração `0002_space_mailbox.sql` (projeto dev)

|| Objeto | Definição | Uso |
|---|---|---|
|| `conversations.genesis` | `jsonb` nullable | envelope `space.genesis` assinado — reconstrução de espaço desconhecido |
|| `space_events` | `event_id text PK`, `space_id text`, `author text`, `seq int`, `type text`, `ts bigint`, `envelope jsonb not null` | espelho completo e verificável do log de eventos |
|| índice | `(space_id, author, seq)` | pull convergente ordenado |
|| RLS | policy `for all to anon using (true)` | mesma política dev do `0001` |

- Idempotência: `event_id` é `spaceId:author:seq` — upsert `ON CONFLICT` seguro; remetente **e** receptores espelham (D3 da spec anterior preservada).
- `conversations.genesis` é atualizado quando `member.add` re-emite genesis (formato de `inviteToSpace`) — último escrito vence, ambos são válidos para reconstrução.
- Sem migração destrutiva sobre dados reais (Postgres de dev); `messages` e demais tabelas do `0001` permanecem — `space_events` é aditiva.
- Sem retenção nesta etapa: volume de dev é baixo; registrar no README que a tabela cresce sem TTL.

---

## 6. Contratos afetados

### Canais Realtime

| Canal | Evento | Payload | Quando publica |
|---|---|---|---|
| `prosa:presence:<pubkey>` | presence (track) | `{displayName, status, ts}` — `status`: `online`/`idle`/`dnd`/`offline` (invisible→offline) | boot, reconexão, `setPresence` |
| `prosa:user:<pubkey>` | broadcast `signal`/`notify` | inalterado | inalterado |
| `prosa:space:<spaceId>` | broadcast `relay` | `{v:1, kind:'relay', env:<envelope assinado>}` | membro online-no-hub sem DC |
| `prosa:space:<spaceId>` | broadcast `ctl` | `{v:1, kind:'ctl', type:'typing', channelId, ts}` | typing com membro sem DC |

### Frontend (módulos)

- `supabase/presence.js` — payload com `status`; `syncPeer` repassa status (não só online/offline); `publish(status)` passa a ser chamada por `setPresence`.
- `supabase/space-channel.js` **(novo)** — subscribe/publish de `prosa:space:*`; filtra `env.spaceId`/dedupe preliminar por `env.id`.
- `supabase/inbox.js` **(novo)** — `listMemberships(pubkey)`, `getGenesis(spaceId)`, `spaceEventsSince(spaceId, have)`; orquestra a convergência de boot.
- `supabase/persistence.js` — `upsertSpaceEvent(env)`, `upsertGenesis`; `mirrorEvent` cobre todos os tipos.
- `p2p/node.js` — monta `space-channel`/`inbox` no hub; recebe envelopes relayados; propaga `status` ao track em `setPresence`.
- `stores.js` — `presences` vira resolução de duas fontes (`dc`, `hub`); `presenceOf` mantém contrato.
- `providers/p2p.js` — `users.setPresence` também publica no hub; `users.presences()` mescla `stateOf`; contrato da UI **inalterado**.

### Env/infra

- Nenhuma variável nova; migração `0002` aplicada com `psql "$SUPABASE_DB_URL" -f` (mesmo procedimento do `0001`).
- API, erros, IPC, eventos P2P existentes: **não se aplica** — sem mudança de superfície.

---

## 7. Falhas e recuperação

- **Hub down:** nada muda em relação a hoje — DC/manual segue funcional; publishes falham silenciosamente (`logDiag`).
- **Duplicata DC + relay + pull:** dedupe por `env.id` (`seen`) e `author:seq` (`applyEvent`) absorve; aplicação única garantida.
- **Fora de ordem no relay:** buffer por `(spaceId,author)`; lacuna persistente → pull ordenado de `space_events` (RF-06).
- **Relay para espaço que o destinatário ainda não conhece:** `validateEnvelope` rejeita `espaco-desconhecido` — o pull de boot (RF-09) cobre o caso; genesis por `conversations.genesis` precede o pull de eventos.
- **Envelope adulterado no canal:** assinatura inválida → descarte (canal não confiável, RN-2).
- **Realtime reconecta:** re-inscrição nos canais de espaço e re-track de presença (mesmo padrão já usado no `prosa:user:*`).
- **Duas origens de status divergem** (ex.: DC diz `dnd`, hub diz `online`): precedência DC > hub resolve deterministicamente; quando o DC cai, o status do hub assume (pode estar defasado — documentado).

---

## 8. Autenticação, autorização e privacidade

- **Sem auth** — anon key compartilhada; RLS permissivo de dev permanece.
- **Ampliação de exposição:** `space_events` guarda envelopes completos (conteúdo de mensagens + assinaturas); `conversations.genesis` expõe membros/admins. Já é a natureza do espelho — reforçar no README que o projeto segue **dev/descartável, só dados de teste**.
- Canal `prosa:space:*` é público (sem autorização por canal na anon key): qualquer portador da key pode assinar/publicar — mitigado pela verificação de assinatura no receptor (RN-2), mas **payloads são legíveis** por qualquer assinante. Documentado.
- `SUPABASE_DB_URL`/`SUPABASE_SECRET_KEY` continuam fora do app, só para migrações.

---

## 9. Modos, plataformas e UI

- Modo `p2p` (único ativo): tudo aditivo ao hub; sem hub, nada muda. Modo `server`: não se aplica.
- UI: `presenceOf`/dot já suportam `online|idle|dnd|offline|invisible` (`style.css`) — sem trabalho novo para status rico; "visto por último" é adição discreta opcional na lista de amigos (RF-03/D5).
- Electron desktop e browser dev: Realtime roda no renderer; sem novos IPCs.

---

## 10. Estratégia de testes

**Automatizados (`web/test/`)**

- Resolver de presença (precedência DC>hub, `peer.closed` com peer online no hub, boot via `stateOf`).
- Space-channel: publish condicional (só quando membro sem DC), dispatch de `relay`/`ctl`, dedupe.
- Reordenação: seq fora de ordem → buffer/pull; dedupe DC+relay.
- Inbox: mapeamento envelope→linha `space_events`, convergência ordenada, genesis→`acceptSpaceInvite`.
- Suites existentes intactas: `npm test`, `npm --prefix web test`, `npm run build`, `git diff --check`.
- Migração `0002` aplicada ao projeto dev via `psql` e verificada via API.

**Manual (dois clientes)**

- A com app aberto, B fechado → A muda status para "Ocupado", envia mensagem na DM → B abre o app: aparece online corretamente, descobre/atualiza o espaço e vê a mensagem **sem parear** (ou antes do DC abrir).
- A e B online no hub, DC falha (simular bloqueio) → mensagem chega por relay; edição/reação também.
- Queda do hub com DC aberto → chat segue; volta do hub → presença e canais retomam.
- Cliente sem hub continua funcional (regressão).

---

## 11. Riscos e decisões em aberto

### Riscos

- Relay duplica caminho de entrega — mitigado por dedupe existente e publish condicional (D1).
- `space_events` cresce sem TTL; aceito em dev, revisar antes de dados reais.
- Quota Realtime (free): canais por espaço + broadcasts extras — volume doméstico baixo; documentado.
- Boot pull pode ser lento com muitos espaços/eventos — paginação por `(space_id, author, seq)`; dev não exige otimização adicional.

### Decisões (todas adotadas em 2026-10-22, opções recomendadas)

- **D1 — Política de relay:** (a) condicional — publica só quando há membro online-no-hub sem DC **[adotada]**.
- **D2 — Alcance do mailbox:** (a) `space_events` completo — cobre edits, reações, member.*/channel.* e descoberta de espaços **[adotada]**.
- **D3 — Revisão da D4 da spec `supabase-local-backend`** ("entrega 100% efêmera" → mailbox persistido): mailbox persistido **[adotado]** — a entrega efêmera deixa de ser a regra para eventos de domínio.
- **D4 — `postgres_changes` vs broadcast:** broadcast explícito com envelopes **[adotado]**.
- **D5 — Indicador de envio na UI:** (a) incluir mínimo "enviando→entregue" **[adotada]**.

---

## 12. Critérios de aceite

- **CA-01** (RF-01/02) Status `idle`/`dnd` de um amigo aparece via hub **sem** DC aberto; `invisible` aparece offline.
- **CA-02** (RF-02/03) Peer online no hub sem DC aparece online na lista de amigos já no boot; `peer.closed` posterior não o derruba para offline.
- **CA-03** (RF-04/05) Mensagem enviada com o peer online-no-hub e sem DC chega por relay e é aplicada no log local do destinatário.
- **CA-04** (RF-07/08/09) Mensagem enviada com o peer totalmente offline aparece no espaço do destinatário após boot + pull — sem DC.
- **CA-05** (RF-09) DM criada com o peer offline é descoberta no boot do destinatário via `conversations.genesis`.
- **CA-06** (RF-05/06) Mesmo evento por DC+relay+pull aplica uma única vez; seq fora de ordem é recuperado (buffer ou pull).
- **CA-07** (RF-08) `message.edit`/`message.delete`/`reaction` convergem no destinatário sem DC (pull ou relay).
- **CA-08** (RNF-03) Sem hub: pareamento manual e chat P2P funcionam como hoje (sem regressão).
- **CA-09** (RF-04) `typing` aparece entre peers sem DC via canal de espaço.
- **CA-10** (RNF-01) Nenhuma credencial nova; diff sem segredos; `.env.example` inalterado ou só com placeholders.

---

## 13. Resumo

Três frentes aditivas ao hub: (1) presença com status real e reconciliação de fontes; (2) canal `prosa:space:*` com relay verificado de envelopes + `typing`; (3) mailbox `space_events` + `conversations.genesis` com convergência de boot. Nenhuma mudança de protocolo P2P nem de superfície de UI; o DC permanece o transporte preferencial e o hub degrada graciosamente. Decisões D1–D5 pendentes de posição do usuário.

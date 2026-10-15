# Spec: Arquitetura P2P experimental para o Prosa

**Nome da spec:** `p2p-architecture`
**Status:** aguardando aprovação
**Data:** 2026-10-15

---

## 1. Visão geral e objetivos

Migrar o Prosa de uma arquitetura exclusivamente cliente-servidor para uma arquitetura **P2P experimental**, na qual dois ou mais usuários se comuniquem diretamente, com persistência local em cada dispositivo e sem depender de um backend central para o funcionamento normal da conversa.

Objetivos:

- Permitir que um grupo pequeno de amigos use o Prosa trocando dados diretamente entre dispositivos.
- Manter cada instalação autocontida: identidade, mensagens e dados de comunidade persistem localmente.
- Introduzir uma camada de abstração de backend/transporte que permita trocar o provedor P2P por cliente-servidor ou híbrido no futuro, sem reescrever a UI.
- Preservar as funcionalidades existentes sempre que tecnicamente viável, documentando explicitamente o que fica degradado ou impossível sem um nó de infraestrutura.

Não-objetivos desta fase:

- Descoberta pública de usuários na internet (diretório global).
- Entrega garantida de mensagens a usuários offline sem peers disponíveis.
- Moderação global, denúncias centralizadas e painel administrativo federado.
- Comunidades grandes (> ~20 membros) com governança complexa — a primeira versão mira grupos pequenos de amigos.

---

## 2. Diagnóstico da arquitetura existente

### 2.1 Fatos confirmados pela análise do código

**Backend (`server/`)**

- `server/src/index.js`: Express + `node:http` + `ws`. Monta rotas `/api/*`, `/uploads` (estático autenticado), `web/dist` com fallback SPA. Headers de segurança (`nosniff`, `DENY`, `same-origin`).
- `server/src/config.js`: lê `.env` manualmente (`DATA_DIR`, `UPLOAD_DIR`, `WEB_DIST`, `ICE_SERVERS_JSON`, `SMTP_*`, `MAX_UPLOAD_MB`, `SESSION_TTL_DAYS`).
- `server/src/db.js`: `DatabaseSync` (`node:sqlite`) em `data/prosa.db` com WAL. Tabelas: `migrations`, `users`, `sessions`, `password_resets`, `friendships`, `communities`, `members`, `invites`, `bans`, `categories`, `channels` (types `text`/`voice`/`dm`/`group_dm`), `dm_members`, `messages`, `attachments`, `reactions`, `read_states`, `audit_log`, `reports`.
- `server/src/auth.js`: registro/login com bcryptjs; sessões opacas (cookie httpOnly `prosa_session` ou Bearer); recuperação de senha por token (SMTP opcional; em dev vai para o log).
- `server/src/permissions.js`: cargos `owner`/`admin`/`moderator`/`member`, hierarquia e `channelContext` — a autoridade de permissões é o servidor.
- `server/src/realtime.js`: `WebSocketServer` em `/ws`; autentica por `?token=` ou cookie. Mantém `sockets` (userId→ws), `voiceStates` (channelId→estado de cada participante), presença manual/efetiva, `relatedUserIds` (amigos + co-membros + co-DMs via SQL central). Eventos tratados: `PRESENCE_SET`, `TYPING`, `VOICE_JOIN/LEAVE/UPDATE`, `SIGNAL` (relay WebRTC restrito a co-membros do voice channel), `DM_CALL_SIGNAL` (relay restrito a co-membros de um canal dm/group_dm). Eventos emitidos: `READY`, `PRESENCE_UPDATE`, `TYPING`, `VOICE_STATE`, `MESSAGE_CREATE/UPDATE/DELETE`, `CHANNEL_CREATE/DELETE`, `COMMUNITY_UPDATE/DELETE`, `MEMBER_JOIN/LEAVE`, `DM_CREATE`, `RELATIONSHIP_UPDATE`, `NOTIFY`, `USER_UPDATE`, `SIGNAL`, `DM_CALL_SIGNAL`, `ERROR`.
- `server/src/routes/`: `users.js` (@me, presença, senha, relationships, presences), `communities.js` (CRUD comunidade/categorias/canais, convites, join/leave, kick/ban/unban, cargos, audit log), `messages.js` (histórico paginado, enviar/editar/excluir, pins, reactions, read, menções, slowmode), `dms.js` (listar, abrir 1:1, grupo, sair), `misc.js` (`/config` público, voice snapshot, uploads multer com whitelist MIME + 25 MB, busca, reports), `admin.js` (users, suspend, communities, reports, stats).
- `server/test/api.test.js`: 11 testes `node:test` sobem o servidor em porta aleatória com `DATA_DIR` temporário; cobrem config, auth, permissões, mensagens, convites, ban, audit, WS broadcast, busca.

**Frontend (`web/`)**

- `web/src/api.js`: `API_BASE` = `window.prosaDesktop.apiBase` → `VITE_API_URL` → origem; token em `localStorage` (`prosa_token`); `api()` com Bearer + cookies; `uploadFiles` via FormData.
- `web/src/stores.js`: `store` reativo global (user, communities, channels, members, messages, dms, relationships, presences, voice, notifications, typing); `connectWs`/`wsSend`/`onWs`/`dispatch` concentram todo o cliente WS; loaders (`loadCommunities`, `loadDms`, `loadRelationships`, `loadPresences`, `openChannel`, `sendMessage`).
- `web/src/rtc.js`: mesh WebRTC real — `rtc.peers` Map `${channelId}:${userId}` → `{pc, stream}`; offer/answer com glare resolvido por comparação de userId; ICE relayed via `SIGNAL`; `joinVoice`/`leaveVoice`/`toggleMute`/`toggleVideo`/`toggleScreen`/`toggleDeafen`. **A mídia já é P2P; só a sinalização depende do servidor.**
- Views/componentes chamam `api()` diretamente (~30 endpoints) e `wsSend` — acoplamento direto à API REST + WS.
- `web/desktop/main.cjs`: `BrowserWindow` com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`; whitelist de permissões (media, display-capture, notifications); `will-navigate` e `setWindowOpenHandler` restringidos; IPC `app:info`.
- `web/desktop/preload.cjs`: expõe apenas `window.prosaDesktop` (`isDesktop`, `platform`, `apiBase`, `appInfo()`).
- `web/electron-builder.yml`: empacotamento `.dmg` (universal/arm64/x64, assinatura ad-hoc), `.exe` NSIS x64/arm64, `.deb` x64/arm64; `files: desktop/**, dist/**, package.json`.
- `web/vite.config.js`: `base: './'` (file:// no Electron), proxy dev `/api`, `/uploads`, `/ws` → :4000.

### 2.2 O que depende diretamente do backend central

| Funcionalidade | Dependência | Grau |
|---|---|---|
| Contas, login, reset de senha | `auth.js` + tabelas `users`/`sessions`/`password_resets` | Total — não existe sem servidor |
| Busca de usuários por username | `users` central (UNIQUE username) | Total — não existe diretório global em P2P |
| Amigos (por username) | `friendships` central | Total — lookup por nome pressupõe diretório |
| Comunidades, convites, cargos, bans, audit | `communities.js` + `permissions.js` | Total — autoridade é o servidor |
| Mensagens (criar/editar/deletar/reagir/pin) | `messages.js` + `MESSAGE_*` WS | Total |
| Histórico paginado e busca | SQL central | Total |
| Anexos | `/uploads` + multer + estático autenticado | Total |
| Presença | `realtime.js` (`sockets`, `relatedUserIds`) | Total |
| Sinalização WebRTC | `SIGNAL`/`DM_CALL_SIGNAL` no WS | Total (única parte que vira P2P facilmente) |
| Admin global / denúncias | `admin.js` + `reports` | Total — sem análogo P2P simples |
| Config pública (`/api/config`: ICE servers) | `misc.js` | Baixa — pode virar config local |

### 2.3 Divergências código × documentação

- `DM_CALL_SIGNAL` existe e é validado em `realtime.js`, mas **nenhum código do frontend o usa** — chamadas de voz em DM não estão implementadas no cliente.
- O README diz "12 testes"; `api.test.js` contém 11 testes.
- `docs/docs.md` e `docs/` não existem no repositório atual.

---

## 3. Arquitetura proposta

### 3.1 Princípio estrutural: três camadas com contratos fixos

```
┌─────────────────────────────────────────────────────────┐
│ UI (Vue 3 — views, componentes, store)                  │
│  Nunca fala com rede nem SQLite diretamente             │
├─────────────────────────────────────────────────────────┤
│ Service Layer (renderer, JS puro)                       │
│  account, contacts, communities, messaging, calls,      │
│  files, presence — interface única estável              │
├─────────────────────────────────────────────────────────┤
│ Provider Layer (Electron main + renderer)               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ P2P provider │  │ C/S provider │  │ Híbrido (fut.)│  │
│  │ WebRTC DC +  │  │ Express+WS   │  │               │  │
│  │ SQLite local │  │ SQLite remoto│  │               │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **Service Layer** (`web/src/services/*.js`): API única consumida pela UI e pelo `store`. Hoje, `api()` + `wsSend`/`onWs` são o contrato implícito; a migração extrai esse contrato para métodos nomeados (`services.messages.send`, `services.contacts.add`, etc.).
- **Provider Layer**: implementa as mesmas operações contra transportes diferentes. O provider C/S é basicamente o código atual (`api.js` + `stores.js` WS) refatorado. O provider P2P usa WebRTC DataChannel para transporte e SQLite local para persistência.
- **Electron main** passa a hospedar, para o provider P2P: o par de chaves de identidade, o SQLite local, os listeners/auxiliares de rede que não cabem no renderer sandboxed (WebRTC roda no renderer — já funciona hoje em `rtc.js`; operações de arquivo e banco vão ao main via IPC). O preload expõe um bridge `prosaDesktop.data` mínimo e tipado, nunca acesso irrestrito.

### 3.2 Identidade

- Cada instalação gera um par de chaves **Ed25519** na primeira execução (Electron main, `crypto.subtle` ou `node:crypto`). A chave privada nunca sai do main; o renderer recebe apenas a chave pública e assinaturas sob demanda via IPC.
- `userId` deixa de ser UUID do servidor e passa a ser a **chave pública** (ex.: base32 fingerprint `prosa:xxxx…` curto para exibição, chave completa como identidade).
- Perfil (username/displayName/avatar/bio) vira um **documento assinado** publicado pelo próprio usuário — qualquer peer pode verificar a assinatura; não há mais unicidade global de username (ver §8).
- Confiança entre pares ("amizade") é estabelecida por troca de chaves: link `prosa://friend/<pubkey>` ou QR/fingerprint mostrado fora de banda. Aceitar um convite de amizade = registrar a chave pública do par como contato confiável.
- Senhas/e-mail/reset: **não existem no modo P2P**. A identidade é a posse da chave; backup/exportação do segredo é funcionalidade futura (ver decisões pendentes). `AuthView` é substituída por fluxo "criar/importar identidade" no modo P2P.

### 3.3 Transporte e protocolo

- **Canal de dados:** `RTCDataChannel` sobre `RTCPeerConnection` — o mesmo mecanismo já usado para mídia. Um canal de controle (reliable/ordered) por par de peers, mais canais efêmeros para transferência de arquivos.
- **Sinalização:** WebRTC exige troca inicial de SDP/ICE fora de banda. A spec adota dois mecanismos, ambos auxiliares e claramente identificados:
  1. **Introdução manual (obrigatória na v1):** link/QR `prosa://connect/<payload>` contendo chave pública + oferta SDP codificada + hints de endereço. O convidado responde com sua resposta por outro link (copy-paste ida-e-volta, estilo "pairing"). Funciona sem nenhum servidor.
  2. **Serviço de rendezvous opcional (auxiliar, não transporte):** um endpoint mínimo tipo "caixa postal" que guarda ofertas por chave pública por tempo limitado. É infra auxiliar explicitamente não-essencial — sem ele, o fluxo manual continua funcionando. Um peer "sempre ligado" de um amigo pode fazer esse papel.
- **ICE:** `ICE_SERVERS_JSON` passa a ser config local por instalação (mesma env var; `/api/config` deixa de existir no modo P2P). STUN default Google permanece configurável. **TURN continua necessário em NATs simétricos** — documentado como limitação/infra auxiliar, não como transporte de dados.
- **Descoberta em LAN (opcional):** mDNS/broadcast UDP no Electron main para achar peers na mesma rede sem link manual. Bonito de ter; não é requisito da v1.
- **Mensagens do protocolo:** envelopes JSON assinados `{v, type, id, from, to, ts, body, sig}` enviados pelo canal de controle. Tipos iniciais: `hello`/`profile`, `ping`, `msg`, `msg_edit`, `msg_delete`, `reaction`, `read`, `typing`, `presence`, `sync_req`/`sync_res`, `file_offer`/`file_chunk`/`file_done`, `voice_state`, `signal` (sinalização WebRTC de mídia sobre o canal já estabelecido), `admin_event` (comunidade).
- **Store-and-forward:** peers do mesmo espaço (comunidade/grupo) carregam cópias replicadas do log; um peer offline recebe o delta ao reconectar via `sync_req` desde `last_seen_seq` por espaço. Mensagens 1:1 para contato offline ficam **pendentes** até ambos estarem online, ou até um peer comum do espaço poder retransmitir. Ver §5.4.

### 3.4 Modelo de dados e sincronização

- Cada nó mantém SQLite local (`node:sqlite` no Electron main, ou no processo do provider) com schema derivado do atual, adaptado:
  - `users` → `contacts`/`profiles` (pubkey, display name assinado, trust, last profile event).
  - `messages`/`attachments`/`reactions`/`read_states`/`channels`/`categories`/`dm_members`/`members`/`communities`/`bans` — mesmas formas, mas populadas por **eventos replicados**, não por queries do servidor.
  - Nova tabela `events` (log por espaço): `space_id`, `seq` (lâmpada lógica do autor), `author_pubkey`, `type`, `body` (JSON), `sig`, `received_at`. O log é a fonte da verdade; as demais tabelas são projeções materializadas.
- **Ordenação/conflitos:** cada evento carrega `seq` por `(space_id, author)` + timestamp. Estado convergente por regra determinística:
  - Mensagens: append-only por ID; edições/exclusões resolvem por "último evento do autor vence" (o autor é dono dos próprios IDs de mensagem — só ele emite `msg_edit`/`msg_delete` válidas).
  - Reações/pins/read_states: LWW por `(autor, alvo)` com tiebreak `seq`→`author_pubkey`.
  - Estrutura de comunidade (canais, cargos, bans, convites): log de administração assinado; ver §5.2.
- **Sync:** ao conectar, peers trocam `{space_id, author_pubkey → max_seq}`; quem tem eventos que o outro não tem envia `sync_res` com o delta. Confiança no conteúdo vem da assinatura de cada evento, não do peer que retransmite — qualquer peer pode servir eventos de qualquer autor, inclusive para um terceiro.

### 3.5 Comunidades, canais, cargos e permissões

- **Comunidade = conjunto de eventos fundadores + log de administração.** Criar uma comunidade emite `community_create` assinado pelo criador, que vira `owner`. O `community_id` deriva do hash do evento fundador.
- **Autoridade:** cada nó valida eventos administrativos localmente:
  - Apenas a chave do `owner` (e delegados com cargo `admin` registrado em evento do owner) pode emitir `role_grant`, `channel_create/delete`, `ban`, `community_update`.
  - Moderadores/admin só têm poder de ação se o cargo foi concedido por evento do owner que esteja no log comum — nunca por autodeclaração.
  - `kick`/`ban` de cargos superiores é rejeitado na validação local (mesma regra `canActOn` de `permissions.js`, reaproveitada).
- **Convites:** convite passa a ser um **token de introdução** assinado por um membro com permissão: contém `community_id`, chave do convidante, e prova de capacidade (o evento `invite_grant` assinado no log). Aceitar = trocar chaves com um membro online que sirva de "anfitrião", receber o log replicado e emitir `member_join` assinado — que membros com `manage_community` ou o anfitrião ratificam replicando. Sem nenhum membro online, entrar em comunidade é impossível (limitação documentada).
- **Bans:** evento `ban` no log; cada nó se recusa a aceitar eventos do banido naquele espaço e a retransmitir seu conteúdo novo. Não impede que o banido guarde cópia — apenas que participe.
- **Audit log:** o próprio log de eventos é o audit trail; `view_audit_log` vira filtro sobre `events` onde `type ∈ admin_*`.
- **Presença:** derivada da conectividade real — um usuário é `online` para mim se tenho canal aberto com ele ou recebi presença retransmitida recentemente (retransmitida carrega timestamp assinado e expira). `invisible`/`idle`/`dnd` viram estados publicados no envelope `presence`.

### 3.6 Mensagens e tempo real

- Envio: `services.messages.send` grava o evento assinado no log local e o empurra por todos os canais abertos do espaço (fan-out peer-a-peer). ACKs (`ack` por `event_id`) marcam entrega a cada peer direto; o status "entregue a N pessoas" é visível ao remetente.
- Edição/exclusão/reação: eventos correspondentes; o receptor valida autoria antes de aplicar.
- Typing/presença: envelopes efêmeros (não persistidos) retransmitidos por um salto dentro do espaço.
- DMs: canal `dm`/`group_dm` é apenas um espaço cujo conjunto de participantes é o `dm_members` fundador/grupo — sem servidor para "abrir DM"; abrir DM = criar o espaço e convidar as chaves.
- Busca: `LIKE` local sobre mensagens já replicadas — cobre só o que o nó possui. Busca global some sem servidor (limitação).

### 3.7 Transferência de arquivos

- Anexo deixa de ser upload HTTP: o arquivo fica no disco do remetente (`uploads/` local) e é anunciado no evento `file_offer` `{hash, name, mime, size, chunk_size}`.
- O destinatário baixa por `file_chunk` request/response num DataChannel dedicado, verificando `sha256` por chunk e o hash global no fim. Somente participantes do espaço podem pedir chunks (a oferta é assinada no evento do espaço).
- Cache local de downloads; imagens inline funcionam com `file:`/`prosa-file://` servido pelo main (nunca expor paths arbitrários ao renderer — IPC com whitelist por hash).
- Whitelist de MIME e limite de tamanho do `misc.js` são preservados como validação local do remetente; cada receptor pode impor limite próprio de download.

### 3.8 Voz, vídeo e compartilhamento de tela

- `rtc.js` é reaproveitado com mudança mínima: `wsSend('SIGNAL', …)` vira `transport.send(peerId, 'signal', …)` sobre o canal de controle já aberto.
- Entrar num canal de voz = publicar `voice_state` no espaço (efêmero). A malha WebRTC de mídia é independente do canal de dados.
- `DM_CALL_SIGNAL` — hoje **implementado no servidor mas nunca usado pelo frontend** — passa a ser o caso trivial: sinalização sobre o canal DM já existente; se a UI ganhar chamada DM, cai de graça.
- Limites do mesh (~6–8 participantes) se mantêm e agora valem para o espaço inteiro.

### 3.9 Electron e empacotamento

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` — **preservados**. Nenhuma necessidade técnica de afrouxá-los.
- `preload.cjs` ganha um bridge tipado `prosaDesktop.p2p`: operações de identidade (pubkey, assinar/verificar), storage (queries/operações do service layer), helpers de rede (gerar link de convite com endereços locais, escuta LAN opcional). Cada operação é uma função nomeada; o renderer nunca recebe `fs`, `node:sqlite` ou a chave privada.
- `main.cjs` ganha o processo "nó" P2P no main (ou um utilityProcess filho): SQLite, chaves, eventual listener UDP/mDNS. Sem alteração em `webSecurity` porque WebRTC no renderer funciona em `file://` com permissões já liberadas.
- `electron-builder.yml` e os comandos `dist:*` **não mudam** nesta fase; `files` já cobre `desktop/**` e `dist/**`. Se `node:sqlite` não existir no runtime do Electron 33 (Node embutido ≠ Node do sistema — ver risco), a alternativa é SQLite via WASM compilado no bundle (sql.js) ou `better-sqlite3` com rebuild — **decisão pendente registrada em §10**.
- `VITE_API_URL`/`PROSA_API_URL` continuam servindo o provider C/S para o modo atual coexistir durante a transição.

### 3.10 Modos de operação

A Service Layer seleciona provider em tempo de boot por config (`PROSA_MODE=p2p|server|hybrid` + UI de escolha na tela inicial):

- `server` (atual): Express + WS + SQLite central — comportamento idêntico ao de hoje.
- `p2p` (novo, experimental): identidade por chave, DataChannel, SQLite local.
- `hybrid` (futuro, fora de escopo da v1 mas preparado): servidor leve atuando como peer super/relay opcional usando o mesmo log de eventos — evolução natural, não reescrita.

---

## 4. Fluxos principais

### 4.1 Primeiro uso (modo P2P)

1. App gera identidade Ed25519 no main → fingerprint exibido.
2. Usuário define perfil (displayName, avatar) → evento `profile` assinado.
3. Compartilha link `prosa://friend/<pubkey>` com um amigo por qualquer canal externo.

### 4.2 Pareamento (sem servidor)

1. A gera link `prosa://connect` contendo `{pubkey_A, sdp_offer, ice_hints}`.
2. B cola o link → app responde `{pubkey_B, sdp_answer, ice_hints}` gerando outro link.
3. A cola a resposta → `RTCPeerConnection` + DataChannel sobem.
4. Handshake `hello` autentica os canais com as chaves (verificação que o par controla a chave anunciada).
5. `sync_req`/`sync_res` alinham os espaços em comum; conexão registrada para reconexão futura (endereços candidatos cacheados + novo ICE a cada sessão).

### 4.3 Envio de mensagem (espaço comum)

1. `services.messages.send` → evento `msg` assinado → log local + fan-out pelos canais abertos.
2. Receptor valida assinatura + seq + membership → aplica → ACK ao emissor direto → retransmite a peers do espaço que não o têm (epidemic, com dedupe por `event_id`).
3. UI atualiza por notificação do service layer (mesmo caminho que `MESSAGE_CREATE` hoje).

### 4.4 Usuário offline / reconexão

- Peer destinatário offline → eventos ficam no log de quem envia e de quem replicou; ao abrir canal, `sync_req` recupera delta. **Sem peer online que compartilhe o espaço, não há entrega** — limitação fundamental documentada.
- Comunidade cuja todos os membros estão offline: nenhum dado flui; o espaço "dorme" e acorda na próxima conexão.

### 4.5 Desconexão

- `pc.onconnectionstatechange failed/closed` → peer marcado offline; presença local atualizada; tentativa de reconexão com backoff usando candidatos conhecidos ou novo pareamento manual se o NAT mudou de perfil.

### 4.6 Voz

1. `services.calls.join(channel)` → publica `voice_state` efêmero → peers do espaço que entrarem/tiverem o canal aberto criam `RTCPeerConnection` de mídia (mesh existente) sinalizando pelo canal de controle.
2. Estado (mute/deafen/video/screen) é `voice_state` efêmero retransmitido — mesmo papel do `VOICE_STATE` atual.

---

## 5. Regras de negócio

1. **Nada de autoridade implícita:** toda decisão de permissão é validada localmente contra o log de eventos assinados do espaço; mensagens com assinatura inválida ou autoridade insuficiente são descartadas e logadas.
2. **Owner é a raiz de confiança da comunidade:** fundador no `community_create`. Não há recuperação de comunidade sem a chave do owner — se o owner perder a chave e estiver offline, a comunidade fica sem administração (limitação).
3. **Amizade ≠ contato transitivo:** conhecer a chave de alguém não dá acesso aos espaços dela; cada espaço tem seu próprio conjunto de membros verificado.
4. **Bloqueio é unilateral e local:** bloqueado tem seus eventos descartados e canais com ele fechados — replica o efeito do `blocked` atual sem servidor.
5. **Sem unicidade de username:** `@nome` é display local; identidade real é o fingerprint. Menções passam a referenciar pubkeys (UI resolve para o display name que o par publicou).
6. **Limites de conteúdo preservados:** mensagem ≤ 4000 chars, anexos ≤ 25 MB e whitelist de MIME do `misc.js`, ≤ 10 arquivos por mensagem — agora enforce no remetente (validação local) e o receptor pode impor o seu.
7. **Rate limiting:** sem servidor, o limit vira política local de aceitação (descartar flood por canal, por peer). Slowmode é propriedade do canal aplicada por cada nó sobre eventos recebidos e pelo próprio cliente antes de emitir.
8. **Contas/sessões, e-mail, reset de senha e painel admin não existem em modo P2P.** Denúncias (`reports`) podem permanecer como registro local; a ação administrativa global desaparece.

---

## 6. Requisitos

### Funcionais

- **RF-01** Gerar, guardar e exibir identidade Ed25519; permitir criar/importar perfil assinado.
- **RF-02** Adicionar contatos por link/QR de chave pública; aceitar/recusar/bloquear.
- **RF-03** Parear dispositivos por link de oferta/resposta, estabelecendo `RTCPeerConnection` + DataChannel de controle.
- **RF-04** Trocar envelopes assinados com verificação, deduplicação e ACK.
- **RF-05** DMs 1:1 e grupos funcionais quando os participantes estão online, com histórico persistente e sync na reconexão.
- **RF-06** Comunidades com canais de texto/voz, categorias, cargos e permissões validadas por eventos de administração assinados.
- **RF-07** Convite de comunidade por link portátil funcionando quando ao menos um membro autorizado está online.
- **RF-08** Mensagens com edição, exclusão, respostas, reações e pins, convergentes por LWW determinístico.
- **RF-09** Presença derivada de conectividade real + estados manuais publicados.
- **RF-10** Voz/vídeo/tela mesh reaproveitando `rtc.js` com sinalização sobre o canal de controle.
- **RF-11** Transferência de arquivos chunked com verificação de integridade por hash.
- **RF-12** Sync de eventos por espaço (`sync_req`/`sync_res`) com retomada por `seq` por autor.
- **RF-13** Persistência local completa (log de eventos + projeções) sobrevivendo a restart.
- **RF-14** Seleção de provider (`server`/`p2p`) sem reescrita da UI; o provider `server` preserva o comportamento atual.

### Não funcionais

- **RNF-01** Identidade e chaves privadas só no Electron main; renderer recebe IPC tipado.
- **RNF-02** `contextIsolation`, `sandbox`, `webSecurity` preservados; permissões de mídia whitelistadas como hoje.
- **RNF-03** Mensagens de controle ≤ 64 KB por envelope; chunk de arquivo padrão 16–64 KB; backpressure de DataChannel respeitado (`bufferedAmountLowThreshold`).
- **RNF-04** Sem dependências externas novas obrigatórias para o caminho P2P básico (WebRTC nativo do Chromium/Electron + `node:crypto`); qualquer lib adicional precisa ser justificada na implementação.
- **RNF-05** Toda a superfície do service layer testável sem rede real nem internet (provider em memória + loopback de DataChannel simulado onde viável).
- **RNF-06** Build `dist:*` e empacotamento inalterados; o app empacotado abre em modo seletor de provider.
- **RNF-07** Falhas de conectividade degradam graciosamente: UI mostra peer offline, envio fica pendente, nunca trava.

### Segurança

- Todo evento persistente é assinado (Ed25519) e verificado antes de ser aplicado ou retransmitido.
- Canal de controle já é cifrado por DTLS do WebRTC; a assinatura dos eventos adiciona autenticidade fim-a-fim entre aplicações.
- Chaves privadas jamais em `localStorage`, renderer, ou logs. Sessões/tokens legados existem só no provider `server`.
- IPC preload é lista fechada de operações; nenhum parâmetro arbitrário de caminho/SQL cruza o bridge.
- Endereços IP candidatos só são compartilhados dentro de espaços confiáveis (contatos/comunidade) — não há diretório público que vaze presença a desconhecidos.

---

## 7. Contratos (resumo de alto nível)

A Service Layer define, de forma agnóstica ao provider:

- **identity:** `init()`, `getProfile()`, `updateProfile()`, `exportInvite()`/`acceptInvite(payload)`
- **contacts:** `list()`, `request`, `accept`, `remove`, `block`, `unblock`, `presence` (subscribe)
- **spaces:** `createCommunity`, `joinByInvite(token)`, `leave`, `list`, `members`, `channels`, `admin.*` (roles, bans, categories, channels, audit)
- **messaging:** `history(channel, before, limit)`, `send`, `edit`, `delete`, `react`, `pin`, `read`, `typing`, `searchLocal`
- **files:** `attach(files)`, `fetch(ref)`, `url(ref)`
- **calls:** `joinVoice`, `leaveVoice`, `state.update`, `peers` (subscribe)
- **events:** `onEvent(type, fn)` — substitui `onWs`/`wsSend` para a UI

Os DTOs de domínio (`publicUser`, `communityDto`, `channelDto`, `messageDto`) são preservados como contratos públicos: a UI não muda de formato ao trocar de provider. Onde o P2P não produz dado (ex.: `username` único, `memberCount` global), o contrato admite `null` documentado.

---

## 8. O que funciona sem servidor × o que exige auxiliar

### Funciona 100% peer-a-peer (com NAT atravessável)

- Pareamento por link manual, identidade por chave, contatos.
- DMs e grupos online com histórico e sync na reconexão.
- Comunidades pequenas com estrutura/permissões por log assinado.
- Voz/vídeo/tela mesh (mídia já é P2P hoje).
- Arquivos diretos remetente→destinatário, persistência local, busca local.

### Exige mecanismo auxiliar (explicitamente não-transporte-de-dados)

- **Sinalização inicial fora da LAN:** link manual resolve sem infra; um "mailbox"/rendezvous opcional melhora UX (auxiliar declarado).
- **STUN:** necessário para a maioria dos NATs — já configurável; Google STUN default é dependência externa leve que pode ser trocada.
- **TURN:** obrigatório em NAT simétrico/firewall restritivo — o dado passa por relay; documentado como exceção à promessa "sem intermediário" nesses casos.
- **Entrega offline:** só existe se algum peer do espaço estiver online e retiver o log; sem isso, a entrega espera o próximo contato — **não é garantida**.
- **Convite a comunidade:** exige um membro autorizado online para introduzir o novo nó.

### Sem solução P2P simples nesta versão (degradado/ausente)

- Diretório/busca global de usuários por username.
- Reset de senha/e-mail, suspensão global, painel admin, denúncias com autoridade central.
- Disponibilidade do espaço quando todos os membros estão offline.
- Garantia de unicidade de nomes e de contagem global de membros.

---

## 9. Alternativas avaliadas

| Abordagem | Prós | Contras | Veredicto |
|---|---|---|---|
| **WebRTC DataChannel direto + log assinado (escolhida)** | Reusa `rtc.js`; transporte cifrado nativo; mínimo de deps novas; modelo mental alinhado ao atual | Sinalização inicial manual; sem offline delivery; NAT | **Adotada** para a v1 experimental |
| libp2p (js-libp2p) | Discovery, DHT, gossipsub prontos | Dependência grande, integração com Electron/renderer complexa, surface de auditoria grande, overkill p/ amigos | Rejeitada v1; reavaliar se escala |
| Matrix/ActivityPub federation | Protocolo maduro de sync federada | Requer homeserver = servidor de facto; não atinge o objetivo | Fora de escopo |
| BitTorrent/DHT (Hyperswarm/dat-style) | Descoberta P2P real sem servidor | Stack JS menos madura no renderer sandboxed; NAT sem tracker é limitado; auditoria de deps | Rejeitada v1; possível melhoria de discovery futura |
| CRDT (Yjs/Automerge) para estado | Convergência automática | Dependência pesada para um problema que LWW determinístico resolve no escopo | Não adotada agora; o log de eventos é compatível se virar requisito |
| Nostr-style relays | Sinalização+mailbox prontos | Relay público vira infra centralizada e vaza metadados | Rejeitada como padrão; um relay próprio é a opção "mailbox" |
| Peer-to-peer via WebSocket entre installs | Simples | Exige servidor WebSocket em algum lugar = backend | Não P2P de verdade |

---

## 10. Plano de compatibilidade com a arquitetura futura

- **Service Layer contratual (§7)** é o ponto único de troca: implementar `server` (código atual encapsulado) e `p2p` lado a lado prova a abstração antes de qualquer feature nova.
- **DTOs públicos preservados** (`publicUser`, `communityDto`, `channelDto`, `messageDto`): a UI continua consumindo os mesmos shapes; campos sem análogo P2P recebem `null` documentado.
- **Log de eventos assinados** é deliberadamente o mesmo formato que um futuro servidor híbrido replicaria: um peer "sempre ligado" (ou o servidor atual convertido em peer) pode servir como relay/store sem mudar protocolo nem UI.
- **Provider selection** em boot (`PROSA_MODE` + UI) permite convivência: instalação A no modo `server` falando com o backend atual, instalação B em `p2p` falando com amigos — os dois modos são isolados entre si por enquanto (sem ponte), e a especificação do híbrido fica para spec futura.
- **Migração de dados:** o SQLite local P2P reusa o schema de domínio do `db.js`; um export/import `prosa:` de espaços permite mover histórico entre modos (ferramenta futura, formato já previsto).
- **Sem lock-in de transporte:** o envelope assinado é transporte-agnóstico — pode ir por DataChannel, WebSocket entre peers, ou relay híbrido sem alterar a camada de aplicação.

---

## 11. Impactos nos componentes existentes (mapeamento)

| Arquivo atual | Impacto no modo P2P |
|---|---|
| `web/src/api.js` | Encapsulado como provider `server`; deixa de ser usado diretamente pela UI |
| `web/src/stores.js` | `connectWs`/`wsSend`/`dispatch` migram para `services.transport`/eventos do provider; o `store` reativo mantém shape |
| `web/src/rtc.js` | Reaproveitado; `SIGNAL` passa a ir pelo canal de controle P2P |
| `web/src/views/*`, `components/*` | Mudança mínima: trocam `api()`/`wsSend` por chamadas ao service layer; `AuthView` ganha fluxo de identidade/convite |
| `web/desktop/main.cjs` | Ganha o "nó" P2P (identidade, storage, rede auxiliar) + novos handlers IPC |
| `web/desktop/preload.cjs` | Expõe bridge tipada `prosaDesktop.p2p` |
| `server/*` | Intocado nesta fase; vira o provider `server` (e candidato a peer super no híbrido) |
| `server/src/db.js` | Schema de domínio copiado/adaptado para o SQLite local do nó |
| `server/src/permissions.js` | Regras de cargo convertidas em validação de eventos admin |
| `server/test/api.test.js` | Preservado testando o provider `server`; novos testes P2P usam provider em memória |

---

## 12. Testabilidade

- `server/test/api.test.js` continua passando intacto — o provider `server` garante regressão.
- Novos testes `server/test/p2p.test.js` (ou `web/test/`):
  - Envelope/assinatura: assinar, verificar, rejeitar adulterado.
  - LWW/convergência: aplicar o mesmo conjunto de eventos em ordens diferentes → estado idêntico.
  - Permissões: `role_grant` forjada por não-owner é descartada; ban de owner é rejeitado; `canActOn` portado.
  - Protocolo: `sync_req`/`sync_res` produz delta correto; dedupe por `event_id`; seq por autor.
  - Provider em memória: dois nós "pareados" via `MockTransport` trocam mensagens sem rede; desconexão/reconexão reproduzida injetando falha.
- Sem dependência de internet: testes não usam STUN real nem playground; WebRTC de verdade fica para teste manual/integração opcional com Chromium headless (fora do `npm test` padrão).

---

## 13. Riscos, dependências e decisões pendentes

### Riscos

- **SQLite no Electron:** `node:sqlite` exige o Node do sistema; dentro do Electron (Chromium + Node embutido) pode não estar disponível no runtime do main. Alternativas: `better-sqlite3` com `electron-rebuild`, `sql.js` (WASM), ou um processo filho Node separado. **Decisão pendente** — spike necessário antes da implementação.
- **NAT simétrico/corporativo:** parte dos usuários não conseguirá conexão direta sem TURN; a promessa "sem intermediário" degrada para relay nesses casos.
- **Confiança por canal fora de banda:** o link de convite pode ser interceptado; verificação de fingerprint é recomendada e deve constar na UI.
- **Replicação maliciosa:** peer pode sonegar eventos (reter sync); assinaturas garantem integridade, não disponibilidade — aceito para a v1.
- **Fork de comunidade:** owner e delegados podem emitir eventos divergentes; resolução de partição (quando o espaço se divide e reconverge) precisa de regra — proposta: LWW por `(author_role_level, seq)` na estrutura administrativa; refinamento na implementação.
- **Tamanho do log:** espaços longos geram sync pesado; compactação/encerramento de histórico fica para versões futuras.

### Dependências novas (avaliação na implementação)

- Nenhuma obrigatória prevista para o núcleo (WebRTC nativo, `crypto.subtle`/`node:crypto`, `node:sqlite`/alternativa). `qrcode` opcional para UX de convite. Qualquer adição deve ser justificada.

### Decisões pendentes (requerem aprovação antes/durante implementação)

1. **Como persistir no Electron main** (`node:sqlite` vs `better-sqlite3` vs `sql.js`) — spike técnico.
2. **Formato do link de convite/pareamento** (payload completo vs handshake de 2 passos; QR sim/não).
3. **Rendezvous opcional:** implementar um "mailbox" mínimo no `server/` existente como serviço auxiliar, ou ficar 100% manual na v1?
4. **Identidade única por dispositivo vs exportável:** o mesmo usuário em dois dispositivos é o mesmo par de chaves (exportar) ou duas identidades? v1 sugere identidade por dispositivo com display name compartilhado — decisão pendente.
5. **Recuperação de identidade:** sem senha/e-mail, perder a chave = nova identidade; backup/export cifrado da chave é roadmap.
6. **Regra de fork de comunidade** (resolução de partição administrativa).
7. **Escopo da v1 na UI:** substituir `AuthView` por onboarding de identidade, ou manter login `server` e adicionar modo `p2p` paralelo por seleção? Recomendado: seleção de modo na entrada, preservando o login atual.

---

## 14. Critérios de aceite da solução

1. Dois processos (testes de integração locais, sem internet) estabelecem canal P2P, trocam envelopes assinados e convergem no mesmo estado.
2. Um espaço comum replica eventos entre ≥3 nós por epidemic sync; um nó que desconecta e reconecta recupera o delta integral.
3. Mensagens editadas/excluídas/reagidas convergem deterministicamente independente da ordem de chegada.
4. Permissões administrativas são rejeitadas quando emitidas por chave não autorizada, verificado por teste.
5. Um arquivo de ~25 MB transfere por chunks com verificação de hash ponta a ponta entre dois nós locais.
6. `rtc.js` (ou seu equivalente) estabelece mídia mesh usando o canal de controle como sinalização, sem WS.
7. Trocar `PROSA_MODE=server` restaura o comportamento atual integral — `api.test.js` permanece verde sem alteração de semântica.
8. Chaves privadas nunca aparecem no renderer, em `localStorage` ou em logs — verificado por inspeção de IPC e grep em teste.
9. Documentação de limitações (offline, NAT/TURN, sem busca global) aprovada junto com a implementação.

---

## 15. Resumo executivo

- **Arquitetura:** Service Layer estável + provider P2P (DataChannel + SQLite local + log de eventos assinados) + provider `server` atual preservado → caminho limpo para híbrido.
- **Identidade:** chave Ed25519 por instalação, confiança por troca de fingerprints; sem contas/senhas no modo P2P.
- **Dados:** log de eventos assinados por espaço, replicado por epidemic sync com dedupe e LWW — qualquer peer serve qualquer autor porque a prova é a assinatura, não o transporte.
- **Sem servidor:** funciona pareamento manual, mensagens online, comunidades pequenas, voz/vídeo, arquivos e sync pós-reconexão.
- **Auxiliar admitido:** STUN/TURN para NAT e, opcionalmente, mailbox de introdução — nunca transporte de dados.
- **Sem solução P2P:** diretório global, reset de senha, admin global, entrega garantida a offline, disponibilidade do espaço com todos offline — documentados, não simulados.
- **Compatibilidade:** mesmos DTOs e service layer; modo `server` intacto; o servidor atual pode ser reaproveitado como peer super em um futuro híbrido sem reescrever UI.

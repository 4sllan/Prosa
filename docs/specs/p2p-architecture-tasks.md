# Tasks: Arquitetura P2P experimental (p2p-architecture)

Spec aprovada: `docs/specs/p2p-architecture.md`
Status: aguardando aprovação para execução da task 1.

Cada task é independentemente implementável e verificável. Executar uma por vez, com validação antes de avançar.

---

## Fase A — Fundação (abstração e modelo de dados)

### Task 1 — Camada de serviços (Service Layer)
Extrair o contrato implícito de `web/src/api.js` + `web/src/stores.js` para `web/src/services/` com API nomeada agnóstica ao transporte: `identity`, `contacts`, `spaces`, `messaging`, `files`, `calls`, `events`. A UI passa a consumir apenas a service layer; `api()`/`wsSend`/`onWs` deixam de ser chamados diretamente pelos componentes.

**Validação:** app compila (`npm --prefix web run build`) e funciona idêntico ao atual em modo `server`; `server/test/api.test.js` permanece verde.

### Task 2 — Provider `server` (encapsulamento do backend atual)
Encapsular as chamadas REST (`api()`) e o cliente WS (`connectWs`/`wsSend`/`dispatch`) como implementação concreta do service layer — comportamento idêntico ao atual, sem mudança semântica.

**Validação:** bootstrap, login, comunidades, mensagens, DMs, voz funcionam sem regressão; `npm test` verde.

### Task 3 — Seleção de provider em boot
Config `PROSA_MODE` (env/localStorage/tela inicial) com fallback `server`. Tela de seleção de modo quando nenhum modo persistido — preserva `AuthView` para `server`, esqueleto de onboarding para `p2p`.

**Validação:** modo `server` idêntico; modo `p2p` abre shell sem crash e indica "experimental".

### Task 4 — SQLite local no Electron (spike + implementação)
Resolver a decisão pendente: avaliar `node:sqlite` no main do Electron 33, `better-sqlite3` com electron-rebuild, ou `sql.js` (WASM). Implementar a escolha como módulo `web/desktop/db.cjs` com schema de domínio adaptado do `server/src/db.js` + tabela `events` (log por espaço). Expor operações via IPC tipada no preload.

**Validação:** criar/consultar banco no Electron empacotado e em dev; schema aplicado; nenhuma API irrestrita exposta ao renderer; build `dist:*` intacto.

### Task 5 — Identidade Ed25519 no main
Gerar e persistir par de chaves no Electron main; IPC `identity.pubkey`, `identity.sign`, `identity.fingerprint`. Perfil assinado (displayName/avatar/bio) como evento. Onboarding de identidade na UI (criar perfil / colar convite).

**Validação:** fingerprint estável entre restarts; assinatura verificável; chave privada nunca no renderer (grep/teste IPC).

---

## Fase B — Transporte P2P

### Task 6 — Envelopes e criptografia de eventos
Formato `{v,type,id,from,to,ts,body,sig}`; funções `signEvent`/`verifyEvent`/`canonicalize`; dedupe por `event_id`; `seq` por `(space_id, author)`. Testes unitários de assinatura, adulteração e ordenação.

**Validação:** `node --test` cobrindo assinar/verificar/rejeitar e determinismo de seq.

### Task 7 — Pareamento manual (link de oferta/resposta)
Gerar/aceitar link `prosa://connect/<payload>` com pubkey + SDP + ICE hints; handshake `hello` autenticando posse da chave; `RTCPeerConnection` + DataChannel de controle confiável/ordenado por par de peers. UI de "colar convite / colar resposta".

**Validação:** dois processos locais pareiam e trocam `hello` sem rede pública; falha reportada claramente.

### Task 8 — Transporte e fan-out
`P2PTransport`: gerencia `peers` (canal por peer), envio direto, broadcast por espaço com dedupe, ACKs, backoff/backpressure (`bufferedAmountLowThreshold`), reconexão com candidatos conhecidos. `MockTransport` em memória para testes.

**Validação:** mensagens fluem entre 3 nós; desconexão marca peer offline; reconexão reestabelece canal.

### Task 9 — Sync por espaço (`sync_req`/`sync_res`)
Ao conectar, peers trocam mapa `(author→max_seq)` por espaço; enviam delta; aplicam projeções na ordem. Retomada pós-restart.

**Validação:** nó que desconecta e reconecta recebe todos os eventos ausentes; nenhum duplicado; teste com MockTransport.

---

## Fase C — Domínio replicado

### Task 10 — Persistência e projeções locais
Aplicar eventos ao SQLite local: `messages`, `channels`, `members`, `communities`, `contacts`, `attachments`, `reactions`, `read_states`; projeções materializadas + `last_seen_seq` por espaço.

**Validação:** estado restaurado após restart; projeções consistentes com o log.

### Task 11 — Convergência (LWW determinístico)
Regras: autor é dono dos próprios `msg_edit`/`msg_delete`; LWW por `(autor, alvo)` com tiebreak `seq`→`pubkey`; estrutura admin por `(author_role_level, seq)`.

**Validação:** teste aplica os mesmos eventos em ordens distintas → estado idêntico.

### Task 12 — Contatos e amizade por chave
Solicitar/aceitar/remover/bloquear contatos por pubkey; perfil assinado propagado; bloqueio descarta eventos do par. `FriendsPanel` adaptado.

**Validação:** bloqueado não entrega eventos; perfil do par verificado por assinatura.

### Task 13 — Mensagens diretas e grupos (P2P)
DM 1:1 e `group_dm` como espaços com conjunto de membros definido; envio/edição/exclusão/reação/pins/read/typing funcionais online; ACKs visíveis ao remetente.

**Validação:** `ChatView` funciona via service layer P2P; histórico paginado local; offline fica pendente (sem fake).

### Task 14 — Comunidades, canais e permissões por eventos assinados
`community_create` (owner = fundador), `channel_create/delete`, `role_grant`, `ban`, `invite_grant` validados localmente contra o log; regras `canActOn`/`ROLE_PERMS` portadas. Convite = token assinado aceito quando um membro autorizado está online.

**Validação:** testes rejeitam `role_grant`/`ban` forjados; `requirePerm` local respeita hierarquia; convite funciona com anfitrião online.

### Task 15 — Presença e typing efêmeros
Presença por conectividade real + estados manuais publicados (`online`/`idle`/`dnd`/`invisible`); typing retransmitido 1 salto no espaço.

**Validação:** UI reflete online/offline real; invisível aparece offline como hoje.

### Task 16 — Transferência de arquivos
`file_offer` + chunks por DataChannel dedicado; `sha256` por chunk e global; whitelist MIME e limite do remetente preservados; cache local; entrega a renderer via IPC por hash.

**Validação:** arquivo ~25 MB transfere e verifica; MIME proibido rejeitado.

### Task 17 — Voz/vídeo/tela via canal de controle
`rtc.js` aponta a sinalização para o transporte P2P (`send(peer,'signal')`); `voice_state` efêmero no espaço; mesh reaproveitada; DM_CALL cai de graça.

**Validação:** mídia funciona entre 2–3 nós sem WS; mute/deafen/screen propagam estado.

---

## Fase D — Acabamento e migração

### Task 18 — UI/UX do modo P2P
Onboarding de identidade, convite/pareamento, status de peers, pendência de entrega, seção experimental no `UserSettings`/`AuthView`. Sem dados fictícios.

**Validação:** fluxo completo amigo→DM→comunidade→voz navegável; nada "simula".

### Task 19 — Busca local
`searchLocal` sobre mensagens replicadas (LIKE local); UI documenta escopo "só o que este dispositivo possui".

**Validação:** busca retorna só dados locais; sem chamada a `/api/search` em modo P2P.

### Task 20 — Documentação e hardening
Atualizar `README.md`/`docs/docs.md`: arquitetura P2P, limitações (offline, NAT/TURN, sem busca global/admin), formato de links, backup de identidade. Checklist de segurança (chaves, IPC, envelopes).

**Validação:** docs refletem o implementado; nenhuma limitação omitida.

### Task 21 — Empacotamento e distribuição
Garantir `desktop/**` no builder cobre os novos módulos; `.dmg`/`.exe` com modo seletor; testar app empacotado (dev + dist) abrindo em modo P2P.

**Validação:** artefato instala, abre, pareia e troca mensagens em modo P2P sem dependência de servidor.

---

## Notas de execução

- **Ordem:** sequencial; tasks 4–5 destravam 6–9; 10–17 destravam 18–21.
- **Sem rede pública nos testes:** `MockTransport` + loopback; STUN/TURN só em teste manual.
- **Sem remoção prematura:** `server/*` só deixa de ser o default quando o modo P2P estiver estável; nada é deletado antes do provider `server` estar encapsulado.
- **Cada task termina com validação explícita** e autorização do usuário para a próxima.

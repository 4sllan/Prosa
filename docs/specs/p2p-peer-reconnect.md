# Spec: Ciclo de vida da conexão P2P por peer (desconectar/reconectar)

- Status: aprovada
- Data: 2026-10-21
- Aprovacao: "continuar" em 2026-10-21, apos apresentacao da spec com as
  decisoes D1-D3 registradas; autoriza a criacao das tasks, nao a execucao.
- Origem: pedido do usuário — "Quando eu desconecto de um amigo, ele continua
  aparecendo nas configurações de rede P2P, mas não consigo estabelecer a
  conexão novamente", com fluxo SDD conforme `.devin/sdd.md`.
- Base: análise Fase 1 em 2026-10-21 (causas raiz listadas em "Contexto").

## 1. Objetivo e contexto

Dar à conexão P2P por peer um ciclo de vida explícito e consistente:

1. **Desconectar** um peer encerra de fato os recursos (`DataChannel` +
   `RTCPeerConnection`), sem remover o amigo da lista de contatos.
2. **Reconectar** (re-pareamento manual, única sinalização existente) funciona a
   qualquer momento: substitui conexões mortas/zumbis e reutiliza as vivas.
3. Conexões antigas não interferem na nova: callbacks assíncronos de recursos
   substituídos não derrubam o registro atual.
4. A UI reflete o estado real do transporte em tempo real.

### Causas raiz identificadas na análise (fatos no código)

- `removeContact` (`contacts.js`) grava tombstone e envia `contact_remove`, mas
  **não fecha o transporte** — o peer continua `open`, com keepalive e presença
  online. Não existe ação/API para desconectar preservando o contato.
- `peers` guarda apenas `{channel, state}` (`transport.js`): o `pc` nunca é
  fechado nem rastreado; `dropPeer` vaza o `RTCPeerConnection`.
- `isOnline` confia só em `state==='open'`: entrada zumbi (canal morto sem
  `onclose`, ex.: peer legado v1 sem keepalive) faz todo re-pareamento cair no
  branch `alreadyOnline` de `wirePairingPeer`, que **fecha o canal novo
  saudável** — a conexão nunca se restabelece sem reiniciar o app.
- Falha de `channel.send` retorna `false` sem marcar o peer como fechado.
- Callbacks registrados por `peerId` não verificam qual recurso disparou:
  `channel.onclose` atrasado do canal antigo e o timer de `ice.restart.fail`
  (15 s) do `pc` antigo podem chamar `dropPeer(peerId)` e matar a conexão nova.
- `dropPeer` emite `peer.closed` mesmo para peer inexistente ou já fechado
  (eventos duplicados).
- `continueWithLink`/`createInvite` retornam silenciosamente quando o fluxo já
  está `connected`/ocupado (feedback nulo).

## 2. Escopo

Inclui:

- `web/src/services/p2p/transport.js`: registro de peer passa a rastrear
  `{channel, pc, state}`; `dropPeer` idempotente fecha ambos os recursos;
  callbacks de encerramento validam a identidade do recurso; `send` com falha
  derruba o peer; `isOnline` considera `channel.readyState`.
- `web/src/services/p2p/node.js`: `attachPeer` repassa o `pc` ao transporte;
  o listener de ICE-restart só age sobre o `pc` registrado atualmente.
- `web/src/services/p2p/pairing-peer.js`: re-pareamento com peer já registrado
  distingue conexão viva (reutiliza, fecha o novo canal — comportamento atual)
  de zumbi/fechada (descarta a antiga e atacha a nova).
- `web/src/components/PairingPanel.vue`: ação "Desconectar" por peer online em
  "Peers conhecidos"; status em tempo real via `peer.open`/`peer.closed`
  (assinaturas já existentes); feedback visível quando o usuário tenta colar
  link com o fluxo `connected`.
- `web/src/services/p2p/pairing-flow.js`: feedback em vez de retorno silencioso
  nos gates de `connected`/ocupado (somente mensagem na UI, sem mudar máquina
  de estados).
- Testes de regressão em `web/test/` cobrindo cada mudança de comportamento.

Fora de escopo:

- Reconexão automática sem troca de link (exigiria mailbox/rendezvous —
  fora da arquitetura atual e das specs aprovadas).
- TURN próprio, UPnP, discovery automático (mesmo fora de escopo de
  `p2p-connectivity-fixes`).
- Provider `server`, `realtime.js`, `api.js`, backend.
- `rtc.js` (voz) — mantém mapa próprio de peers por canal; o canal de controle
  P2P continua o mesmo transporte corrigido aqui.
- Mudança de protocolo/envelope/`hello` — compatibilidade de fio preservada.
- Renomear/reorganizar a semântica de "Desfazer conexão" (remover amigo):
  mantém o tombstone + `contact_remove` atuais.

## 3. Modos, plataformas e semântica

| Comportamento | Server | P2P |
| --- | --- | --- |
| Desconectar peer (transporte) | Não se aplica | Sim |
| Reconectar via re-pareamento | Não se aplica | Sim |
| Status online/offline em tempo real | WS existente | `peer.open`/`peer.closed` |
| Remover amigo ("Desfazer conexão") | Inalterado | Inalterado (não derruba o transporte — ver D1) |

- Plataformas: Electron (alvo principal) e navegador de desenvolvimento.
- Nenhum IPC novo: o painel já importa `p2pTransport`/`getP2PNode` diretamente;
  a desconexão não precisa atravessar a fronteira main/renderer.

## 4. Requisitos

### Funcionais

- **RF-01:** O registro de peer no transporte deve rastrear
  `{ channel, pc, state }`; `addPeer` aceita o `pc` associado (opcional, para
  mocks/testes) e o armazena na entrada.
- **RF-02:** `dropPeer(peerId, reason)` deve ser idempotente: encerra o
  `DataChannel` e o `RTCPeerConnection` registrados, para o keepalive, marca
  presença `offline` e emite `peer.closed` **exatamente uma vez** por
  transição de `open` para fechado; chamadas repetidas ou sobre peer
  inexistente não emitem evento nem lançam erro.
- **RF-03:** Callbacks de encerramento só derrubam o peer quando o recurso que
  disparou é o atualmente registrado: o `channel.onclose` instalado por
  `addPeer` verifica identidade do canal, e o timer de `ice.restart.fail` em
  `node.attachPeer` verifica que o `pc` ainda é o registrado antes de chamar
  `dropPeer`. Fechamentos tardios de recursos substituídos são ignorados.
- **RF-04 (R1):** Falha de envio deve derrubar o peer via `dropPeer`
  (reason `send-failure`) quando o `readyState` evidencia canal morto
  (`readyState` diferente de `open`, ou ausente num canal que falhou);
  exceção de `channel.send` com `readyState` ainda `'open'` é tratada como
  transitória (ex.: mensagem grande demais) e apenas reenfileira o envelope.
  Elimina zumbis sem quebrar o contrato de falha transitória coberto pelos
  testes existentes (`p2p-pairing-peer.test.js`).
- **RF-05:** `isOnline(peerId)` retorna verdadeiro somente se `state==='open'`
  e, quando o canal expõe `readyState`, este for `'open'`. Canais de teste sem
  `readyState` continuam válidos.
- **RF-06:** Deve existir desconexão explícita por peer que encerre o
  transporte sem alterar o contato: exposta como método do transporte
  (ex.: `disconnectPeer`/`dropPeer` com reason `user-disconnect`) e acionável
  na UI. O contato/amigo permanece intacto.
- **RF-07:** No re-pareamento (`wirePairingPeer`), quando o hello verificado
  pertence a peer já registrado: se a conexão existente estiver viva
  (RF-05), mantém o comportamento atual — fecha o canal recém-negociado e
  reporta conectado; se estiver zumbi/fechada, encerra os recursos antigos
  (RF-02) e atacha a nova conexão normalmente.
- **RF-08:** "Desfazer conexão" (remover amigo) **não** derruba o transporte:
  a conexão por peer serve a todos os espaços compartilhados (comunidades,
  grupos, DM) e derrubá-la quebraria espaços que continuam válidos. A ação de
  desconectar é separada e explícita (RF-06).
- **RF-09:** Em "Peers conhecidos" (`PairingPanel`), cada peer exibe o status
  real (`online`/`offline`) e, quando online, a ação "Desconectar"; a lista e
  o contador de peers atualizam em tempo real via `peer.open`/`peer.closed`
  (assinaturas já existentes no painel).
- **RF-10:** Reconectar um peer usa o fluxo de pareamento existente (criar
  convite / colar link). Ao tentar colar link ou criar convite com o fluxo em
  `connected`/ocupado, a UI exibe orientação ("recomece o pareamento") em vez
  de silenciar — sem alterar a máquina de estados.
- **RF-11:** A `pendingQueue` por peer é preservada entre quedas (entrega
  offline de `contact_req`/`contact_remove`/eventos permanece o design
  vigente); controles efêmeros reenviados (`ping`) são inócuos no recebimento.
- **RF-12:** O re-attach executa a rotina de abertura existente
  (`sendSyncReq` dos espaços compartilhados, `broadcastProfile`, flush da
  fila) — sem alteração de conteúdo.

### Não funcionais

- **RNF-01:** Nenhuma dependência nova, nenhum IPC novo, nenhuma mudança de
  wire/envelope/`hello` — compatibilidade de protocolo preservada (v1 legado e
  v2 assinado continuam aceitos).
- **RNF-02:** Cobertura `node --test` em `web/test/` para: drop fecha `pc` e
  canal; drop idempotente (um `peer.closed`); close tardio de recurso
  substituído não derruba a conexão nova; falha de `send` marca offline;
  `isOnline` respeita `readyState`; re-pareamento de peer zumbi atacha a nova
  conexão; re-pareamento de peer vivo preserva a antiga (regressão).
- **RNF-03:** Diagnóstico `logDiag` mantido sem dados sensíveis; novos
  `reason` de drop (`user-disconnect`, `send-failure`) seguem o padrão.
- **RNF-04:** Provider `server`, `rtc.js` e IPC Electron inalterados.
- **RNF-05:** Preservar identidade visual e padrão de código existente
  (comentários curtos em pt-BR para decisões não óbvias).

## 5. Contratos afetados

- `p2pTransport.addPeer(peerId, channel, { keepalive, pc }?)` — novo campo
  opcional `pc` nas opções (retrocompatível).
- `p2pTransport.dropPeer(peerId, reason)` — sem mudança de assinatura; passa a
  fechar também o `pc` registrado e a ser idempotente.
- `node.attachPeer(peerId, pc, dc, opts)` — assinatura já existe; passa a
  registrar o `pc` no transporte.
- Novo uso na UI: ação de desconectar chama o transporte diretamente (o painel
  já importa `p2pTransport`); nenhum método novo de provider é necessário.
- Eventos `peer.open`/`peer.closed` — payload inalterado `{ peerId }`; apenas a
  garantia de emissão única por transição.

Nenhum contrato de wire, envelope, `hello`, IPC ou API do servidor muda.

## 6. Estado, persistência e integridade

- Sem migração e sem novos dados persistidos: o registro `{channel, pc}` é
  volátil (memória); o kv `peers` (peers conhecidos) permanece como está —
  `rememberPeer` já registra `lastState` via `peer.open`/`peer.closed`.
- `pendingQueue`, `seen`, `spacePeers` e `presences` seguem a política atual;
  `presences` marca `offline` no drop (já existente).
- Contatos e tombstones: inalterados — desconectar não toca `contacts`.

## 7. Segurança, privacidade e limites

- Handshake `hello` continua exigindo verificação Ed25519 antes de qualquer
  attach/re-attach (teste "online peer does not bypass signature verification"
  permanece válido).
- Desconexão é ação local: não há mensagem de controle nova para o peer
  remoto; o outro lado detecta pela queda do canal/`onclose`/keepalive.
- Logs de diagnóstico: somente `reason` e fingerprint curto — sem SDP, IPs ou
  chaves (RNF-03).
- Nenhuma operação atinge dados de usuário (`data/`, store Electron).

## 8. Falhas e recuperação

- **Peer zumbi** (canal morto sem `onclose`): eliminado por RF-04/RF-05; o
  re-pareamento (RF-07) ainda cobre o caso remanescente.
- **Stale-close** (`onclose`/`ice.restart.fail` de recurso substituído):
  ignorado por RF-03 — a conexão nova não é derrubada por recursos antigos.
- **Drop duplicado** (keepalive + onclose + ação do usuário): idempotente
  (RF-02), um único `peer.closed`.
- **Re-pareamento de peer saudável**: o canal novo é fechado como redundante e
  a UI reporta conectado — comportamento atual preservado (RF-07).
- **Falha durante o handshake do re-pareamento**: fluxo `error` existente;
  "Recomeçar pareamento" sempre disponível, sem reiniciar o app.
- **Peer remoto desconecta primeiro**: `onclose`/keepalive derrubam
  localmente; o peer some de online e o re-pareamento pode ocorrer a qualquer
  momento.
- **Fila offline**: preservada (RF-11); não há promessa de entrega de controle
  após reinício — limitação já documentada no README.

## 9. Critérios de aceite

| ID | Verificação | Requisitos |
| --- | --- | --- |
| CA-01 | "Desconectar" um peer online em "Peers conhecidos" marca-o offline na hora, fecha canal+pc e **mantém** o amigo na lista de amigos/contatos | RF-02, RF-06, RF-08, RF-09 |
| CA-02 | Re-pareamento com peer desconectado ou zumbi estabelece nova conexão: `attachPeer` executa, `peer.open` emite e a UI mostra online | RF-04, RF-05, RF-07 |
| CA-03 | Re-pareamento com peer saudável não substitui nem derruba a conexão viva (regressão de `p2p-pairing-peer.test.js`) | RF-07 |
| CA-04 | `onclose` atrasado do canal antigo e timer `ice.restart.fail` do `pc` antigo não derrubam a conexão recém-registrada | RF-03 |
| CA-05 | `dropPeer` repetido (keepalive+onclose+ação) emite um único `peer.closed`; peer inexistente não emite | RF-02 |
| CA-06 | `channel.send` lançando exceção com `readyState` morto marca o peer offline e permite nova tentativa; exceção com canal `'open'` não derruba | RF-04, RF-05 |
| CA-07 | "Desfazer conexão" remove o vínculo sem derrubar o transporte (peer segue online enquanto o canal viver) | RF-08 |
| CA-08 | Tentar colar link/criar convite com fluxo `connected` exibe orientação visível, sem efeito colateral | RF-10 |
| CA-09 | `npm --prefix web test` passa com os novos testes; `npm run build` e `git diff --check` limpos | RNF-02 |
| CA-10 | Roteiro manual Electron: desconectar amigo → offline em tempo real → re-parear → online; amigo permanece na lista | RF-06–RF-09 |

## 10. Estratégia de validação, riscos e decisões

- **Testes automatizados** (`node --test`, padrão `web/test/`): MockChannel
  com `readyState` mutável + `pc` stub `{ close() {} }` — cobre RF-01..RF-05,
  RF-07 e idempotência. Novos testes junto de cada mudança, sem dados reais
  (store `memory` já usado pelas suites).
- **Manual (Electron + browser dev)**: roteiro CA-10; conferir `peer.closed`
  único no log `[p2p:diag]` (`localStorage.prosa_debug='1'`); re-pareamento
  entre duas instâncias; amigo permanece na lista após desconectar.
- **Riscos**: MockChannels dos testes existentes podem não expor `readyState` —
  RF-05 deve tratá-los como vivos (compat); ordem `attachPeer`→`removeEventListener`
  em `wirePairingPeer` deve ser preservada; timer de ICE-restart precisa ser
  também cancelável/verificado para não vazar entre attaches.
- **Decisões assumidas (confirmar na aprovação):**
  - **D1:** Remover amigo ("Desfazer conexão") não derruba o transporte —
    conexão é por peer e serve a todos os espaços compartilhados (RF-08). A
    desconexão explícita é ação separada na UI.
  - **D2:** Reconectar continua sendo re-pareamento manual por link; nenhuma
    sinalização automática nova é criada.
  - **D3:** `pendingQueue` é preservada entre quedas (RF-11) — convites e
    controles de domínio pendentes continuam com entrega best-effort.
- **Perguntas bloqueantes:** nenhuma — as decisões acima têm proposta
  registrada e podem ser ajustadas na revisão da spec.

## 11. Arquivos prováveis de alteração

- `web/src/services/p2p/transport.js` — registro `{channel, pc, state}`, drop
  idempotente, validação de callbacks, `isOnline`/`send` (RF-01–RF-05).
- `web/src/services/p2p/node.js` — `attachPeer` passa `pc`; ICE-restart
  verifica o `pc` registrado (RF-01, RF-03).
- `web/src/services/p2p/pairing-peer.js` — re-pareamento: vivo vs zumbi (RF-07).
- `web/src/components/PairingPanel.vue` — ação "Desconectar" e status real por
  peer (RF-06, RF-09).
- `web/src/services/p2p/pairing-flow.js` — feedback nos gates silenciosos (RF-10).
- `web/test/p2p-pairing-peer.test.js`, `web/test/p2p-pairing-resources.test.js`
  e/ou novo `web/test/p2p-transport.test.js` — cobertura RNF-02.

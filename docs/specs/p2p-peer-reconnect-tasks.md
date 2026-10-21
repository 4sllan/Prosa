# Tasks: Ciclo de vida da conexão P2P por peer

- Spec de referência: `docs/specs/p2p-peer-reconnect.md` (aprovada em 2026-10-21)
- Status geral: concluído (T1–T5); validação manual em rede real pendente
- Data: 2026-10-21
- Ordem de execução: T1 → T2 → T3 → T4 → T5 (cada task só inicia após a
  anterior estar `concluida` e com autorização explícita).

## T1 - Transporte rastreia `{channel, pc}` e drop idempotente fecha ambos

- Status: concluida
- Requisitos/aceite: RF-01, RF-02, RF-03 (parte do canal), RF-04 (R1), RF-05, RNF-02, RNF-03; CA-04 (parte), CA-05, CA-06
- Dependencias: nenhuma
- Escopo e arquivos provaveis:
  - `web/src/services/p2p/transport.js`
  - novo `web/test/p2p-transport.test.js` (ou amplia `p2p-pairing-resources.test.js`)
- Implementacao:
  - `peers` passa a guardar `{ channel, pc, state }`; `addPeer(peerId, channel, { keepalive, pc })` aceita `pc` opcional e o registra.
  - `dropPeer` fecha `channel` e `pc` registrados, para keepalive, marca presença offline e emite `peer.closed` apenas na transição `open`→fechado; peer inexistente ou já fechado não emite nem lança.
  - `channel.onclose` instalado por `addPeer` só chama `dropPeer` se `peers.get(peerId)?.channel === channel` (ignora close tardio de canal substituído).
  - `send`/`sendNow`: exceção de `channel.send` ou `readyState !== 'open'` derruba o peer via `dropPeer(peerId, 'send-failure')` e retorna `false`.
  - `isOnline` exige `state==='open'` e, quando `channel.readyState` existe, `'open'`; canais sem `readyState` seguem válidos (mocks).
  - Novo `reason` de diag (`send-failure`) sem dados sensíveis.
- Testes e comandos de validacao:
  - Testes `node --test`: drop fecha pc+canal; segundo drop não reemite; close de canal substituído não derruba o novo; `send` com exceção marca offline; `isOnline` respeita `readyState`; MockChannel sem `readyState` continua online.
  - `npm --prefix web test`
- Criterio de conclusao: comportamento implementado, testes novos e suite web verdes.
- Evidencias:
  - Arquivos alterados: `web/src/services/p2p/transport.js`; novo `web/test/p2p-transport.test.js` (7 testes).
  - Divergência relatada e spec ajustada (RF-04 → RF-04 R1, CA-06): derrubar em
    qualquer exceção de `send` quebrava o contrato de falha transitória já
    testado (`p2p-pairing-peer.test.js:155`); o drop passa a exigir evidência
    de morte via `readyState` — mesmo efeito sobre zumbis, sem falso positivo.
  - `peerIds` passou a filtrar por `isOnline` (canal real morto não conta mais
    como online no painel/broadcast).
  - `npm --prefix web test`: 233 pass, 0 fail (inclui os 7 novos).
  - `git diff --check`: limpo.

## T2 - `attachPeer` registra o `pc` e o ICE-restart só age sobre o pc atual

- Status: concluida
- Requisitos/aceite: RF-01, RF-03; CA-04
- Dependencias: T1 (registro de `pc` no transporte)
- Escopo e arquivos provaveis:
  - `web/src/services/p2p/node.js`
  - `web/src/services/p2p/transport.js` (acessor do recurso registrado, ex.: `peerEntry`/`hasPc`)
  - `web/test/` (teste do cenario de stale ICE)
- Implementacao:
  - `attachPeer` repassa `pc` ao `addPeer` do transporte.
  - O listener `iceconnectionstatechange`/timer de `ice.restart.fail` só chama `dropPeer` se o `pc` ainda for o registrado para o peer (consulta ao transporte); caso contrário, é ignorado.
  - Manter a tentativa única de `restartIce` e o timeout de 15 s existentes.
- Testes e comandos de validacao:
  - Teste com `pc` stub: após re-attach com `pc2`, evento `failed` + timer do `pc1` não derruba a entrada nova; `pc` atual falhando derruba.
  - `npm --prefix web test`
- Criterio de conclusao: stale-close por ICE impossível; suite web verde.
- Evidencias:
  - Arquivos alterados: `web/src/services/p2p/node.js`, `web/src/services/p2p/transport.js`
    (novo acessor `peerEntry`); testes em `web/test/p2p-pairing-peer.test.js` (3 novos).
  - `attachPeer` passa `pc` ao `addPeer`; `onClose` do attachChannel e o listener/timer
    de ICE-restart só agem se o recurso ainda for o registrado (`peerEntry`).
  - `npm --prefix web test`: 236 pass, 0 fail.
  - `git diff --check`: limpo.

## T3 - Re-pareamento substitui conexão zumbi e preserva a viva

- Status: concluida
- Requisitos/aceite: RF-07, RF-05; CA-02, CA-03
- Dependencias: T1, T2
- Escopo e arquivos provaveis:
  - `web/src/services/p2p/pairing-peer.js`
  - `web/test/p2p-pairing-peer.test.js`
- Implementacao:
  - Após hello verificado: se `isOnline(m.from)` (já ciente de `readyState`) → fecha o canal novo como redundante (comportamento atual);
    senão, se houver entrada residual → `dropPeer(m.from, 'replaced')` para limpar recursos antigos e `node.attachPeer` normalmente.
  - Preservar ordem `attachPeer` → `removeEventListener` e o flush de `pending`.
  - Nenhuma mudança no protocolo/`hello`.
- Testes e comandos de validacao:
  - Novo teste: peer registrado com canal `readyState==='closed'` (zumbi) → re-pareamento atacha a nova conexão, `peer.open` emite, recursos antigos fechados.
  - Regressão: teste existente de peer online preserva o canal vivo.
  - `npm --prefix web test`
- Criterio de conclusao: re-pareamento de zumbi reconecta; de vivo reutiliza; suite verde.
- Evidencias:
  - Arquivo alterado: `web/src/services/p2p/pairing-peer.js` — antes de
    `attachPeer`, `dropPeer(m.from, 'replaced')` limpa registro residual
    (fechado/zumbi); peer vivo mantém o atalho `alreadyOnline` que fecha o
    canal novo. `isOnline` (RF-05) já distingue os dois casos.
  - Testes novos em `web/test/p2p-pairing-peer.test.js`: zumbi substituído
    (pc antigo fechado, canal novo preservado, `contact_req` pelo canal novo)
    e registro já fechado atachando normalmente.
  - `npm --prefix web test`: 238 pass, 0 fail.
  - `git diff --check`: limpo.

## T4 - UI: ação "Desconectar" por peer e feedback nos gates do pareamento

- Status: concluida
- Requisitos/aceite: RF-06, RF-08, RF-09, RF-10; CA-01, CA-07, CA-08
- Dependencias: T1 (drop idempotente/`user-disconnect`)
- Escopo e arquivos provaveis:
  - `web/src/components/PairingPanel.vue`
  - `web/src/services/p2p/pairing-flow.js`
  - `web/test/p2p-pairing-flow.test.js`
- Implementacao:
  - Em "Peers conhecidos", peer online exibe botão "Desconectar" que chama `p2pTransport.dropPeer(peerId, 'user-disconnect')`; status `online`/`offline` já reage via `peer.open`/`peer.closed` (assinaturas existentes).
  - `continueWithLink` com fluxo `connected` e `createInvite` com tentativa em andamento exibem orientação ("recomece o pareamento") em vez de retorno silencioso — apenas mensagem, sem mudar a máquina de estados.
  - Identidade visual e acessibilidade do painel preservadas (botão `ghost`, `aria` coerente com o existente).
- Testes e comandos de validacao:
  - Teste do fluxo: `continueWithLink` em `connected` produz mensagem e não toca `pc`/estado; `createInvite` ocupado idem.
  - `npm --prefix web test`
- Criterio de conclusao: ação visível e funcional, feedback nos gates, suite verde.
- Evidencias:
  - Arquivos alterados: `web/src/components/PairingPanel.vue` (botão
    "Desconectar" por peer online em "Peers conhecidos" +
    `disconnectPeer` → `dropPeer(peerId, 'user-disconnect')`, sem tocar no
    contato; estilo `.krow .btn`); `web/src/services/p2p/pairing-flow.js`
    (notice "Recomece o pareamento…" em `createInvite` com sessão existente e
    em `continueWithLink` com `connected`; gates busy seguem silenciosos pois
    a UI já exibe o progresso).
  - Testes novos em `web/test/p2p-pairing-flow.test.js` (2): link colado em
    `connected` preserva sessão e recursos; convite sobre sessão existente
    orienta restart sem duplicar offer.
  - `npm --prefix web test`: 240 pass, 0 fail.
  - `npm run build`: ok (Vite, 1.46 s).
  - `git diff --check`: limpo.

## T5 - Validação integrada e roteiro manual

- Status: concluida
- Requisitos/aceite: CA-09, CA-10; RNF-01, RNF-04
- Dependencias: T1–T4
- Escopo e arquivos provaveis:
  - Revisão do diff acumulado (somente arquivos das tasks)
  - Nenhum código novo previsto
- Implementacao:
  - Rodar `npm --prefix web test`, `npm run build`, `git diff --check`.
  - Revisar diff: sem segredos, sem alterações fora de escopo, provider `server`/`rtc.js`/IPC intactos.
  - Roteiro manual documentado (Electron ou browser dev): desconectar amigo → offline em tempo real → amigo permanece na lista → re-parear → online; drop único no `[p2p:diag]`; falha simulada permite nova tentativa sem reiniciar.
- Testes e comandos de validacao: os comandos acima + registro do que foi observado no manual (separando pendências de verificação manual).
- Criterio de conclusao: suítes verdes, build ok, diff limpo, roteiro executado ou pendências explicitadas.
- Evidencias:
  - `npm --prefix web test`: 240 pass, 0 fail (12 testes novos no plano).
  - `npm test` (suite do servidor): 14 pass, 0 fail — backend intacto.
  - `npm run build`: ok (Vite).
  - `git diff --check`: limpo.
  - Diff revisado: apenas `transport.js`, `node.js`, `pairing-peer.js`,
    `pairing-flow.js`, `PairingPanel.vue`, testes e specs — sem segredos,
    sem mudança fora de escopo; `providers/server.js`, `rtc.js` e IPC
    (`main.cjs`/`preload.cjs`) intactos; nenhuma dependência nova.
  - Roteiro manual (pendente de execução pelo usuário em duas instâncias):
    1. Amigos → Rede P2P → Detalhes da conexão: peer online exibe
       "Desconectar".
    2. Desconectar → status vira "offline" na hora; o amigo permanece na
       lista de Amigos; `[p2p:diag]` (com `localStorage.prosa_debug='1'`)
       mostra um único `peer.closed ...:user-disconnect`.
    3. Re-parear com o mesmo amigo (Criar convite / colar link) →
       "Peer conectado"; peer volta a "online"; DM/comunidades sincronizam.
    4. Queda real (o amigo fecha o app) → keepalive derruba em ~75 s →
       re-parear funciona sem reiniciar o app.
    5. Colar link com o fluxo em "Conexão estabelecida" → aviso
       "Recomece o pareamento…" em vez de silêncio.
  - Verificação manual em rede real não executada por mim (exigiria abrir o
    app e duas instâncias); fica registrada como pendência de validação do
    usuário — cobertura automatizada já exercita todos os cenários acima em
    nível de transporte/nó.

# Tasks: Correções de conectividade P2P remota

**Spec:** `docs/specs/p2p-connectivity-fixes.md`
**Base:** `docs/specs/investigate-pure-p2p-connectivity-report.md`
**Regra:** cada task é executada somente após autorização explícita. Após cada task: `npm --prefix web test` (e teste manual quando aplicável) e parada para validação.

---

## T1 — Telemetria de diagnóstico (`[p2p:diag]`)

Criar utilitário de diagnóstico opt-in e instrumentar a cadeia de pareamento.

- **`web/src/services/p2p/diag.js`** (novo): `logDiag(tag, data)` — emite `console.debug('[p2p:diag]', tag, data)` apenas quando `localStorage.prosa_debug === '1'` **ou** `import.meta.env.DEV`; `diagCounters()` para agregação de candidatos por tipo. Sem IPs literais, chaves, payloads ou SDP.
- **`pairing.js`**: instrumentar `createPairingOffer`/`acceptPairingOffer`/`completePairing` — `onicecandidate` (contagem por tipo `host`/`srflx`/`relay`, flag `.local`), `onicecandidateerror` (código + url do server), `onicegatheringstatechange`, `oniceconnectionstatechange`, `onconnectionstatechange` (ambos com timestamp relativo), resultado do `waitIce` (`complete` vs `timeout`).
- **`PairingPanel.vue`/`wirePeer`: `dc.onopen`/`onclose`/`onerror`/`readyState` e envio/recebimento do `hello`.
- **`transport.js`**: ligar o `log()` existente a `logDiag` — quedas de `addPeer`/`dropPeer` com motivo.

**Verificação:** harness `/tmp/p2p-ice-test` adaptado (ou log manual no dev) mostra todas as linhas `DIAG` do relatório T4; sem flag, console permanece limpo.

## T2 — ICE completo antes do link (F1)

- **`pairing.js`**: `waitIce` deixa de ser caminho normal de 8 s — aguardar `complete` com `timeoutMs` default **20000** (configurável); retorno `{ timedOut }` propagado.
- **`PairingPanel.vue`**: mostrar spinner "coletando candidatos…" durante gathering; quando `timedOut`, exibir aviso "candidatos podem estar incompletos — a conexão pode falhar" **em vez de** falhar silenciosamente.
- Manter `prosa://pair/` e payload `{t, sdp, v:1}` inalterados (só SDP mais completo).

**Verificação:** com STUN normal, `gather=complete` antes do link; `A.waitIce` nunca mais expira em rede saudável. Com STUN inalcançável (ICE inválido em `prosa_ice`), o aviso aparece após o timeout em vez de link cego.

## T3 — `hello` autenticado + fingerprints (F4)

- **`PairingPanel.vue`/`node.js`**: `hello` passa a carregar `{v:2, type:'hello', from, ts, sig}` onde `sig = sign('hello|' + pubKeyHex + '|' + ts)`; receptor verifica `verify(from, payload, sig)` **antes de** `attachPeer`. Janela de tolerância de `ts`: ±5 min.
- Compatibilidade: `hello` sem `sig` (v1) é aceito com log `diag` de "peer legado sem assinatura" — não quebra pareamento com versão anterior; documentar o fallback.
- **UI**: `PairingPanel` exibe fingerprint local (`p2p:xxxx…`, de `identity.fingerprint`) e, por peer conectado, `fingerprintOf(from)` para conferência fora de banda.

**Verificação:** `hello` forjado sem assinatura válida **não** registra peer; hello legado (sem `sig`) conecta com aviso; fingerprints exibidos corretamente.

## T4 — Keepalive `ping`/`pong` (F5a)

- **`transport.js`/`node.js`**: `startKeepalive(peerId, channel)` — a cada 25 s (constante configurável `KEEPALIVE_MS`) envia `ping` no controle (`sendToPeer`); resposta `pong`. Se `ping` sem `pong` por `3` ciclos, `dropPeer(peerId, 'keepalive-timeout')` com log.
- Tipos `ping`/`pong` no dispatcher de controle de `node.js`; `handleControl` responde `pong` automaticamente.

**Verificação:** com dois lados conectados, `ping`/`pong` trafega em log; matando um lado, o outro detecta e marca offline em ~75 s.

## T5 — Peers conhecidos persistidos + reconexão (F5b)

- **`store.cjs`/`localstore.js`**: nova op `putPeer`/`getPeers`/`removePeer` — `{pubKeyHex, fingerprint, lastSeen, lastState}`.
- **`node.js`/`transport.js`**: em `addPeer`, persistir/atualizar; em `dropPeer`, atualizar `lastState='offline'` mantendo o registro.
- **`PairingPanel.vue`**: seção "peers conhecidos" listando fingerprint + estado; re-pareamento usa o mesmo fluxo existente (não reintroduzir identidade).
- **Reconexão**: ao detectar `iceConnectionState === 'disconnected'/'failed'`, tentar `pc.restartIce()` **uma vez**; se não voltar a `connected` em 15 s, marcar offline. Só aplicável se `restartIce` for viável no `pc` existente — validar no teste; senão, registrar como limitação e exigir re-pareamento.

**Verificação:** peers persistidos aparecem na lista; queda transitória (`disconnected`) tenta recuperação antes de marcar offline; re-pareamento com peer conhecido não duplica registro.

## T6 — Documentação da config ICE (F3)

- **`.env.example`**: seção P2P documentando `VITE_ICE_SERVERS_JSON` com exemplo incluindo entrada TURN comentada.
- **`README.md`** (seção P2P): documentar `localStorage.prosa_ice` (mesma estrutura `RTCIceServer[]`), precedência `prosa_ice` > `VITE_ICE_SERVERS_JSON` > default Google, e que TURN é opcional/condicional conforme o relatório.

**Verificação:** docs permitem que um usuário configure ICE/TURN próprios sem ler código.

## T7 — Testes (`web/test/p2p.test.js` e vizinhos)

Cobrir o que é testável em Node puro (mocks de `RTCPeerConnection`/`RTCDataChannel` já existentes no padrão do arquivo):

- Link só emitido após `gathering === 'complete'`; `timedOut` propagado.
- Assinatura/verificação do `hello` (v2) e tolerância ao legado (v1).
- `ping`/`pong` e `dropPeer` por timeout de keepalive (timers falsos ou injeção de clock).
- `putPeer`/`getPeers` do store (backend journal/memória).
- `prosa_ice`/`VITE_ICE_SERVERS_JSON` lidos corretamente, incluindo entrada TURN.

**Verificação:** `npm --prefix web test` verde com os novos casos.

## T8 — Regressão final

- Re-executar o harness T1 (`/tmp/p2p-ice-test/main.js` adaptado ao novo fluxo se necessário): `dc.open` deve abrir com `gather=complete` em ambos os lados e diagnóstico visível.
- `npm --prefix web test` + `npm test` (server) sem regressão.

**Verificação:** evidência registrada no relatório como "pós-correção".

---

## Ordem e dependências

```
T1 (diag) ──┐
            ├─> T2 (ICE completo) ──> T3 (hello) ──> T4 (keepalive) ──> T5 (persistência) ──> T7 ──> T8
            └─> T6 (docs) [independente, qualquer ordem]
```

- T1 primeiro: toda mudança seguinte fica diagnosticável.
- T3 depende de T1 (log de fallback legado); T4/T5 dependem de T2 (canal confiável).
- T7 cobre T2–T5; T8 fecha o ciclo.

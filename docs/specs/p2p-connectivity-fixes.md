# Spec: Correções de conectividade P2P remota

**Nome da spec:** `p2p-connectivity-fixes`
**Base:** `docs/specs/investigate-pure-p2p-connectivity-report.md` (diagnóstico aprovado)
**Status:** aguardando aprovação
**Data:** 2026-10-15

---

## 1. Contexto

O diagnóstico confirmou que o transporte P2P é genuinamente direto, mas a conexão remota falha por causas concentradas no pareamento: **link com candidatos ICE incompletos** (`waitIce` de 8 s reproduzido expirando), **ausência de TURN** para cenários onde ICE direto é inviável, **falha silenciosa** sem nenhum log de estado, `hello` autodeclarado sem prova de posse, e ausência de reconexão/keepalive.

Esta spec cobre as correções de **custo baixo/médio** (F1–F5 do relatório) que resolvem a maioria dos casos sem nova infraestrutura. TURN (F7), sinalização auxiliar (F6) e UPnP (F8) ficam **explicitamente fora de escopo** até que os testes de campo demonstrem onde a conexão direta é inviável.

---

## 2. Objetivo

Fazer a conexão P2P entre computadores remotos:

1. Fechar com candidatos ICE completos antes de gerar o link.
2. Ser **diagnosticável**: o usuário e o desenvolvedor sabem em qual etapa a conexão está e onde falhou.
3. Autenticar o peer no handshake (prova de posse da chave Ed25519).
4. Resistir a quedas transitórias sem exigir re-pareamento imediato (keepalive + reconexão quando possível).
5. Permitir configuração de ICE/TURN pelo usuário, documentada.

---

## 3. Escopo

### Incluído

- **F1 — ICE completo antes do link**: remover a dependência do timeout de 8 s como caminho normal; gerar o link só após `iceGatheringState === 'complete'` (com timeout alto de segurança, ex. 20 s, e feedback de progresso).
- **F2 — Telemetria de pareamento** (conforme tabela do relatório T3): contagem de candidatos por tipo, transições `iceGathering`/`iceConnection`/`connection` state, `onicecandidateerror`, estado do DataChannel e resultado do `hello` — via `console.debug('[p2p:diag]')` opt-in e status visível na UI do `PairingPanel`.
- **F3 — Documentação da config ICE**: `prosa_ice` (localStorage) e `VITE_ICE_SERVERS_JSON` (build) documentados em `.env.example` e `README.md`, incluindo exemplo com TURN.
- **F4 — `hello` autenticado**: assinatura Ed25519 no `hello` provando posse da chave anunciada; fingerprint exibido no `PairingPanel` para conferência fora de banda; manter compatibilidade com `v:1` (aceitar sem assinatura com aviso, ou rejeitar — decidir na implementação).
- **F5 — Keepalive e reconexão**: `ping` periódico no canal de controle; peers conhecidos persistidos (store); tentativa de reconexão automática ao detectar queda, quando possível.
- **Compatibilidade**: não quebrar o fluxo atual de pareamento `prosa://pair/` nem o provider `server`.

### Fora de escopo (nesta spec)

- **TURN próprio** (coturn, credenciais, deploy) — condicional à validação de campo (H2).
- **Mailbox/rendezvous/sinalização automática** (ICE trickle por canal auxiliar) — mudança arquitetural maior; spec futura se necessário.
- **UPnP/NAT-PMP/PCP**.
- Mudanças de UI não relacionadas ao `PairingPanel`.
- Modo `server` (não afetado além do que for compartilhado).

---

## 4. Requisitos

- **R1** — O link `prosa://pair/` (offer e answer) só é gerado com `iceGatheringState === 'complete'`; se o gathering exceder timeout de segurança (≥ 15 s configurável), a UI avisa que os candidatos podem estar incompletos em vez de falhar silenciosamente.
- **R2** — Toda a cadeia de pareamento emite eventos de diagnóstico: tipos de candidatos coletados (contagem), transições de estado ICE/conexão, erros de candidato (`onicecandidateerror`), `dc.open`/`onclose`/`onerror` e resultado do `hello` — sem registrar IPs literais, chaves ou payloads.
- **R3** — A UI do `PairingPanel` exibe estado em tempo real: "coletando candidatos", "aguardando resposta", "conectando", "conectado" ou "falhou" (com o motivo quando disponível).
- **R4** — O `hello` passa a carregar assinatura Ed25519 sobre conteúdo determinístico (ex.: `hello|pubKeyHex|ts`), verificada antes de `attachPeer`; `peerId` continua sendo o `from`, mas só confiado após verificação de posse.
- **R5** — O `PairingPanel` exibe o fingerprint local (`p2p:xxxx…`) e o do peer conectado para conferência fora de banda.
- **R6** — Enquanto o canal estiver aberto, um `ping` de controle é enviado em intervalo configurável (default ~25 s) para manter o NAT mapping; ausência de `pong` por N intervalos marca o peer suspeito e dispara `dropPeer` com motivo registrado.
- **R7** — Peers conhecidos são persistidos no store local (pubKey, fingerprint, último estado); ao abrir o app, a UI lista "peers conhecidos" e permite re-parear sem recomeçar do zero.
- **R8** — `prosa_ice` e `VITE_ICE_SERVERS_JSON` aceitam lista completa de `RTCIceServer` (incluindo TURN) documentada em `.env.example` e `README.md`, com exemplo comentado.
- **R9** — Nada muda no provider `server` nem nos testes existentes que não cobrem P2P; `web/test/p2p.test.js` ganha cobertura para: link só após gathering completo, assinatura/verificação do `hello`, keepalive detectando queda e persistência de peers.
- **R10** — Comportamento mantém compatibilidade de envelope `v:1` para mensagens de domínio; `hello` pode subir para `v:2` com fallback tolerante documentado.

---

## 5. Regras

1. Priorizar conexão direta; TURN não é solução automática desta spec.
2. Não introduzir nova infraestrutura externa (mailbox, rendezvous, relay).
3. Não registrar dados sensíveis (IPs literais, chaves privadas, tokens, conteúdo de mensagens, SDP) nos logs de diagnóstico.
4. Manter compatibilidade com o formato `prosa://pair/` existente (ou versionar explicitamente com fallback tolerante).
5. Não alterar o provider `server`, `realtime.js`, `api.js` ou o backend.
6. Manter o estilo do código existente (comentários curtos em pt-BR explicando decisões não-óbvias).
7. Todas as mudanças de comportamento P2P devem ter cobertura em `web/test/p2p.test.js` quando testável em Node sem browser real (extrair lógica pura quando necessário).

---

## 6. Análise obrigatória (antes de implementar cada task)

- Confirmar que cada mudança mantém o fluxo manual de pareamento funcional (teste T1 do diagnóstico deve continuar passando).
- Verificar onde inserir telemetria sem poluir o código: preferir um único `logDiag(tag, data)` controlado por flag (`localStorage.prosa_debug` ou `import.meta.env.DEV`).
- Para `hello` assinado: definir o conteúdo assinado e a janela de validade do `ts` para tolerar relógios divergentes.
- Para reconexão: decidir se tenta `restartIce()`/`pc.restartIce()` no `pc` existente ou novo pareamento; ICE restart em DataChannel já estabelecido tem semântica própria — verificar viabilidade antes de assumir.
- Para persistência: usar o store existente (`store.cjs` / `localstore.js`) — não criar novo mecanismo.

---

## 7. Resultado esperado

- Link `prosa://pair/` sempre gerado com candidatos completos (ou aviso explícito quando não).
- Falhas de conexão produzem diagnóstico visível (estado na UI + `[p2p:diag]` no console).
- `hello` prova posse da chave; fingerprints conferíveis na UI.
- Canal sustentado por keepalive; quedas transitórias não exigem novo pareamento imediato.
- Usuário pode configurar STUN/TURN próprios via configuração documentada.
- Testes cobrindo os comportamentos acima; `cd web && npm test` passa.

---

## 8. Critérios de aceite

- [ ] `createPairingOffer`/`acceptPairingOffer` aguardam `iceGatheringState === 'complete'` com timeout de segurança configurável e aviso ao usuário quando expirar.
- [ ] Candidatos coletados logados por tipo (host/srflx/relay, flag mDNS) sem IPs.
- [ ] `oniceconnectionstatechange`/`onconnectionstatechange`/`onicecandidateerror`/`dc` handlers emitem diagnóstico.
- [ ] UI do `PairingPanel` mostra estado da cadeia em tempo real e fingerprint do peer.
- [ ] `hello` carrega e verifica assinatura Ed25519 antes de `attachPeer`.
- [ ] Keepalive `ping`/`pong` no canal de controle com detecção de peer morto.
- [ ] Peers conhecidos persistidos e listados para re-pareamento.
- [ ] `prosa_ice`/`VITE_ICE_SERVERS_JSON` documentados com exemplo incluindo TURN.
- [ ] `npm --prefix web test` passa com novos testes cobrindo o comportamento alterado.
- [ ] Nenhuma dependência nova de infraestrutura externa.

---

## 9. Arquivos prováveis de alteração

- `web/src/services/p2p/pairing.js` — gathering completo, telemetria, `hello` assinado.
- `web/src/services/p2p/localconfig.js` — documentação/config (já aceita TURN; só docs + comentários).
- `web/src/services/p2p/transport.js`, `node.js` — keepalive, persistência de peers, reconexão.
- `web/src/services/p2p/identity.js` — `sign`/`verify` já existem; uso no `hello`.
- `web/src/components/PairingPanel.vue` — estado da cadeia, fingerprints, lista de peers conhecidos.
- `web/src/services/p2p/store.cjs`/`localstore.js` — persistência de peers conhecidos.
- `web/test/p2p.test.js` — cobertura dos novos comportamentos.
- `.env.example`, `README.md` — documentação de `prosa_ice`/`VITE_ICE_SERVERS_JSON` com exemplo TURN.

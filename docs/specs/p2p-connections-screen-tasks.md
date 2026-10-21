# Plano de tasks — Nova tela "Conexões" (rede P2P)

- Status geral: concluído
- Spec de referência: `docs/specs/p2p-connections-screen.md` (aprovada)
- Ordem de execução: T1 → T2 → T3 → T4 → T5 (sequencial; T2–T4 editam o mesmo componente)

## T1 — Esqueleto visual da tela Conexões, navegável

- Status: concluída
- Requisitos/aceite: RF-01, RF-06, RF-08, RF-09, RF-10, RNF-01, CA-02, CA-06 (parcial)
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - novo `web/src/components/ConnectionsView.vue`
  - `web/src/views/HomeView.vue` (aditivo: import, branch `view === 'conexoes'`, item "Conexões" na sidebar; branch `friends` intocado)
- Implementação:
  - Header "Conexões" + abas (`role="tablist"`, `aria-selected`) filtrando `store.relationships` por `friend/incoming/outgoing/blocked`.
  - Cartão "Rede P2P": ícone, título, subtítulo, botão "Criar convite" e campo único + "Adicionar" (ainda sem handlers de pareamento — o botão/entra em T2; manter desabilitados ou com stub mínimo).
  - Lista "AMIGOS DISPONÍVEIS — N" (N = amigos com `presenceOf !== 'offline'`), cards com avatar/`avatarUrl`, dot de presença, `displayName`, label de presença; clique abre DM via `dms.open`/`openChannel` (espelhar `openFriendDm`).
  - Barra inferior: `REDE P2P ATIVA` (de `store.wsConnected`), contagem de peers (`p2pTransport.peerIds().length` atualizada por `peer.open`/`peer.closed`), versão lida de `web/package.json`.
  - CSS scoped usando tokens de `style.css`.
- Testes e comandos de validação: `npm run build`; inspeção manual da navegação até a nova tela; `git diff` confirma `friends` intocado (CA-01 parcial).
- Critério de conclusão: tela acessível via sidebar, abas filtram, contagem e barra de status corretas, build verde.
- Evidências: `web/src/components/ConnectionsView.vue` (novo, 152 linhas); `web/src/views/HomeView.vue` — 5 inserções aditivas (item "Conexões" na sidebar, branch `conexoes` com `@open-dm="openFriendDm"`, import, `homeSidebar`, `chat-open`); branch `friends` byte a byte idêntico no `git diff`. `npm run build` ✓ (1.58s). `git diff --check` ✓. Verificação manual de navegação pendente (app não iniciado nesta task). "Criar convite"/"Adicionar" desabilitados até T2, como planejado.

## T2 — Fluxo de pareamento completo no cartão "Rede P2P"

- Status: concluída
- Requisitos/aceite: RF-02, RF-03, RF-04, RNF-03, CA-03, CA-04
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/components/ConnectionsView.vue`
- Implementação:
  - Instanciar `createPairingFlow({ node: getP2PNode(), onChange })`; `dispose()` no `onUnmounted`.
  - "Criar convite" → `flow.createInvite()`; área de progresso com `phase`/`instruction` (mesmos mapas do `PairingPanel`), botão copiar (`flow.copyLink`), `<details>` "Ver link", campo para colar resposta visível em `idle`/`awaiting-response`, notices/warnings/errors, fingerprint do peer conectado (`fingerprintOf`), "Solicitar amizade novamente" (`relationship === 'removed'`, reusar `contacts.requestContact`), aviso `legacy`, "Recomeçar pareamento" (`flow.restart()`).
  - Campo único: `input.startsWith('prosa://pair/')` ou decodificável por `decodePairPayload` → `flow.continueWithLink`; regex `^[0-9a-fA-F]{64}$` → `contacts.request`; demais → erro inline.
  - Subscriptions `peer.open`/`peer.closed` para refresh de peers (flag `unmounted`).
- Testes e comandos de validação: `npm --prefix web test` (suites de pairing seguem verdes), `npm run build`; roteiro manual: criar convite, copiar, colar link inválido (erro inline), colar pubkey inválida (erro).
- Critério de conclusão: fluxo idêntico em comportamento ao `PairingPanel` (mesmos estados e mensagens), sem alterar `pairing-flow.js`.
- Evidências: `ConnectionsView.vue` — `createPairingFlow` instanciado com `getP2PNode()`, `dispose()` no `onUnmounted`; mesmos mapas `phase`/`instruction` do `PairingPanel`; copiar convite/resposta, "Ver link" (`:open="pair.copyError"`), `remoteLink`+Continuar nos steps `idle`/`awaiting-response`, notices/warnings/errors/ok, `fingerprintOf` no `watch` de `peerId`, resend via `p2pContacts.requestContact`, aviso `legacy`, "Recomeçar". Heurística do campo único: `decodePairPayload` ok → `flow.continueWithLink`; `^[0-9a-fA-F]{64}$` → `contacts.request` + `loadRelationships`; demais → erro inline. `npm --prefix web test` ✓ 242/242. `npm run build` ✓. `git diff --check` ✓. `pairing-flow.js` intocado. Teste manual do handshake entre dois perfis pendente (app não iniciado).

## T3 — Ações de relacionamento nas abas Pendentes/Enviadas/Bloqueados

- Status: concluída
- Requisitos/aceite: RF-07, CA-05
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/components/ConnectionsView.vue`
- Implementação:
  - Pendentes: botões Aceitar (`contacts.accept`) e Recusar (`contacts.remove`) + `loadRelationships()`.
  - Enviadas: "Cancelar convite" via `createInvitationCancellation` (mesma configuração de `FriendsPanel.vue`: `pendingIds`, `needsReload`, "Atualizar lista", anúncio `aria-live`, foco via teclado).
  - Bloqueados: "Desbloquear" (`contacts.unblock`).
  - Estados vazios por aba.
- Testes e comandos de validação: `npm --prefix web test`; manual: aceitar/recusar/cancelar/desbloquear refletindo na lista; `RELATIONSHIP_UPDATE`/`contacts.changed` recarregam.
- Critério de conclusão: paridade funcional com `FriendsPanel.vue` nos três conjuntos de ações.
- Evidências: `ConnectionsView.vue` — `createInvitationCancellation` com mesma config do `FriendsPanel` (successMessage, `pendingIds`, `needsReload`, "Atualizar lista", anúncio `aria-live` sr-only + visível, foco de teclado via `outgoingHeading`/`refreshButton`); ações Aceitar/Recusar em Pendentes, Cancelar convite em Enviadas, Desbloquear em Bloqueados, erros inline (`relErr`); `cancellation.dispose()` no `onUnmounted`. `npm --prefix web test` ✓ 242/242. `npm run build` ✓. `git diff --check` ✓. `invitation-cancellation.js` intocado. Verificação manual das ações pendente.

## T4 — "Detalhes da conexão" expansível no cartão

- Status: concluída
- Requisitos/aceite: RF-05, CA-03 (parcial — verificação de fingerprint)
- Dependências: T2
- Escopo e arquivos prováveis: `web/src/components/ConnectionsView.vue`
- Implementação: `<details>` com minha chave pública + "Copiar chave" (`writeClipboardText`, anúncio acessível), fingerprint, lista de peers conhecidos (`node().knownPeers()` + `p2pTransport.isOnline`) com "Desconectar" (`dropPeer`), e "Adicionar contato" por pubkey (`contacts.requestContact` + `loadRelationships`), erro inline.
- Testes e comandos de validação: `npm --prefix web test`, `npm run build`; manual: copiar chave, desconectar peer online, adicionar contato por chave.
- Critério de conclusão: paridade com a seção `connection-details` de `PairingPanel.vue`.
- Evidências: `ConnectionsView.vue` — `<details>` com chave pública + "Copiar chave" (`writeClipboardText`, `aria-busy`, anúncio sr-only `keyNotice`/`keyErr`), `myFp` (fingerprint), peers conhecidos via `node().knownPeers()` + `isOnline` com "Desconectar" (`dropPeer` + refresh), "Adicionar contato" por pubkey (`p2pContacts.requestContact` + `loadRelationships`), `unmounted` flag; `peer.open`/`peer.closed` também atualizam `refreshKnown`. `npm --prefix web test` ✓ 242/242. `npm run build` ✓. `git diff --check` ✓. Verificação manual pendente.

## T5 — Acabamento e validação integrada

- Status: concluída
- Requisitos/aceite: RNF-01, RNF-02, RNF-04, CA-01, CA-07, CA-08, CA-09
- Dependências: T1–T4
- Escopo e arquivos prováveis: `web/src/components/ConnectionsView.vue`, `web/src/views/HomeView.vue` (somente se ajuste responsivo exigir)
- Implementação: revisão de tema claro, breakpoint 700px, `:focus-visible`, aria das abas/anúncios; sweep do diff.
- Testes e comandos de validação: `npm test`, `npm --prefix web test`, `npm run build`, `git diff --check`; checklist CA-01 (arquivos existentes intocados); alternância repetida de views sem listeners vazados (CA-07); roteiro manual completo.
- Critério de conclusão: todos os CAs atendidos ou explicitamente marcados como verificação manual pendente.
- Evidências: ajustes em `ConnectionsView.vue` — `.cx-idcard` passa a `var(--bg-input)` (tema claro), cards clicáveis com `role="button"`/`tabindex`/Enter+Space e `:focus-visible`, `.cx .btn:focus-visible` genérico, `flex-wrap` nos cards e media query ≤700px (header/status/padding). Suites: `npm test` ✓ 14/14, `npm --prefix web test` ✓ 242/242, `npm run build` ✓, `git diff --check` ✓. CA-01: diff rastreado toca apenas `HomeView.vue` (+8/−2, extensões aditivas; branch `friends` intocado); demais arquivos são novos. CA-07: `peer.open`/`peer.closed` unsubscribed, `flow.dispose()` e `cancellation.dispose()` no `onUnmounted`. Verificação manual pendente: navegação visual, handshake entre perfis, ações das abas, temas e ≤700px — app não foi iniciado em nenhuma task. **Usuário testou manualmente e autorizou a remoção da tela antiga (T6).**

## T6 — Remover a tela antiga (Amigos), deixando somente Conexões

- Status: concluída
- Requisitos/aceite: revisão pós-teste autorizada pelo usuário
- Dependências: T1–T5 concluídas e validadas manualmente pelo usuário
- Escopo e arquivos prováveis: `web/src/views/HomeView.vue`, remoção de `web/src/components/PairingPanel.vue` e `web/src/components/FriendsPanel.vue`
- Implementação: remover branch `view === 'friends'`, chan "Amigos" (Smile) e imports dos painéis; repontar arrow "Ver amigos", hero-cta e `chat-open`/`homeSidebar` para `conexoes`; remover `Smile` dos imports lucide; apagar os dois componentes órfãos.
- Testes e comandos de validação: `npm test`, `npm --prefix web test`, `npm run build`, `git diff --check`; grep residual por `friends`/`Smile`.
- Critério de conclusão: nenhuma referência restante à view antiga; Conexões é a única tela de gestão de contatos/P2P; suites verdes.
- Evidências: `HomeView.vue` — branch `friends`, chan "Amigos" (Smile), imports `FriendsPanel`/`PairingPanel`/`Smile` removidos; arrow "Ver amigos", hero-cta e `chat-open`/`homeSidebar` apontam para `conexoes`. `PairingPanel.vue` e `FriendsPanel.vue` apagados. Grep residual por `'friends'`/`Smile`/nomes dos painéis: 0 ocorrências. `npm --prefix web test` ✓ 242/242, `npm test` ✓ 14/14, `npm run build` ✓, `git diff --check` ✓.

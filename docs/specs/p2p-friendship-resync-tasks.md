# Plano de execução — Sincronização do vínculo de amizade após reconexão P2P

- Spec: `docs/specs/p2p-friendship-resync.md` (aprovada)
- Processo: `.devin/sdd.md` — uma task por vez, validação por task, aprovação antes da próxima.
- Ordem: T1 → T2 → T3 → T4 → T5 (dependências: T2 depende apenas de `contacts.js`; T1 e T2 independentes entre si, sequenciados por simplicidade de revisão).

## T1 — Re-pareamento re-solicita contato `removed` (RF-01, RF-07)

- Status: concluída
- Escopo: em `web/src/services/p2p/pairing-peer.js`, ampliar a política do
  iniciador de `!existing` para `!existing || existing.state === 'removed'` —
  chamar `requestContact`, emitir `contacts.changed` e `onRequest`.
  Estados `friend`, `incoming`, `outgoing` e `blocked` seguem chamando só
  `onRelationship` (sem reenvio). Atualizar o comentário da regra.
- Critérios de aceite: CA-01 (lado iniciador), CA-04.
- Validação: `npm --prefix web test`; `git diff --check`.
- Testes: `web/test/p2p-pairing-peer.test.js` — iniciador com `removed`
  envia `contact_req` e reporta via `onRequest`; `blocked`/`incoming`/
  `outgoing` não enviam; `friend` não envia (já coberto ou adicionado).
- Arquivos: `web/src/services/p2p/pairing-peer.js`,
  `web/test/p2p-pairing-peer.test.js`.
- Evidências: `npm --prefix web test` → 240 pass / 0 fail (re-executada após
  a mudança); `git diff --check` limpo. Teste legado
  "re-pairing preserves removed without resending" reescrito para o novo
  contrato (removed → reenvio de `contact_req` + `outgoing`); `removed`
  removido do loop de estados sem reenvio.
- Divergências: o teste "re-pairing reports removed relationship without
  resurrecting it" foi substituído — a spec aprovada (RF-01/D2) inverte
  deliberadamente essa expectativa.
- Próxima task elegível: T2.

## T2 — Pedido cruzado resolve em amizade (RF-03)

- Status: concluída
- Escopo: em `web/src/services/p2p/contacts.js`, `handleContactReq` ganha
  ramo para `existing.state === 'outgoing'`: grava `friend`
  (`putContact`/`mutateContact`) e envia `contact_accept` ao peer via
  `p2pTransport.sendToPeer`. O aceite sobre `outgoing` remoto promove a
  `friend` pelo `handleContactAccept` já existente — ambas as pontas viram
  amigos sem pendência travada.
- Critérios de aceite: CA-02 (parcial), CA-03.
- Validação: `npm --prefix web test`; `git diff --check`.
- Testes: `web/test/p2p-contacts.test.js` e/ou `web/test/friends-sync.test.js`
  — req sobre `outgoing` → `friend` local + `contact_accept` transmitido;
  o lado que recebe o aceite sobre `outgoing` → `friend`; listas do
  provider refletem `friend` nos dois lados.
- Arquivos: `web/src/services/p2p/contacts.js`,
  `web/test/p2p-contacts.test.js`, `web/test/friends-sync.test.js`.
- Evidências: `npm --prefix web test` → 241 pass / 0 fail; `git diff --check`
  limpo. `outgoing` removido do loop "preserva" (contrato mudou); testes
  novos cobrem cruzado isolado e fluxo A↔B completo.
- Divergências: nenhuma além da mudança de contrato já aprovada (D3).
- Próxima task elegível: T3.

## T3 — Ação "Solicitar amizade novamente" no painel (RF-04)

- Status: concluída
- Escopo: em `web/src/components/PairingPanel.vue`, quando o fluxo reporta
  `onRelationship('removed')`, oferecer botão "Solicitar amizade novamente"
  junto ao aviso; a ação chama `requestContact(identity, { pubkey: pair.peerId })`
  e `loadRelationships()`, com erros na área de erro existente. Guardar o
  estado de relação reportado pelo fluxo (já há `notice` — adicionar flag ou
  derivar do notice por tipo, preferindo flag explícita).
- Critérios de aceite: CA-05.
- Validação: `npm --prefix web test`; `npm run build`; `git diff --check`.
- Arquivos: `web/src/components/PairingPanel.vue`,
  `web/src/services/p2p/pairing-flow.js`,
  `web/test/p2p-pairing-flow.test.js`.
- Evidências: `npm --prefix web test` → 242 pass / 0 fail (campo
  `relationship` coberto nos 5 estados + teste de limpeza em
  restart/nova conexão); `npm run build` ok; `git diff --check` limpo.
- Divergências: o estado expõe `relationship` no `pairing-flow` (flag
  explícita, conforme a task sugeria) em vez de derivar do texto do
  aviso — necessário para o botão aparecer sem casar string de UI.
- Próxima task elegível: T4.

## T4 — Item "Desconectar" no menu do amigo (RF-05)

- Status: concluída
- Escopo: em `web/src/views/HomeView.vue`, `friendMenuItems` ganha
  "Desconectar" → `p2pTransport.dropPeer(uid, 'user-disconnect')` —
  encerra canal+pc sem tocar no contato; "Desfazer conexão" permanece
  como remoção de vínculo. Menu passa a três opções (revisão aprovada do
  RF-05 de `friends-aside-context-menu.md`).
- Critérios de aceite: CA-06.
- Validação: `npm --prefix web test`; `npm run build`; `git diff --check`.
- Arquivos: `web/src/views/HomeView.vue`.
- Evidências: `npm --prefix web test` → 242 pass / 0 fail; `npm run build`
  ok; `git diff --check` limpo. Ícone `Unplug` confirmado disponível em
  `lucide-vue-next` instalado.
- Divergências: o item só é exibido quando `p2pTransport.isOnline(uid)` —
  consistente com "Peers conhecidos", que só mostra "Desconectar" para
  peers online; o `dropPeer` é no-op idempotente de qualquer forma.
- Próxima task elegível: T5.

## T5 — Validação integrada e roteiro manual

- Status: concluída
- Escopo: sem mudança de comportamento — revisão do diff completo,
  `npm --prefix web test`, `npm test`, `npm run build`, `git diff --check`.
  Documentar checklist manual (duas instâncias): remover amigo → re-parear →
  "Enviadas"/"Recebidas" → aceitar → amigo de volta com DM acessível;
  desconectar pelo menu → amigo permanece; re-parear sem nova solicitação.
- Critérios de aceite: CA-01 a CA-07.
- Validação: itens acima.
- Evidências: `npm --prefix web test` → 242 pass / 0 fail; `npm test` →
  14 pass / 0 fail; `npm run build` ok; `git diff --check` limpo.
  Revisão do diff: mudanças restritas a `contacts.js`, `pairing-peer.js`,
  `pairing-flow.js`, `PairingPanel.vue`, `HomeView.vue` + testes — sem
  segredos, sem tocar provider `server`, `api.js`, `rtc.js` ou IPC.
- Checklist manual (duas instâncias, `localStorage.prosa_debug='1'`):
  1. A e B amigos → A usa menu do amigo → "Desconectar" → B sai de online
     nos dois lados; A e B continuam em "Amigos" com DM acessível.
  2. Re-pareamento A→B (link novo) → como ambos são `friend`, nenhum
     pedido novo aparece; conversa volta a funcionar ao conectar.
  3. A remove B ("Desfazer conexão") → ambos saem das listas.
  4. Re-pareamento iniciado por A → A vê o pedido em "Enviadas" e B vê em
     "Recebidas" sem recarregar; B aceita → os dois viram `friend` e a DM
     volta a abrir.
  5. Re-pareamento iniciado por B com contato `removed` → B vê o aviso +
     botão "Solicitar amizade novamente"; ao clicar, A recebe em
     "Recebidas".
  6. A e B clicam em "Adicionar contato" quase ao mesmo tempo → pedidos
     cruzados resolvem em `friend` nas duas pontas, sem pendência travada.
- Pendência honesta: os itens manuais 1–6 não foram executados em rede
  real entre duas instâncias do Electron — verificação de UI/UX real
  fica para o usuário; a lógica de domínio está coberta por testes.
- Divergências: nenhuma além das já reportadas em T1–T4.

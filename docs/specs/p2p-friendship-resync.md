# Spec: Sincronização do vínculo de amizade após reconexão P2P

- Status: aprovada
- Data: 2026-10-21
- Origem: pedido do usuário — após desconectar e reconectar, o contato fica em
  "Peers conhecidos" mas não reaparece em "Recebidas" e a conversa fica
  inacessível; com fluxo SDD conforme `.devin/sdd.md`.
- Base: análise Fase 1 em 2026-10-21; spec relacionada aprovada:
  `p2p-peer-reconnect.md` (ciclo de vida do transporte, já implementada).
- Relação com spec anterior: `friends-aside-context-menu.md` define a semântica
  de "Desfazer conexão" (remoção do vínculo) — mantida; ver D1.

## 1. Objetivo e contexto

Separar e sincronizar os dois ciclos de vida que hoje se confundem:

- **Conexão de transporte** (DataChannel/pc por peer) — corrigida em
  `p2p-peer-reconnect`: desconectar encerra recursos, re-parear reconecta.
- **Vínculo de amizade** (`contacts` no store local) — o que alimenta "Amigos",
  "Recebidas", "Enviadas" e o acesso à conversa.

### Causas raiz identificadas na análise (fatos no código)

- "Desfazer conexão" grava tombstone `removed` nos dois lados — é remoção de
  vínculo, não desconexão de rede. O contato some de todas as listas do
  provider → sem entrada de conversa.
- `wirePairingPeer` só envia `contact_req` quando `initiator && !existing`
  ("re-pareamento nunca recria removed"). Após remoção mútua, nenhum lado
  solicita → "Recebidas" vazio nas duas pontas.
- A única via de re-solicitação é "Adicionar contato" por chave pública —
  exige a chave hex completa do amigo, escondida em "Detalhes da conexão".
- Pedidos cruzados travam em deadlock: `handleContactReq` ignora req sobre
  `outgoing` e `acceptContact` exige `incoming` — `outgoing`/`outgoing`
  permanente sem saída pela UI.

## 2. Escopo

Inclui:

- `web/src/services/p2p/pairing-peer.js`: iniciador do re-pareamento envia
  `contact_req` também quando `existing.state === 'removed'` (re-parear é
  intenção explícita; o outro lado ainda decide aceitar). `incoming`,
  `outgoing`, `blocked` e `friend` seguem sem reenvio.
- `web/src/services/p2p/contacts.js`: `handleContactReq` sobre contato
  `outgoing` resolve pedido cruzado — promove a `friend` e envia
  `contact_accept` de volta (intenção mútua provada nas duas pontas).
- `web/src/components/PairingPanel.vue`: quando o relacionamento reportado é
  `removed`, oferecer ação "Solicitar amizade novamente" usando o `peerId`
  conectado — caminho visível sem exigir a chave pública colada.
- (D1, sob decisão) Item "Desconectar" no menu de contexto do amigo
  (`HomeView.vue`) chamando `p2pTransport.dropPeer(uid, 'user-disconnect')` —
  desconexão de transporte que preserva o vínculo, distinta de
  "Desfazer conexão" (remoção).
- Testes de regressão em `web/test/` cobrindo cada mudança.

Fora de escopo:

- Reconexão automática sem troca de link (sem sinalização/rendezvous na
  arquitetura — mesma limitação de `p2p-peer-reconnect`).
- Alterar a semântica de "Desfazer conexão" (permanece remoção de vínculo,
  conforme `friends-aside-context-menu.md` e `friends-sync.test.js`).
- Provider `server`, `realtime.js`, `api.js`, backend, `rtc.js`, IPC.
- Mudanças de wire/envelope/handshake — `contact_req`/`contact_accept`/
  `contact_remove` já existem.

## 3. Modos, plataformas e semântica

| Comportamento | Server | P2P |
| --- | --- | --- |
| Re-solicitar após remoção via re-pareamento | Não se aplica | Sim |
| Pedido cruzado resolve em amizade | Backend já trata (fora de escopo) | Sim |
| Re-solicitação por botão no painel | Não se aplica | Sim |
| "Desconectar" preservando vínculo (menu) | Não se aplica | Sim (D1) |

- Plataformas: Electron (alvo) e navegador de desenvolvimento.
- "Peers conhecidos" é lista de **rede** (todo peer pareado, amigo ou não) —
  permanece assim; "Amigos"/"Recebidas"/"Enviadas" vêm do store de contatos —
  separação já existente que a spec reforça, não altera.

## 4. Requisitos

### Funcionais

- **RF-01:** No re-pareamento como iniciador, se o contato verificado tem
  `state === 'removed'`, chamar `requestContact` (que já trata `removed` →
  `outgoing` + envia `contact_req`) e notificar via `onRequest`; o estado
  local vira `outgoing` ("Enviadas") e o remoto recebe `incoming`
  ("Recebidas"). Não enviar para `friend`, `incoming`, `outgoing` ou
  `blocked` — mantidos os avisos de `onRelationship`.
- **RF-02:** O answerer com `removed` que recebe `contact_req` transiciona
  para `incoming` (comportamento já existente de `handleContactReq`) e o
  contato aparece em "Recebidas" via `contacts.changed` — sem reload.
- **RF-03:** `handleContactReq` sobre `outgoing` resolve o pedido cruzado:
  grava `friend` e envia `contact_accept` ao peer; o outro lado, ao receber o
  aceite sobre seu `outgoing`, vira `friend` (fluxo já existente de
  `handleContactAccept`). Resultado: amizade nas duas pontas, sem pedido
  duplicado pendurado.
- **RF-04:** `PairingPanel` exibe ação "Solicitar amizade novamente" quando o
  relacionamento reportado pelo fluxo for `removed` (o `peerId` conectado já
  é conhecido pelo painel): chama `requestContact(identity, { pubkey })` e
  `loadRelationships()`; erros exibidos na área de erro existente.
- **RF-05 (D1, sob decisão):** O menu de contexto do amigo pode ganhar item
  "Desconectar" (chama `dropPeer(uid, 'user-disconnect')`) preservando o
  vínculo — revisão do RF-05 de `friends-aside-context-menu.md`, que fixava
  exatamente duas opções. Requer aprovação explícita desta spec.
- **RF-06:** Após o vínculo voltar a `friend` (por aceite local ou remoto),
  o contato reaparece na seção "Amigos" do aside e a DM volta a ser
  acessível via fluxo existente (`dms.open` + espaço persistido) — sem
  recarregar nem reiniciar.
- **RF-07:** Nenhuma mudança no significado de `removed` nos demais caminhos:
  aceite atrasado não ressuscita vínculo removido (contrato de
  `friends-sync.test.js` preservado) e re-pareamento nunca envia pedido para
  `blocked`.

### Não funcionais

- **RNF-01:** Nenhuma dependência nova, nenhum IPC novo, nenhuma mudança de
  wire/envelope/`hello` — só novos disparos dos controles já existentes.
- **RNF-02:** Cobertura `node --test`: re-pareamento iniciador com `removed`
  emite `contact_req` e vira `outgoing`; answerer `removed`→`incoming` na
  lista do provider; cruzado `outgoing`+req → `friend` + `contact_accept`
  enviado; `friend` re-pareado não duplica pedido; `blocked` não solicita.
- **RNF-03:** Preservar padrão de código e identidade visual; avisos/erros
  nas áreas existentes do painel.

## 5. Contratos afetados

- `wirePairingPeer` — política de `requestContact` no re-pareamento amplia de
  `!existing` para `!existing || existing.state === 'removed'` (RF-01).
- `handleContactReq(fromPeerId, body, identity)` — novo ramo para
  `existing.state === 'outgoing'` (RF-03); demais ramos intactos.
- UI: novo uso de `requestContact` pelo `PairingPanel` com `pair.peerId`
  (RF-04); item de menu novo (RF-05, sob decisão).
- Payloads de controle inalterados: `contact_req { profile }`,
  `contact_accept { profile }`, `contact_remove {}`.
- Eventos locais `contacts.changed`/`peer.open`/`peer.closed` — inalterados.

## 6. Estado, persistência e integridade

- Sem migração: estados de contato (`friend`, `incoming`, `outgoing`,
  `blocked`, `removed`) já persistidos no store local — só novas transições
  usando `putContact`/`mutateContact` existentes.
- O espaço DM do par nunca é removido na desconexão/remoção — a conversa
  reaparece funcional ao voltar a `friend` (RF-06).
- Tombstone `removed` continua impedindo ressurreição silenciosa: a
  re-solicitação exige ação humana (re-parear como iniciador ou clicar no
  botão) e aceite do outro lado.

## 7. Segurança, privacidade e limites

- Consentimento preservado: re-parear envia **solicitação**, não amizade —
  o destinatário decide aceitar; o remetente pode cancelar via "Cancelar
  convite" existente.
- `contact_req` continua carregando apenas `identity.publicUser()` — nenhum
  dado novo trafega.
- `blocked` permanece barreira: pedidos de bloqueado são ignorados (ramo já
  existente) e o iniciador não reenvia para `blocked`.
- Nenhuma operação toca dados de usuário fora das transições de contato.

## 8. Falhas e recuperação

- **Remoção mútua:** iniciador do re-pareamento re-solicita (RF-01); o outro
  vê em "Recebidas" e decide — resolve o sintoma principal.
- **Pedido cruzado:** `outgoing`+req → `friend` nas duas pontas (RF-03) —
  elimina o deadlock sem intervenção do usuário.
- **Envio do pedido falhando com peer online:** rollback a `removed` +
  erro visível no painel (comportamento já existente de `requestContact`);
  nova tentativa possível pelo botão (RF-04) ou novo pareamento.
- **Pedido enfileirado offline:** `contact_req` em `pendingQueue` entrega ao
  reconectar (design vigente); um `contact_remove` antigo na fila precede o
  pedido na ordenação — estado final coerente.
- **Re-pareamento de quem foi removido:** se o lado removido inicia o
  pareamento, ele é quem envia a solicitação — consentimento simétrico.
- **`blocked`/`incoming`/`outgoing` existentes:** re-pareamento não reenvia;
  avisos de `onRelationship` orientam o usuário (já existente).

## 9. Critérios de aceite

| ID | Verificação | Requisitos |
| --- | --- | --- |
| CA-01 | Remover amigo + re-parear como iniciador: local vira `outgoing` (Enviadas) e remoto vê `incoming` (Recebidas), sem reload | RF-01, RF-02 |
| CA-02 | Aceite em Recebidas após re-pareamento: ambos `friend`; contato reaparece em "Amigos" e a DM abre | RF-03, RF-06 |
| CA-03 | Dois `contact_req` simultâneos resolvem em `friend` nas duas pontas, sem pendência travada | RF-03 |
| CA-04 | Re-pareamento com contato `friend` não cria pedido duplicado; `blocked`/`incoming`/`outgoing` não reenviam | RF-01, RF-07 |
| CA-05 | Botão "Solicitar amizade novamente" visível com relação `removed` envia o pedido pelo `peerId` conectado | RF-04 |
| CA-06 | (Se D1 aprovado) "Desconectar" no menu do amigo derruba o transporte e o amigo permanece em "Amigos" | RF-05 |
| CA-07 | `npm --prefix web test` e `npm run build` passam; `git diff --check` limpo | RNF-02 |

## 10. Estratégia de validação, riscos e decisões

- **Automatizado:** estender `friends-sync.test.js` (contrato das listas:
  `removed` → req → `incoming` → accept → `friend`; cruzado → `friend`) e
  `p2p-pairing-peer.test.js` (re-pareamento `removed` envia pedido; `friend`
  não reenvia; `blocked` não reenvia). Store `memory`, sem dados reais.
- **Manual (pendência registrada):** duas instâncias: remover amigo →
  re-parear → "Enviadas"/"Recebidas" → aceitar → amigo de volta e DM abrindo.
- **Riscos:** re-solicitação automática pode surpreender quem removeu de
  propósito — mitigada por ser pedido (não amizade) e cancelável; a ordem
  `attachPeer`→`removeEventListener` e o flush de `pending` em
  `wirePairingPeer` devem ser preservados ao inserir a nova política.
- **Decisões aprovadas em 2026-10-21:**
  - **D1:** item "Desconectar" incluído no menu do amigo (RF-05) — revisa o
    RF-05 de `friends-aside-context-menu.md`, que fixava exatamente duas
    opções. "Desfazer conexão" (remover vínculo) permanece.
  - **D2:** auto-re-solicitação do iniciador sobre `removed` aprovada
    (RF-01) — reverte a regra "nunca recria removed" com a salvaguarda de
    ser pedido e não amizade; cancelável via "Cancelar convite".
  - **D3:** resolução automática de pedidos cruzados aprovada (RF-03).
- **Perguntas bloqueantes:** nenhuma — as três têm proposta registrada.

## 11. Arquivos prováveis de alteração

- `web/src/services/p2p/pairing-peer.js` — RF-01.
- `web/src/services/p2p/contacts.js` — RF-03.
- `web/src/components/PairingPanel.vue` — RF-04.
- `web/src/views/HomeView.vue` — RF-05 (somente se D1 aprovado).
- `web/test/p2p-pairing-peer.test.js`, `web/test/friends-sync.test.js`,
  `web/test/p2p-contacts.test.js` — RNF-02.

# Spec — Nova tela "Conexões" (rede P2P)

- Status: aprovada (defaults de §12 adotados — latência omitida, versão real 0.2.0, sem rich presence, clique no card abre DM, entrada via `view === 'conexoes'`)
- Revisão pós-teste (autorizada pelo usuário): a tela antiga (`view === 'friends'` com `PairingPanel` + `FriendsPanel`) é **removida**; a tela Conexões passa a ser a única. O item "fora de escopo" que preservava a tela antiga deixa de valer a partir da T6.
- Slug: `p2p-connections-screen`
- Referência visual: mock enviado pelo usuário (header "Conexões" com abas, cartão "Rede P2P", lista de amigos e barra de status inferior)

## 1. Objetivo e contexto

Criar uma **nova tela** de configuração da rede P2P do Prosa reproduzindo o layout do mock: abas `Todos | Pendentes | Enviadas | Bloqueados`, cartão "Rede P2P" com botão "Criar convite" e campo único "Adicionar por nome de usuário ou colar convite…", lista de amigos com avatar e indicador de status, e barra inferior com estado da rede e versão.

A tela existente (`view === 'friends'` em `HomeView.vue`, que renderiza `PairingPanel` + `FriendsPanel`) **permanece intacta e funcional**: nenhum comportamento, configuração ou implementação P2P atual pode ser modificado, removido ou substituído.

## 2. Escopo

### Dentro

- Novo componente Vue 3 (nome provável `ConnectionsView.vue` em `web/src/components/`) com todo o markup/CSS da nova tela, usando os tokens existentes de `web/src/style.css`.
- Ponto de entrada de navegação novo e aditivo (estado `view === 'conexoes'` em `HomeView.vue` + item na sidebar), sem alterar o branch `friends`.
- Reuso, sem alteração, de: `createPairingFlow`, `isPairingBusy`, `createInvitationCancellation`, `contacts.*` (via `services/index.js`), `p2pTransport` (`peerIds`, `isOnline`, `dropPeer`, eventos `peer.open`/`peer.closed`), `store.relationships`, `presenceOf`, `loadRelationships`, `writeClipboardText`, `fingerprintOf`, `decodePairPayload`.
- Estados de UI: loading/vazio das listas, erros inline, avisos e notices do pareamento, cancelamento de convite com `needsReload`.

### Fora de escopo

- Qualquer alteração em `PairingPanel.vue`, `FriendsPanel.vue`, `stores.js`, `services/p2p/*`, `providers/*` ou no branch `friends` de `HomeView.vue`.
- Medição de latência real (RTT) — não existe fonte de dados hoje; o mock "LATENCY: 24MS" é substituído (ver Decisões).
- Rich presence ("Ouvindo Spotify", "Em reunião") — o modelo só tem `online/idle/dnd/offline`.
- Diretório/busca de usuários por nome — em modo `p2p` puro não existe; "nome de usuário" no placeholder é herança do mock (ver Decisões).
- Novas dependências, novos endpoints, alterações de protocolo, IPC ou backend.
- Commit/push.

## 3. Requisitos

### Funcionais

- **RF-01** Header "Conexões" com quatro abas (`Todos`, `Pendentes`, `Enviadas`, `Bloqueados`) que filtram `store.relationships` por `type`: `friend`, `incoming`, `outgoing`, `blocked` respectivamente. Aba ativa com o indicador sublinhado do mock.
- **RF-02** Cartão "Rede P2P" com ícone, título, subtítulo "Crie conexões diretas ou entre em salas privadas." e botão "Criar convite" que dispara `flow.createInvite()`.
- **RF-03** Campo único com placeholder "Adicionar por nome de usuário ou colar convite…" + botão "Adicionar". Heurística do conteúdo:
  - `prosa://pair/...` (decodificável por `decodePairPayload`) → `flow.continueWithLink(input)`;
  - chave pública hex válida (64 chars hex) → `contacts.request(pubkey)`;
  - demais entradas → erro inline orientando o formato aceito, sem chamar serviço.
- **RF-04** Fluxo de pareamento completo preservado dentro do cartão: título de fase e instrução (`phase`/`instruction`), botão copiar convite/resposta, "Ver link" expansível, área para colar a resposta (`remoteLink` + "Continuar") visível nos steps `idle`/`awaiting-response`, notices/warnings/errors, fingerprint do peer conectado, "Solicitar amizade novamente" quando `relationship === 'removed'`, aviso de handshake legado e "Recomeçar pareamento". Equivale ao conjunto atual de `PairingPanel.vue` steps, reapresentado no novo visual.
- **RF-05** Seção "Detalhes da conexão" expansível no cartão: minha chave pública + copiar, fingerprint, peers conhecidos com estado online/offline e ação "Desconectar" (`p2pTransport.dropPeer`), e "Adicionar contato" por chave pública (`contacts.requestContact` via provider — mesmo comportamento de `addContact` hoje).
- **RF-06** Seção "AMIGOS DISPONÍVEIS — N" com N = número de amigos (`type === 'friend'`) com `presenceOf !== 'offline'`. Cards com avatar (iniciais ou `avatarUrl`), dot de presença, `displayName` e label de presença (`Disponível/Ausente/Ocupado/Desconectado`).
- **RF-07** Nas abas `Pendentes`, `Enviadas` e `Bloqueados`, os cards exibem as ações atuais: Aceitar/Recusar (`contacts.accept`/`contacts.remove`), Cancelar convite (via `createInvitationCancellation`, incluindo estados `pendingIds`, `needsReload`, anúncio acessível e foco) e Desbloquear (`contacts.unblock`).
- **RF-08** Barra inferior fixa: `● REDE P2P ATIVA` quando `store.wsConnected`, contagem de peers online (`p2pTransport.peerIds().length`) e `VERSÃO <versão real>` lida de `web/package.json` (hoje `0.2.0`). Sem indicador de latência.
- **RF-09** Clique no card de amigo na aba `Todos` abre a DM (`dms.open` + `openChannel` + volta à view home), replicando `openFriendDm` — comportamento de navegação, não altera o existente.
- **RF-10** Nenhum arquivo/componente/serviço existente é modificado além do mínimo aditivo em `HomeView.vue` (novo branch `view === 'conexoes'`, import e item de navegação).

### Não funcionais

- **RNF-01** Reusar tokens de `style.css` (`--accent`, `--verde-mata`, `--amarelo-ipe`, `--acai-*`, `--fg`, `--fg-dim`, `--border`, `--bg-*`); suportar `[data-theme="light"]` sem regressão visual evidente.
- **RNF-02** Acessibilidade equivalente à atual: abas com `role="tablist"/"tab"`/`aria-selected`, `aria-live` nos notices/erros, `:focus-visible` visível, labels associados aos inputs.
- **RNF-03** Limpeza de listeners do transporte e do flow no `onUnmounted` (mesmo padrão de `PairingPanel.vue`: `subscriptions`, `flow.dispose()`, flag `unmounted`).
- **RNF-04** Responsivo: seguir o breakpoint de 700px já existente (`.friends-back` no mobile); a barra inferior não deve cobrir conteúdo (padding no container).
- **RNF-05** Nenhuma dependência nova.

## 4. Modos, plataformas e UI/UX

- Modo: apenas `p2p` (`MODE = 'p2p'`; o provider `server` não é instanciado hoje). A tela não precisa funcionar em modo `server`.
- Plataformas: web (Vite) e desktop (Electron) — o componente usa apenas APIs já usadas pelos painéis atuais; nenhuma IPC nova.
- UI/UX conforme mock: layout em coluna com largura máxima confortável, cartões escuros com borda sutil, dots de presença (verde/amarelo/cinza), tipografia Inter.

## 5. Contratos afetados

Não se aplica — nenhum contrato novo. A tela consome superfícies já existentes:

- Link de pareamento: `prosa://pair/<base64>` com `payload.t ∈ {offer, answer}` via `decodePairPayload` (`web/src/services/p2p/pairing.js`).
- `contacts.request(pubkey)` no provider P2P recebe **pubkey hex**, não username (`providers/p2p.js:112`).
- Eventos de transporte assinados: `peer.open`, `peer.closed`.
- Eventos P2P do store que já disparam `loadRelationships` (`contacts.changed`) — nenhum dispatch novo.

## 6. Estado, persistência e migrações

Não se aplica — nenhum estado novo persistido; a tela lê `store.relationships`, `store.presences` e estado transitório do `createPairingFlow`.

## 7. Autenticação, autorização, validação e privacidade

- Nenhuma operação privilegiada nova; todas as ações passam pelos serviços existentes que já fazem validação/verificação (assinatura, deduplicação).
- Validação de entrada no campo único: regex de pubkey hex de 64 caracteres antes de `contacts.request`; link validado por `decodePairPayload` (erros exibidos inline, como hoje).
- Privacidade: chave pública e fingerprint são exibidos (comportamento atual); **nunca** a chave privada. Links de pareamento contêm SDP — não logar, não enviar a telemetria; `diag.js` não é alterado.

## 8. Falhas e recuperação

- Erros do pareamento (link inválido, resposta sem convite correspondente, handshake falho) exibidos inline com "Recomeçar pareamento" — mesma semântica do flow atual.
- `copyError` abre o "Ver link" expandido para cópia manual — preservado.
- Cancelamento de convite pode terminar em `needsReload` → botão "Atualizar lista" + gerenciamento de foco, como em `FriendsPanel.vue`.
- Offline/reconexão: `store.presences` atualiza via `peer.open/peer.closed`; nenhuma lógica de retry nova.

## 9. Critérios de aceite

- **CA-01** (RF-10) `git diff` não toca `PairingPanel.vue`, `FriendsPanel.vue`, `stores.js` nem `services/`; em `HomeView.vue` o branch `friends` permanece byte a byte idêntico.
- **CA-02** (RF-01, RF-06) As quatro abas filtram corretamente e a contagem "AMIGOS DISPONÍVEIS" reflete amigos online.
- **CA-03** (RF-02, RF-04) "Criar convite" produz link copiável e o fluxo aceita resposta colada até `connected` — verificável com dois perfis ou via teste do flow existente (cobertura já em `p2p-pairing-flow.test.js`).
- **CA-04** (RF-03) Colar `prosa://pair/...` aciona `continueWithLink`; pubkey hex chama `contacts.request`; texto inválido mostra erro sem efeito.
- **CA-05** (RF-07) Aceitar/recusar/cancelar/desbloquear funcionam e refletem em `store.relationships` (reload via `RELATIONSHIP_UPDATE`/`contacts.changed`).
- **CA-06** (RF-08) Barra inferior mostra rede ativa, contagem de peers e versão `0.2.0`.
- **CA-07** (RNF-03) Sem listeners vazados: alternar entre views repetidamente não duplica contagens nem emite warnings.
- **CA-08** (RNF-01, RNF-04) Visual conforme mock em tema escuro; sem quebra em tema claro; layout utilizável ≤700px.
- **CA-09** Build `npm run build` e `npm --prefix web test` passam.

## 10. Estratégia de testes

- Automatizados: suites existentes (`npm --prefix web test`, `npm test`) devem seguir verdes — regressão zero é o critério, dado que nenhum serviço muda. Considerar teste unitário novo apenas para a heurística do campo único se ela for extraída em função pura.
- Manual (roteiro): abrir a nova tela; criar convite e copiar; colar convite inválido (erro); alternar abas com relacionamentos existentes; cancelar convite enviado; conferir barra de status; alternar para a tela antiga (Amigos) e confirmar funcionamento idêntico.

## 11. Riscos

- Campo único mistura dois fluxos (convite vs. contato): mitigado pela heurística `prosa://pair/` + regex hex e erros claros.
- `createPairingFlow` só permite uma tentativa por janela; o cartão deve exibir o estado corrente em vez de escondê-lo atrás de um único botão.
- Divergências mock × dados reais (latência, rich presence, versão) resolvidas pelos defaults das Decisões; se o usuário preferir os textos literais do mock, revisar antes da aprovação.

## 12. Decisões em aberto (defaults propostos)

1. **Entrada de navegação**: estado `view === 'conexoes'` + item "Conexões" na sidebar (categoria Amigos). Alternativa: rota `/conexoes` standalone fora do shell — descartada por perder rail/sidebar/userbar.
2. **Latência**: omitir "LATENCY"; mostrar contagem de peers online no lugar. Implementar RTT real exigiria mudar `transport.js` — fora de escopo.
3. **Versão**: usar `package.json` real (`0.2.0`), não "2.4.0".
4. **Rich presence**: omitir "Ouvindo Spotify"/"Em reunião"; exibir apenas o label de presença existente.
5. **Placeholder do campo único**: manter o texto do mock ("nome de usuário ou colar convite") **ou** ajustar para refletir a realidade P2P ("chave pública ou convite")? Default: texto do mock, com erro explicativo quando a entrada não for convite nem pubkey.
6. **Clique no card de amigo**: abre a DM. Alternativa: cartão inerte.

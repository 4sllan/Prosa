# Aside consistente, lista de amigos e menu de contexto

- Status: aprovada
- Data: 2026-10-17
- Aprovacao: "continuar" em 2026-10-17, apos apresentacao da spec com as
  decisoes ja registradas; autoriza a criacao das tasks, nao a execucao.
- Origem: pedido do usuario para ajustar o aside e o gerenciamento de amigos
  na rede P2P, com fluxo SDD conforme `.devin/sdd.md`.
- Decisoes registradas na analise (Fase 1), respondidas pelo usuario:
  1. O novo amigo e listado sob a secao "Amigos" do aside, reativo via
     `store.relationships`; nao ha criacao automatica de espaco DM ao aceitar.
  2. Clique esquerdo no amigo abre a DM; o menu de contexto (botao direito)
     contem apenas "Bloquear" e "Remover amigo".
  3. A remocao dos botoes e o menu de contexto valem para os dois modos
     (`server` e `p2p`), pois `FriendsPanel` e o aside sao compartilhados.

## 1. Objetivo e contexto

Unificar a barra lateral (aside) entre a tela "Conversas" (`view === 'home'`)
e a tela de amigos/rede P2P (`view === 'friends'`), exibir os amigos no
aside e substituir os botoes visiveis "Mensagem", "Bloquear" e "Remover" da
secao Amigos do `FriendsPanel` por um menu de contexto aberto com o botao
direito.

Hoje, em `view === 'friends'`, o `.side-body` do aside nao renderiza conteudo
algum e o `.side-head` fica sem titulo (`HomeView.vue`, template condicionado
a `view === 'home'` ou `store.currentCommunity`). O aside nao lista amigos:
exibe apenas o item de navegacao "Amigos" e as DMs em "Mensagens diretas".
O `FriendsPanel` mostra tres botoes por amigo e nao existe componente de
menu de contexto no projeto (o unico `@contextmenu`, em `memberMenu`, usa
`prompt()` nativo).

Referencias existentes:

- `web/src/views/HomeView.vue` (aside, views, navegacao)
- `web/src/components/FriendsPanel.vue` (secoes Recebidas/Enviadas/Amigos/Bloqueados)
- `web/src/stores.js` (`store.relationships`, `store.dms`, `loadRelationships`, `loadDms`, `openChannel`, `presenceOf`)
- `web/src/services/providers/p2p.js` e `providers/server.js` (contrato `contacts`)
- `web/src/services/p2p/contacts.js` (estados e controles P2P)
- `web/src/style.css` (identidade visual e variaveis de tema)
- `docs/specs/friend-invitation-flow.md` (spec relacionada de convites)

## 2. Escopo

Inclui:

- Renderizacao identica do aside nas views `home` e `friends`.
- Lista de amigos no aside, sob a secao "Amigos".
- Abertura de DM ao clicar em um amigo (no aside e no `FriendsPanel`).
- Remocao dos botoes "Mensagem", "Bloquear" e "Remover" da secao Amigos do
  `FriendsPanel`, substituidos por menu de contexto com "Bloquear" e
  "Remover amigo".
- Componente de menu de contexto reutilizavel, aplicado tambem aos itens de
  amigo do aside (mesmas acoes), para consistencia.
- Helper puro de posicionamento do menu (clamping no viewport) com teste
  unitario, seguindo o padrao de testes de services do projeto.
- Validacao: suite web, build, `git diff --check` e roteiro manual.

Fora de escopo:

- Alteracoes em providers, contratos de API/WS, protocolo P2P, envelope,
  transporte, IPC ou backend.
- Criacao automatica de espaco DM ao aceitar amizade (a DM e criada sob
  demanda ao abrir a conversa, como ja ocorre hoje).
- Mudancas nas secoes Recebidas, Enviadas e Bloqueados, no fluxo de
  pareamento, no `memberMenu` de comunidades nem em outras views.
- Novos itens no menu de contexto alem de "Bloquear" e "Remover amigo".
- Internacionalizacao, temas novos ou reformulacao visual global.

## 3. Modos, plataformas e semantica

| Comportamento | Server | P2P |
| --- | --- | --- |
| Aside identico em `home` e `friends` | Sim | Sim |
| Lista de amigos no aside | Sim | Sim |
| Menu de contexto no amigo | Sim | Sim |
| Bloquear | `contacts.block` (backend) | `blockContact` (local) |
| Remover amigo | `contacts.remove` (backend + WS) | `removeContact` (tombstone + `contact_remove`) |

- A semantica de cada acao permanece a ja implementada pelos providers:
  bloqueio P2P e local e nao se transmite; remocao P2P envia
  `contact_remove` ao peer quando online, sem garantia de entrega offline
  (limitacao ja documentada em `friend-invitation-flow.md`, CA-08).
- Plataformas: Electron (alvo principal) e navegador de desenvolvimento.
  O menu usa apenas renderer/DOM, sem IPC nem API nativa.
- Em `view === 'admin'` ou `view === 'community'` o comportamento atual do
  aside nao muda.

## 4. Requisitos

### Funcionais

- **RF-01:** O aside deve renderizar estrutura e aparencia identicas nas
  views `home` e `friends`: cabecalho "Conversas" com o botao "Novo grupo",
  secao "Amigos" com o item de navegacao, lista de amigos, secao
  "Mensagens diretas" com as DMs, `VoiceBar` e barra de usuario. O item
  "Amigos" permanece destacado (`.active`) enquanto `view === 'friends'`.
- **RF-02:** O aside deve listar cada relacionamento `type === 'friend'`
  sob a secao "Amigos", abaixo do item de navegacao, exibindo avatar com
  iniciais (ou imagem), indicador de presenca e `displayName`. A lista deve
  refletir `store.relationships` sem recarregar a pagina: aceites locais e
  remotos adicionam o amigo; bloqueios e remocoes o retiram.
- **RF-03:** Clicar em um amigo no aside deve abrir (ou criar, sob demanda)
  a DM correspondente via `dms.open` + `loadDms` + `openChannel` e exibir a
  conversa, reutilizando o fluxo atual do botao "Mensagem".
- **RF-04:** Na secao Amigos do `FriendsPanel`, remover os botoes
  "Mensagem", "Bloquear" e "Remover". O item deve abrir a DM com clique
  esquerdo (emitindo `open-dm` como hoje) e abrir o menu de contexto com
  o botao direito (`@contextmenu.prevent`).
- **RF-05:** O menu de contexto deve conter exatamente duas opcoes:
  "Bloquear" e "Remover amigo". Deve abrir na posicao do cursor, permanecer
  dentro do viewport (clamping) e fechar ao escolher uma opcao, pressionar
  Esc, clicar fora, rolar ou redimensionar a janela.
- **RF-06:** "Bloquear" deve chamar `contacts.block(userId)` e
  "Remover amigo" deve chamar `contacts.remove(userId)`, ambos seguidos de
  `loadRelationships()`. Falhas devem ser exibidas na area de erro do
  `FriendsPanel` (modo painel) sem fechar o menu de forma silenciosa.
- **RF-07:** O mesmo menu de contexto deve ser oferecido nos itens de amigo
  do aside, com as mesmas duas acoes e a mesma sincronizacao de estado.
- **RF-08:** Aceitar um convite em "Recebidas" (modo P2P ou servidor) deve
  fazer o novo amigo aparecer na lista do aside imediatamente, sem reload
  nem acao adicional, valendo-se da atualizacao reativa ja existente de
  `store.relationships` (`loadRelationships` local e eventos
  `RELATIONSHIP_UPDATE`/`contacts.changed` remotos).

### Nao funcionais

- **RNF-01:** Preservar a identidade visual: variaveis de tema
  (`--bg-side`, `--bg-main`, `--fg`, `--fg-dim`, `--border`, `--accent`,
  `--danger`), fonte, raios e sombras existentes; funcionar nos temas
  escuro e claro.
- **RNF-02:** Acessibilidade: menu com `role="menu"`/`role="menuitem"`,
  fechamento por Esc, foco visivel e itens acionaveis por teclado; itens
  destrutivos distinguiveis (ex.: "Remover amigo" em `--danger`).
- **RNF-03:** Nenhuma dependencia nova, nenhum IPC novo, nenhum contrato de
  backend/WS/protocolo alterado, nenhum listener acumulado por abertura de
  menu (limpar no fechamento/desmontagem).
- **RNF-04:** Preservar o comportamento responsivo existente (o aside ja e
  ocultado em viewport estreita quando `.chat-open` esta ativo).

## 5. Contratos afetados

Nao ha contratos novos nem alterados. Reutilizam-se:

- `contacts.block(userId)` e `contacts.remove(userId)` — mesma superficie
  dos dois providers, sem novos metodos, erros, endpoints ou eventos.
- `dms.open(userId)`, `loadDms()` e `openChannel(id)` — fluxo ja usado por
  `FriendsPanel.openDm`.
- `RELATIONSHIP_UPDATE` (WS, server) e `contacts.changed` (controle P2P)
  para refletir mudancas remotas; nenhum evento novo.

## 6. Estado, persistencia e integridade

Sem migracao nem mudanca de persistencia. `store.relationships` e
`store.dms` continuam a unica fonte da UI; os providers mantem seus
mecanismos atuais (SQLite no servidor; store local/tombstones no P2P).
O menu de contexto e estado efemero de UI (posicao e alvo), nao persistido.

## 7. Seguranca, privacidade e limites

Nao se aplica a novas superficies: nenhum dado adicional trafega, nenhuma
chave e exposta e nenhuma validacao de autorizacao e movida para a UI —
`contacts.*` mantem as verificacoes ja existentes em cada provider.
Privacidade preservada: bloqueio P2P continua local e nao notifica o peer.

## 8. Falhas e recuperacao

- Erro em `contacts.block`/`contacts.remove`: exibir mensagem na area de
  erro do `FriendsPanel`; a lista nao e alterada otimisticamente — so muda
  apos `loadRelationships()` bem-sucedido.
- Falha de entrega do `contact_remove` P2P offline: limitacao ja conhecida
  e documentada (fila de controle volatil); a UI nao afirma entrega remota.
- Amigo removido/bloqueado enquanto o menu esta aberto: o menu fecha ao
  executar qualquer acao; se a lista mudar por evento remoto, o item some
  naturalmente com a rerenderizacao.
- Clique fora, Esc, scroll e resize fecham o menu sem efeito colateral.
- Abrir DM com o peer offline (P2P) permanece permitido: o espaco e local
  e sincroniza ao reconectar, como hoje.

## 9. Criterios de aceite

| ID | Verificacao | Requisitos |
| --- | --- | --- |
| CA-01 | Nas views "Conversas" e "Amigos/Rede P2P", o aside exibe a mesma estrutura e aparencia (cabecalho, secoes, DMs, userbar) | RF-01 |
| CA-02 | Ao aceitar em "Recebidas", o amigo aparece na secao "Amigos" do aside sem reload; o mesmo vale para aceite remoto | RF-02, RF-08 |
| CA-03 | Botao direito sobre um amigo (painel e aside) abre menu com "Bloquear" e "Remover amigo" no cursor, dentro do viewport; Esc, clique fora, scroll e resize fecham | RF-04, RF-05, RF-07, RNF-02 |
| CA-04 | "Bloquear" move o contato para "Bloqueados" e o remove do aside e da lista; "Remover amigo" o retira de ambos sem recarregar | RF-06, RF-02 |
| CA-05 | Clique esquerdo em um amigo (painel e aside) abre/exibe a DM correspondente | RF-03, RF-04 |
| CA-06 | O comportamento e identico nos modos `server` e `p2p`, com as acoes corretas de cada provider | RF-04–RF-08 |
| CA-07 | `npm --prefix web test` e `npm run build` passam; `git diff --check` limpo; helper de posicionamento coberto por teste | RNF-03 |

## 10. Estrategia de validacao, riscos e decisoes

- Helper puro de clamping (ex.: posicao do menu dado cursor, tamanho do
  menu e viewport) implementado como modulo testavel, com teste unitario
  em `web/test/` seguindo o padrao `node --test` existente.
- Regressao A→B: teste da sequencia pedido → recebida → aceite → amigo
  pela superficie do provider (`contacts.list()`), validando o contrato
  que o aside e o painel consomem, incluindo bloqueio e remocao nas duas
  pontas; store em memoria, sem dados reais.
- Demais comportamentos sao de componente Vue, fora do alcance da suite
  atual: validar por roteiro manual no Electron e, quando aplicavel, no
  navegador dev — incluindo abertura/fechamento do menu, clamping em
  bordas, Esc, clique fora, sync entre painel e aside, e modo servidor.
- Riscos: posicionamento proximo as bordas da janela; listeners globais
  (click/Esc/scroll/resize) precisam ser registrados so enquanto o menu
  estiver aberto e removidos ao fechar/desmontar; itens da lista mudam
  de identidade apos `loadRelationships`, entao o menu deve referenciar
  o `user.id`, nao o objeto da linha.
- Decisoes em aberto: nenhuma bloqueante. Pontos assumidos: manter o item
  de navegacao "Amigos" no topo da secao, acima da lista de amigos; ordem
  dos amigos conforme retornada pelo provider (sem reordenacao local).

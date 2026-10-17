# Tasks — Aside consistente, lista de amigos e menu de contexto

- Status geral: em execucao (T1-T5 concluidas/concluida
  manual; T6 concluida manual — instancias serao relancadas
  apos T7; T7 em andamento, revisao R2)
- Spec de referencia: `docs/specs/friends-aside-context-menu.md` (aprovada em 2026-10-17)
- Ordem de execucao: T1 -> T2 -> T3 -> T4 -> T5 (T3 nao depende de T1/T2,
  mas a ordem listada e a recomendada; cada task exige autorizacao
  especifica). T5 acrescentada a pedido do usuario em 2026-10-17.

## T1 - Componente de menu de contexto + helper de posicionamento

- Status: concluida
- Requisitos/aceite: RF-05, RNF-01, RNF-02, RNF-03, CA-03, CA-07
- Dependencias: nenhuma
- Escopo e arquivos provaveis:
  - `web/src/services/context-menu.js` (novo): funcao pura de clamping,
    ex.: `menuPosition({ x, y, width, height, viewportW, viewportH, margin })`
    retornando `{ x, y }` dentro do viewport.
  - `web/test/context-menu.test.js` (novo): casos de borda (canto inferior
    direito, margem, menu maior que o viewport).
  - `web/src/components/ContextMenu.vue` (novo): menu fixo na posicao dada,
    itens via prop (`label`, `danger`, `action`), fecha com Esc, clique
    fora, scroll e resize; `role="menu"`/`role="menuitem"`, foco inicial e
    estilo com as variaveis de tema; listeners globais so enquanto aberto.
- Implementacao: componente controlado pelo pai (props: `x`, `y`, `items`;
  emits: `close`, `select`). Estilos com `--bg-side`, `--border`, `--fg`,
  `--fg-dim`, `--danger`, raio 10px e sombra no padrao de `.modal`/
  `.search-results`. Clamp aplicado no `onMounted`/`watch` via helper.
- Testes e comandos de validacao: `node --test web/test/context-menu.test.js`;
  `npm --prefix web test` (regressao); `npm run build`.
- Criterio de conclusao: helper cobre os casos de borda; menu renderiza,
  posiciona dentro do viewport, fecha por todos os caminhos previstos e
  nao acumula listeners apos fechar.
- Evidencias: arquivos `web/src/services/context-menu.js`,
  `web/test/context-menu.test.js`, `web/src/components/ContextMenu.vue`.
  `node --test test/context-menu.test.js`: 5/5 passam (bordas, margem,
  menu maior que o viewport). `npm --prefix web test`: 217/217 passam.
  `npm run build`: ok. `git diff --check`: limpo. Listeners globais
  registrados em `onMounted` e removidos em `onBeforeUnmount` (o menu so
  existe enquanto aberto). Pendente: verificacao manual interativa do
  menu (abrir, Esc, clique fora, scroll, teclado), que so e exercitavel
  quando o componente for usado — coberta pelo roteiro manual de T2.

## T2 - FriendsPanel: remover botoes e ligar menu de contexto + clique abre DM

- Status: concluida
- Requisitos/aceite: RF-04, RF-05, RF-06, CA-03, CA-04, CA-05, CA-06
- Dependencias: T1
- Escopo e arquivos provaveis: `web/src/components/FriendsPanel.vue`.
- Implementacao: remover os botoes "Mensagem", "Bloquear" e "Remover" da
  secao Amigos; `@click` no item chama `openDm` existente;
  `@contextmenu.prevent` abre o `ContextMenu` com "Bloquear" e
  "Remover amigo" acionando `contacts.block`/`contacts.remove` +
  `loadRelationships`; erros vao para `err`/area de aviso existente;
  menu referencia `user.id`, nao o objeto da linha. Vale para os dois
  modos (componente compartilhado).
- Testes e comandos de validacao: `npm --prefix web test`; `npm run build`;
  `git diff --check`; roteiro manual: clique abre DM; botao direito abre
  menu; Bloquear move para "Bloqueados"; Remover tira da lista.
- Criterio de conclusao: nenhum botao visivel na secao Amigos; as duas
  acoes funcionam pelo menu em modo server e p2p; erros exibidos.
- Evidencias: `web/src/components/FriendsPanel.vue` — botoes Mensagem/
  Bloquear/Remover removidos; item de amigo com `role="button"`,
  `@click`/`@keydown.enter` abrindo DM via `openDm` existente;
  `@contextmenu.prevent` abre `ContextMenu` com "Bloquear" e
  "Remover amigo" (danger) chamando `contacts.block`/`contacts.remove` +
  `loadRelationships`; erros em `err`/`.auth-err`; menu referencia
  `user.id`. `npm --prefix web test`: 217/217; `npm run build`: ok;
  `git diff --check`: limpo. Pendente: roteiro manual interativo (abrir
  menu, Esc/clique fora/scroll/resize, Bloquear, Remover, abrir DM) nos
  dois modos — tambem quita a verificacao pendente de T1.

## T3 - Aside identico nas views "Conversas" e "Amigos/Rede P2P"

- Status: concluida
- Requisitos/aceite: RF-01, RNF-04, CA-01
- Dependencias: nenhuma
- Escopo e arquivos provaveis: `web/src/views/HomeView.vue`.
- Implementacao: tratar `view === 'friends'` como `home` no aside:
  cabecalho "Conversas" com o botao "Novo grupo", corpo com secoes
  "Amigos" (item de navegacao, `.active` em friends) e "Mensagens
  diretas". Nao alterar comportamento em `community`/`admin` nem o shell
  responsivo (`.chat-open`).
- Testes e comandos de validacao: `npm run build`; `git diff --check`;
  verificacao manual visual alternando entre as duas telas.
- Criterio de conclusao: aside com mesma estrutura e aparencia nas duas
  views, incluindo header e userbar; nada muda fora delas.
- Evidencias: `web/src/views/HomeView.vue` — computed `homeSidebar`
  (`home || friends`) aplicado ao titulo "Conversas", ao botao "Novo
  grupo", ao corpo do aside e ao estado ativo do botao Inicio na rail.
  O item "Amigos" ja mantinha `.active` em friends; comportamento de
  community/admin inalterado. `npm run build`: ok; `git diff --check`:
  limpo. Pendente: verificacao visual manual alternando entre as duas
  telas (criterio e exclusivamente visual).

## T4 - Lista de amigos no aside (abre DM + menu de contexto)

- Status: concluida
- Requisitos/aceite: RF-02, RF-03, RF-07, RF-08, CA-02, CA-03, CA-04, CA-05
- Dependencias: T1, T3
- Escopo e arquivos provaveis: `web/src/views/HomeView.vue`.
- Implementacao: abaixo do item de navegacao "Amigos", renderizar cada
  `friend` de `store.relationships` com avatar (iniciais/imagem), dot de
  presenca e `displayName`; clique abre DM via `dms.open` + `loadDms` +
  `openChannel`; `@contextmenu.prevent` abre o mesmo `ContextMenu` com
  "Bloquear" e "Remover amigo" (+`loadRelationships`). Sem reordenacao
  local (ordem do provider).
- Testes e comandos de validacao: `npm --prefix web test`; `npm run build`;
  `git diff --check`; roteiro manual: aceitar em "Recebidas" faz o amigo
  surgir no aside sem reload; bloquear/remover pelo aside atualiza painel
  e aside; clique abre a conversa.
- Criterio de conclusao: amigo aceito aparece no aside sem recarregar;
  acoes do menu sincronizam aside e painel nos dois modos.
- Evidencias: `web/src/views/HomeView.vue` — lista de `friends`
  (`store.relationships`, type `friend`, ordem do provider) sob a secao
  "Amigos", dentro do template `homeSidebar` (visivel nas duas views);
  item `.dm-item` com avatar (img/iniciais), dot de presenca e
  displayName; `openFriendDm` reutiliza `dms.open` + `loadDms` +
  `openChannel`; `friendMenu`/`onFriendMenuSelect` abrem o mesmo
  `ContextMenu` com "Bloquear"/"Remover amigo" chamando
  `contacts.block`/`contacts.remove` + `loadRelationships`; erros via
  `alert`, padrao ja usado no HomeView. Reatividade garantida pelo
  computed sobre `store.relationships` (aceite local via `reload` e
  remoto via `contacts.changed`/`RELATIONSHIP_UPDATE`). `npm --prefix
  web test`: 217/217; `npm run build`: ok; `git diff --check`: limpo.
  Pendente: roteiro manual (aceitar convite e ver o amigo surgir no
  aside; bloquear/remover pelo aside refletindo no painel; abrir DM).

## T5 - Regressao A->B: fluxo de amizade alimenta a lista consumida pelo aside

- Status: concluida
- Requisitos/aceite: RF-02, RF-06, RF-08, CA-02, CA-04, CA-06
- Dependencias: T2, T4 (valida o contrato do provider que elas consomem)
- Escopo e arquivos provaveis: `web/test/friends-sync.test.js` (novo),
  reutilizando o harness de `p2p-contacts.test.js`: localstore em
  memoria, transporte reconfigurado, envelopes capturados e `handle*`
  simulando a outra ponta. Sem alteracao em codigo de producao.
- Implementacao: A envia pedido (`contacts.request`/`contact_req`
  capturado); B recebe `incoming` em `provider.contacts.list()` — o que
  "Recebidas" e `store.relationships` exibem; B aceita via
  `provider.contacts.accept`; o `contact_accept` entregue em A promove
  `outgoing` → `friend`; ambos os lados listam `type === 'friend'`, o
  contrato que o aside renderiza. Acoes do menu: `contacts.block` expoe
  `blocked` e some da lista de amigos; `contacts.remove` envia
  `contact_remove` e, na outra ponta, `handleContactRemove` resulta em
  `removed` oculto — sem duplicacao nem ressurreicao de estados.
- Testes e comandos de validacao: `node --test
  web/test/friends-sync.test.js`; `npm --prefix web test` (regressao);
  `git diff --check`.
- Criterio de conclusao: a sequencia A→B demonstra, pela superficie do
  provider, que o aceite alimenta a lista de amigos consumida pelo aside
  e que bloqueio/remocao a esvaziam nas duas pontas; store de memoria,
  sem dados reais.
- Evidencias: `web/test/friends-sync.test.js` (novo, 3 testes):
  pedido→recebida→aceite→`friend` nas duas pontas via
  `provider.contacts.list()`; `blockContact` expoe `blocked` so no lado
  local e `unblock` nao restaura amizade; `removeContact` propaga
  `contact_remove`, esvazia as duas pontas e aceite atrasado nao
  ressuscita `removed`. O aceite usa `contacts.acceptContact`
  diretamente — `provider.contacts.accept` delega a ele, mas exigiria
  `getP2PNode()` inicializado (padrao ja adotado em
  `p2p-contacts.test.js`). `node --test test/friends-sync.test.js`: 3/3;
  `npm --prefix web test`: 220/220; `git diff --check`: limpo.

## T6 - Build do app e roteiro manual A<->B (validado pelo usuario)

- Status: em andamento
- Requisitos/aceite: CA-01, CA-02, CA-03, CA-04, CA-05, CA-06, RNF-02, RNF-04
- Dependencias: T1, T2, T3, T4 (valida manualmente o que elas implementam)
- Escopo e arquivos provaveis: `npm run build` (gera `web/dist`);
  execucao de duas instancias Electron com `--user-data-dir` distintos
  (identidade Ed25519 e store isolados por instancia, vide
  `web/desktop/main.cjs` + `identity.cjs`); nenhum arquivo alterado.
- Implementacao: o agente gera o build e sobe as duas instancias; o
  usuario executa o roteiro manual entre A e B e reporta o resultado.
- Roteiro manual (checklist a registrar como evidencia):
  1. Ambas as instancias em modo `p2p`; aside identico entre "Conversas"
     e a tela de amigos/Rede P2P (CA-01).
  2. A cria convite → B cola e continua → B copia resposta → A cola e
     continua → peer conectado; A ve "Enviadas", B ve "Recebidas";
     B aceita → amigo aparece na secao Amigos do aside dos dois lados,
     sem reload (CA-02, RF-08).
  3. Botao direito sobre o amigo (no painel e no aside): menu com
     "Bloquear" e "Remover amigo" no cursor, dentro do viewport; Esc,
     clique fora, scroll e resize fecham (CA-03).
  4. B bloqueia A: A some da lista de amigos e do aside em B e aparece
     em "Bloqueados"; desbloquear nao restaura a amizade (CA-04).
  5. A remove B ("Remover amigo"): some dos dois lados; aceite tardio
     nao ressuscita (CA-04).
  6. Clique esquerdo no amigo (painel e aside) abre a DM; troca de
     mensagens A↔B funciona (CA-05).
  7. Repetir o essencial no modo `server` com duas contas (CA-06).
- Testes e comandos de validacao: `npm run build`; instancias via
  `npx electron . --user-data-dir=/tmp/prosa-a` e `.../prosa-b`
  (carregam `dist/`); evidencias = resultado reportado pelo usuario.
- Criterio de conclusao: checklist percorrido pelo usuario sem falhas;
  itens nao verificaveis ou reprovados ficam registrados como pendencia.
- Evidencias: `npm run build` ok. Duas instancias lancadas com
  `env -u ELECTRON_RUN_AS_NODE npx electron . --user-data-dir=/tmp/prosa-a`
  e `/tmp/prosa-b` (a var `ELECTRON_RUN_AS_NODE=1` herdada do ambiente
  fazia o Electron rodar como Node puro — contornada com `env -u`).
  Cada instancia criou `p2p/identity.key` + `local.json` proprios;
  backend `journal`. Log mostra TURN `free.expressturn.com` sem
  resolucao DNS — irrelevante para A↔B em localhost (candidatos host).
  Aguardando o usuario percorrer o roteiro e reportar.

## T7 - R2: remover secao "Amigos" do painel e "Mensagens diretas" do aside

- Status: em andamento
- Requisitos/aceite: RF-01, RF-03, RF-04, RF-05, RF-07, RF-09, CA-01, CA-03, CA-05
- Dependencias: T2, T4 (ajusta o que implementaram)
- Escopo e arquivos provaveis: `web/src/components/FriendsPanel.vue`
  (remove secao Amigos, menu do painel, openDm/emit e handlers orfaos,
  mantendo Adicionar/Recebidas/Enviadas/Bloqueados);
  `web/src/views/HomeView.vue` (remove secao "Mensagens diretas" e
  listener `@open-dm` orfao).
- Implementacao: painel deixa de listar amigos — gerenciamento do vinculo
  passa a existir apenas via menu de contexto do aside; aside sem a
  secao de DMs, conversas acessiveis clicando nos amigos.
- Testes e comandos de validacao: `npm --prefix web test`; `npm run
  build`; `git diff --check`; rebuild + relancamento das instancias A/B
  para a validacao manual de T6.
- Criterio de conclusao: painel sem a secao "Amigos"; aside sem
  "Mensagens diretas"; clique no amigo abre a conversa; build e suite
  verdes.
- Evidencias: `FriendsPanel.vue` — secao "Amigos" removida junto com
  ContextMenu/menu/openDm/emit e funcoes block/remove orfas; mantidas
  Adicionar, Recebidas, Enviadas, Bloqueados. `HomeView.vue` — secao
  "Mensagens diretas" removida do aside (header + itens); `openDm` e
  `onDmOpened`/`@open-dm` orfaos removidos; `openFriendDm` agora tambem
  sai da view 'friends' para exibir o chat. `npm --prefix web test`:
  220/220; `npm run build`: ok; `git diff --check`: limpo. Instancias
  A/B relancadas com o novo build (mesmos `--user-data-dir`,
  identidades preservadas). Aguardando validacao manual de T6.

## T8 - R3: desbloquear restaura a amizade (volta a secao Amigos do aside)

- Status: concluida
- Requisitos/aceite: RF-10, CA-08
- Dependencias: T7 (apos a R2, "Bloqueados" e o aside sao as superficies)
- Escopo e arquivos provaveis: `web/src/services/p2p/contacts.js`
  (`unblockContact` grava `friend` em vez de `removed`);
  `server/src/routes/users.js` (`DELETE .../block` restaura `accepted` +
  `RELATIONSHIP_UPDATE` ao outro lado); `web/test/friends-sync.test.js`
  (ajusta expectativa); `server/test/api.test.js` (cobre block→unblock).
- Implementacao: conforme RF-10 — restauracao direta de `friend`/
  `accepted` e notificacao do outro lado no modo server.
- Testes e comandos de validacao: `node --test
  web/test/friends-sync.test.js`; `npm --prefix web test`; `npm test`
  (suite do servidor); `npm run build`; `git diff --check`; rebuild +
  relancamento das instancias A/B mantendo os perfis para o usuario
  validar o desbloquear.
- Criterio de conclusao: desbloquear tira de "Bloqueados" e devolve o
  amigo ao aside sem reload nos dois modos; suites verdes.
- Evidencias: friends-sync 3/3; web 220/220; server 14/14 (novo
  teste block/unblock); build ok; diff-check limpo. Instancias A/B
  relancadas com perfis preservados — validacao manual do desbloquear
  pendente.

## Validacao manual final

Roteiro A/B executado pelo usuario nas instancias Electron com perfis
zerados e build limpo (cache `web/dist` + `.vite` removidos):
pareamento -> aceite -> amigo no aside -> bloquear -> desbloquear
(***retorno imediato a secao Amigos do aside***) -> abrir DM ->
mensagens A<->B. Resultado reportado: "funcionou".

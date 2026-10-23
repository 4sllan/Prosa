# Redesign da Home — rail, sidebar com RODAS e hero central

- Status: aprovada (aprovação = "continuar" após entrega da spec;
  D-01/D-02/D-03 resolvidas pelas recomendações propostas)
- Data: 2026-10-17
- Referência visual: mock do Figma (imagem anexada na conversa) — sidebar
  "Conversas" com AMIGOS + RODAS, userbar com mic, e card central
  "Prosa — sua roda de conversa." com tiles e CTA branco.

## 1. Objetivo e contexto

Reproduzir o novo visual da Home em `web/src/views/HomeView.vue`:

- **Rail** (faixa esquerda): logo + Início + criar (`+`) + entrar com
  convite (ícone de link). No mock não há círculos de comunidade.
- **Sidebar "Conversas"**: cabeçalho com ação de novo grupo; seção
  AMIGOS com a linha "Amigos" destacada (atalho para a view de amigos);
  nova seção **RODAS** listando os amigos (decisão do usuário:
  "nas rodas são os amigos") — cada item com avatar de iniciais, dot de
  presença e nome (o "302a30050603" do mock é um amigo com nome
  derivado de pubkey).
- **Userbar**: avatar + nome + status ("Disponível") + botão de **mic**
  (toggle de mudo) + engrenagem de configurações.
- **Miolo (estado vazio da Home)**: card central com logo, título
  "Prosa — sua roda de conversa.", subtítulo "Crie uma comunidade ou
  entre com um convite para começar a interagir.", dois tiles ("Rodas"
  e "Prosa ao vivo"), botão branco "Começar uma nova conversa" e, abaixo
  do card, os badges "CONEXÕES SEGURADAS" e "P2P ENCRYPT".

Mudança exclusivamente de apresentação: nenhum fluxo de dados novo —
RODAS reusa a lista de amigos (`store.relationships`, `type === 'friend'`)
que hoje já aparece na sidebar.

## 2. Escopo

### Dentro do escopo

- `web/src/views/HomeView.vue`:
  - Rail: ordem/ícones conforme mock — logo, Início, `+` (criar
    comunidade), ícone de link (entrar com convite, substituindo `LogIn`
    por `Link2`).
  - Sidebar `homeSidebar`: seção AMIGOS apenas com a linha "Amigos";
    itens de amigo passam para a nova seção "Rodas" (`cat-name` RODAS),
    mantendo clique (`openFriendDm`), context menu e dot de presença.
  - Userbar: novo botão de mic (ver RF-02).
  - Estado vazio do `<main>`: substituir o `.empty` simples pelo hero do
    mock (card + tiles + CTA + badges).
  - Imports de ícones `lucide-vue-next` novos: `Mic`, `MicOff`, `Link2`,
    `Users` (tile Rodas), `RadioTower` ou equivalente (tile ao vivo),
    `ShieldCheck`/`Lock` (badges) — conforme melhor correspondência.
- `web/src/style.css`: classes novas — `.hero`, `.hero-card`, `.hero-tile`,
  `.hero-cta`, `.hero-badges` (nomes a definir na implementação), estado
  desabilitado do tile "Prosa ao vivo", e ajuste do CTA branco para o
  tema claro.

### Fora do escopo

- Nenhuma mudança em `stores.js`, providers, protocolo P2P, IPC/Electron,
  `rtc.js` (além do uso já existente de `toggleMute`) ou backend.
- "Prosa ao vivo" **não** ganha funcionalidade — tile inerte/"em breve".
- `FriendsPanel`, `PairingPanel` e demais componentes permanecem; o CTA
  apenas navega para a view `friends` existente.
- Nenhuma feature nova de comunidades/grupos; modais existentes são
  reutilizados.

## 3. Requisitos

### Funcionais

- **RF-01** — Na sidebar da Home, a seção AMIGOS contém somente a linha
  "Amigos" (atalho para `view = 'friends'`). A seção RODAS lista os
  amigos (`relationships` tipo `friend`) com avatar de iniciais, dot de
  presença (`presenceOf`) e `displayName`; clique abre/cria a DM
  (`openFriendDm`) e o context menu (bloquear/remover) continua
  funcionando.
- **RF-02** — A userbar inclui um botão de mic que alterna `rtc.muted`
  via `toggleMute()`; o ícone reflete o estado (`Mic`/`MicOff`). Fora de
  chamada de voz o toggle é seguro: não pode emitir `voice_state` com
  `channelId` nulo — guardar a chamada (no handler da userbar ou na
  própria `toggleMute`, mudança mínima).
- **RF-03** — O rail exibe: logo, Início, `+` (abre modal criar
  comunidade), ícone de link (abre modal entrar com convite). Ver
  decisão em aberto D-01 sobre os círculos de comunidade.
- **RF-04** — O miolo da Home (nenhum canal selecionado, view `home`)
  renderiza o card hero: logo, título "Prosa — sua roda de conversa.",
  subtítulo "Crie uma comunidade ou entre com um convite para começar a
  interagir.", tiles, CTA e badges "CONEXÕES SEGURADAS" / "P2P ENCRYPT".
- **RF-05** — O tile "Rodas" abre o modal existente de criar comunidade
  (`showCreate`). O tile "Prosa ao vivo" é inerte e sinaliza "em breve"
  (cursor/estilo desabilitado + `title`), sem disparar ação.
- **RF-06** — O CTA "Começar uma nova conversa" leva à tela de Amigos
  (`view = 'friends'`).
- **RF-07** — Os badges sob o card são texto estático com ícone
  ("Conexões seguras", "P2P encrypt"), sempre em caixa alta.

### Não funcionais

- **RNF-01** — Somente template/CSS; nenhum contrato de API, provider,
  evento P2P ou IPC é afetado. Como o app hoje roda só em P2P
  (`MODE = 'p2p'` em `provider.js`), a validação é no modo P2P; nada no
  markup pode presumir modo.
- **RNF-02** — Tema claro (`[data-theme="light"]`): o CTA branco e os
  tiles precisam de equivalente legível (usar variáveis ou variante
  escura no light), sem hardcode que quebre o contraste.
- **RNF-03** — Responsivo preservado: as regras `.shell.chat-open` e
  `@media ≤700px/≤900px` continuam válidas; o hero deve rolar/encolher
  sem overflow em telas estreitas.
- **RNF-04** — Acessibilidade básica: botões com `title`, ícones com
  `aria-hidden`, hierarquia de heading coerente, foco visível não
  removido.
- **RNF-05** — Convenções do projeto: classes globais em `style.css`,
  `scoped` só para ajustes pontuais, ícones via `lucide-vue-next` com
  `:size`, pt-BR nos textos.

## 4. Contratos afetados

Não se aplica — nenhum endpoint, payload, evento WS/P2P, provider ou
canal IPC é criado ou alterado. O mic reusa `rtc.muted`/`toggleMute` e
`events.updateVoice` existentes (guarda do RF-02 é detalhe interno).

## 5. Estado, persistência e migrações

Não se aplica — nenhum dado novo, nenhuma migração. `rtc.muted` é estado
em memória já existente; nada é persistido.

## 6. Autenticação, autorização, validação e privacidade

Não se aplica — nenhuma superfície nova de dados ou ação privilegiada.
O toggle de mic fora de voz não deve vazar estado nem emitir evento
(inválido) para peers (ver RF-02).

## 7. Falhas e recuperação

- Toggle de mic sem stream/voz ativa: no-op seguro, sem exceção.
- Tile "Prosa ao vivo": clicável visualmente, mas sem efeito — não pode
  abrir modal nem navegar.
- Lista RODAS vazia (sem amigos): seção aparece apenas com o cabeçalho,
  sem erro.

## 8. Critérios de aceite

- **CA-01** (RF-01) — Sidebar mostra AMIGOS → "Amigos" e RODAS → itens
  de amigos com dot de presença; clique num item abre a DM; context
  menu funciona.
- **CA-02** (RF-02) — Botão de mic na userbar alterna ícone e
  `rtc.muted` sem erro fora de voz; dentro de voz, propaga
  `updateVoice` como hoje.
- **CA-03** (RF-04, RF-07) — Miolo renderiza o hero do mock: logo,
  título, subtítulo, dois tiles, CTA branco e badges.
- **CA-04** (RF-05, RF-06) — "Rodas" abre o modal criar comunidade;
  "Prosa ao vivo" não dispara ação; "Começar uma nova conversa" abre a
  tela de Amigos.
- **CA-05** (RF-03) — Rail corresponde ao mock (logo + ações);
  comunidades continuam acessíveis conforme D-01.
- **CA-06** (RNF-01..05) — `npm run build` sem erros; tema claro
  legível; layout ≤700px sem quebra.
- **CA-07** — Estado sem amigos: RODAS exibe só o cabeçalho; hero
  continua centralizado.

## 9. Testes, riscos e decisões em aberto

### Estratégia de validação

- `npm run build` (compilação Vue/Vite) e `npm --prefix web test`
  (regressão P2P — nenhum teste novo de unidade previsto; mudança é de
  apresentação).
- Validação manual/headless do roteiro: boot → hero no miolo → sidebar
  com RODAS → cliques de CA-04 → mic com e sem voz → tema claro →
  janela estreita. Registrar o observado no plano de tasks (o projeto já
  usou Chrome headless + CDP para evidência desse tipo).

### Riscos

- Tile "Prosa ao vivo" inerte pode parecer quebrado — mitigado por
  sinalização "em breve" (RF-05).
- `toggleMute` com `rtc.channelId` nulo emitiria `voice_state` inválido
  — mitigado pela guarda do RF-02.
- Remover círculos de comunidade do rail tornaria comunidades
  inalcançáveis — ver D-01.
- CTA branco fixo quebraria o tema claro — mitigado por RNF-02.

### Decisões em aberto

Resolvidas na aprovação (sem resposta específica do usuário → aplicadas
as recomendações propostas):

- **D-01 — Círculos de comunidade no rail**: **manter** os círculos
  entre Início e `+`; removê-los deixaria as comunidades sem ponto de
  acesso (o mock provavelmente retrata um usuário sem comunidades).
- **D-02 — Tile "Rodas"**: abre o modal existente de criar comunidade
  (`showCreate`) — RF-05.
- **D-03 — Ícone do convite no rail**: `LogIn` → `Link2`, conforme mock.

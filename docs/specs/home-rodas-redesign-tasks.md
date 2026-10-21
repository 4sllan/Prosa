# Tasks — Redesign da Home (rail, sidebar com RODAS e hero)

- Status geral: em andamento (T5 adicionada após conclusão de T1–T4)
- Spec de referência: `docs/specs/home-rodas-redesign.md` (aprovada)
- Ordem de execução: T1 → T2 → T3 → T4 → T5

## T1 — Sidebar: seção RODAS com amigos + botão de mic na userbar

- Status: concluida
- Requisitos/aceite: RF-01, RF-02, CA-01, CA-02, CA-07
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - `web/src/views/HomeView.vue` — template da sidebar `homeSidebar` e da
    userbar; imports de ícones.
  - `web/src/rtc.js` — guarda de `events.updateVoice` em `toggleMute`.
- Implementação:
  - Em `homeSidebar`, manter a seção AMIGOS apenas com a linha "Amigos"
    (`.chan` → `view = 'friends'`). Inserir novo
    `<div class="cat-name">Rodas</div>` e mover para baixo dele o
    `v-for` de `friends` (`.dm-item` com avatar, dot de presença,
    `openFriendDm`, `friendMenu`) — sem mudar dados nem handlers.
  - Userbar: adicionar botão de mic antes do botão de configurações —
    `@click="toggleMute"`, `:title="rtc.muted ? 'Desmutar' : 'Mutar'"`,
    ícone `MicOff` quando `rtc.muted`, `Mic` caso contrário. Manter os
    botões atuais (presença, admin, settings) — o mock não mostra o de
    presença, mas removê-lo perde funcionalidade; mantê-lo é a mudança
    mínima.
  - `rtc.js`: em `toggleMute`, emitir `events.updateVoice` apenas quando
    `rtc.channelId` existir (`if (rtc.channelId) …`), evitando
    `voice_state` com channelId nulo fora de voz. Mesmo ajuste nas
    demais funções que emitem `updateVoice` somente se for trivial e
    seguro (caso contrário, limitar ao `toggleMute`).
  - Importar `Mic`, `MicOff` de `lucide-vue-next` (remover do import
    atual apenas o que deixar de ser usado, se houver).
- Testes e comandos de validação:
  - `npm run build` (compilação).
  - Manual/headless: sidebar exibe AMIGOS→"Amigos" e RODAS→amigos com
    dot; clique abre DM; mic alterna ícone sem erro fora de voz.
- Critério de conclusão: CA-01, CA-02, CA-07 observados; build ok.
- Evidências:
  - Arquivos alterados: `web/src/views/HomeView.vue` (cat-name "Rodas"
    inserido acima do `v-for` de amigos; botão de mic na `.userbar
    .acts` com `Mic`/`MicOff` e title mutar/desmutar; import de `Mic` e
    `toggleMute`), `web/src/rtc.js` (guarda `if (rtc.channelId)` antes
    de `events.updateVoice` em `toggleMute`).
  - `npm run build`: ok (vite build, 1786 módulos, sem erros).
  - `git diff --check`: limpo.
  - Observação em runtime (T4, headless CDP): cabeçalhos
    Amigos/Rodas renderizados; mic alterna "Mutar"/"Desmutar microfone"
    fora de voz sem erros de console (CA-02 fora de voz; CA-07
    observado — perfil sem amigos mostra só o cabeçalho). CA-01
    (clique abre DM / dot de presença no item) verificado por inspeção
    — markup/handler `openFriendDm` inalterados; confirmação manual
    pendente em perfil com contatos.

## T2 — Rail conforme o mock

- Status: concluida
- Requisitos/aceite: RF-03, CA-05
- Dependências: nenhuma (pode seguir T1 na mesma sessão do arquivo)
- Escopo e arquivos prováveis: `web/src/views/HomeView.vue` (nav `.rail`
  e imports).
- Implementação:
  - Trocar o ícone de entrar com convite de `LogIn` para `Link2`
    (title "Entrar com convite").
  - Ordem final: logo → Início → separador → círculos de comunidade →
    `+` (criar) → link (convite). Círculos mantidos (D-01).
  - Remover `LogIn` do import se não houver outro uso.
- Testes e comandos de validação: `npm run build`; inspeção visual do
  rail contra o mock; comunidade existente continua abrindo ao clicar
  no círculo.
- Critério de conclusão: CA-05 observado; build ok.
- Evidências:
  - Arquivos alterados: `web/src/views/HomeView.vue` (ícone `LogIn` →
    `Link2` no botão "Entrar com convite"; import ajustado). Ordem do
    rail já correspondia ao mock: logo → Início → separador → círculos
    de comunidade → `+` → convite; círculos mantidos (D-01).
  - `npm run build`: ok. `git diff --check`: limpo.
  - Observação em runtime (T4): rail renderiza "Início / Criar
    comunidade / Entrar com convite" (perfil sem comunidades — igual ao
    mock). CA-05 observado.

## T3 — Hero central do miolo + estilos

- Status: concluida
- Requisitos/aceite: RF-04, RF-05, RF-06, RF-07, RNF-02, RNF-03, RNF-04,
  CA-03, CA-04, CA-06
- Dependências: nenhuma funcional; recomenda-se após T1/T2 para um único
  diff coerente em `HomeView.vue`.
- Escopo e arquivos prováveis:
  - `web/src/views/HomeView.vue` — substituir o `<div v-else
    class="empty">` final pelo hero.
  - `web/src/style.css` — classes novas.
- Implementação:
  - Markup: container centralizado (`.hero`) com card (`.hero-card`):
    `<img>` do `logoUrl`, `<h2>` "Prosa — sua roda de conversa."
    (usar `store.appName` como hoje), `<p>` subtítulo "Crie uma
    comunidade ou entre com um convite para começar a interagir.";
    grade de dois tiles (`.hero-tile`): "Rodas" (ícone `Users`,
    `@click="showCreate = true"`) e "Prosa ao vivo" (ícone `RadioTower`,
    classe desabilitada, `title="Em breve"`, sem handler);
    `<button class="hero-cta" @click="view = 'friends'">Começar uma
    nova conversa</button>`; abaixo do card, `.hero-badges` com
    "Conexões seguras" (`Link2`) e "P2P encrypt" (`ShieldCheck`), em
    caixa alta via CSS.
  - CSS: card ~560px max, radius ~24px, borda sutil `var(--border)`,
    fundo `var(--bg-side)`; tiles com fundo `var(--bg-input)`, radius
    16px, ícone em círculo roxo; CTA branco (fundo `#fff`, texto
    `#17101F`, radius pill/12px, largura total do card) com variante
    escura sob `[data-theme="light"]`; badges pequenos, `var(--fg-dim)`,
    `text-transform: uppercase`, espaçamento de letra.
  - Responsivo: hero deve rolar/encolher sem overflow ≤700px; manter o
    comportamento `.shell.chat-open` existente.
  - Acessibilidade: tiles como `<button>` ou com `title`; tile inerte
    com `disabled`/`aria-disabled`.
- Testes e comandos de validação:
  - `npm run build`.
  - Manual/headless: hero renderiza como o mock; "Rodas" abre modal;
    "Prosa ao vivo" não dispara ação; CTA abre view de amigos; tema
    claro legível.
- Critério de conclusão: CA-03, CA-04, CA-06 observados; build ok.
- Evidências:
  - Arquivos alterados: `web/src/views/HomeView.vue` (bloco `.empty`
    final substituído por `.hero`/`.hero-card` com logo, título,
    subtítulo, tiles "Rodas"→`showCreate` e "Prosa ao vivo" `disabled`
    com `title="Em breve"`, `.hero-cta` → `view='friends'`,
    `.hero-badges` com Link2/ShieldCheck; import `Speech` removido e
    `Users`/`RadioTower`/`ShieldCheck` adicionados),
    `web/src/style.css` (bloco "Home hero": card 560px/radius 24,
    tiles, CTA branco pill, badges uppercase, variantes
    `[data-theme="light"]`).
  - `npm run build`: ok. `git diff --check`: limpo.
  - Observação em runtime (T4, headless CDP): hero renderiza título,
    subtítulo, 2 tiles, CTA e badges (CA-03); tile "Rodas" abre modal
    "Criar comunidade", "Prosa ao vivo" `disabled` não dispara ação,
    CTA abre a view de Amigos (CA-04); tema claro — CTA escuro
    `rgb(23,16,31)` com texto branco; 375px sem overflow e regra mobile
    `.main` oculta preservada (CA-06).

## T4 — Validação integrada da Home redesenhada

- Status: concluida
- Requisitos/aceite: CA-01..CA-07
- Dependências: T1, T2, T3
- Escopo: somente verificação — nenhum código novo (correções de
  regressão encontradas entram na task que as causou).
- Implementação (roteiro):
  - `npm run build`, `npm --prefix web test`, `git diff --check`.
  - Roteiro manual/headless (dev web, `npm run dev:web`): boot → hero no
    miolo → sidebar AMIGOS/RODAS → clique em amigo abre DM → "Rodas"
    abre modal criar → "Prosa ao vivo" inerte → CTA abre Amigos → mic
    alterna fora de voz (sem erro no console) → tema claro → janela
    ≤700px sem quebra.
  - Registrar o que foi efetivamente observado (CDP/headless aceitável,
    como em `remove-mode-picker-tasks.md` T3).
- Testes e comandos de validação: comandos acima + roteiro.
- Critério de conclusão: todos os CAs observados ou explicitamente
  marcados como pendentes de verificação manual.
- Evidências:
  - `npm --prefix web test`: **225/225 pass**, 0 fail (regressão P2P).
  - `npm run build`: ok. `git diff --check`: limpo.
  - Headless: Chrome `--headless=new` + CDP contra Vite dev
    (`localhost:5173`), perfil limpo `/tmp/prosa-cdp-t4`, scripts
    `/tmp/cdp-check*.mjs` via `Runtime.evaluate`:
    - Sidebar: `side-head` "Conversas"; `cat-name`s = ["Amigos",
      "Rodas"]; linha "Amigos" presente e fica `.active` na view de
      amigos. Perfil sem amigos → `dm-item`s = 0, sem erro (CA-07).
    - Hero: `.hero-title` "Prosa — sua roda de conversa.", subtítulo do
      mock, tiles [Rodas: habilitado / Prosa ao vivo: disabled +
      "Em breve"], CTA "Começar uma nova conversa", badges "Conexões
      seguras / P2P encrypt" (CA-03).
    - Cliques: "Rodas" → modal "Criar comunidade"; "Prosa ao vivo" →
      nenhum modal; CTA → view de Amigos renderiza (h2 "Amigos", input
      "Adicionar por nome…", PairingPanel); mic → title alterna
      Mutar→Desmutar, zero exceções (CA-02/CA-04).
    - Tema claro (`prosa_theme=light` + reload): `.hero-cta` bg
      `rgb(23,16,31)` texto branco — legível (CA-06).
    - 375px (`Emulation.setDeviceMetricsOverride`): sem overflow
      horizontal; regra mobile `.main` oculta preservada (CA-06).
    - Console: nenhuma exceção.
  - Pendentes de verificação manual: clique em item de RODAS abrindo DM
    e dot de presença em perfil com contatos (CA-01 — markup inalterado,
    verificado por inspeção); propagação de `updateVoice` dentro de voz
    (guarda `if (rtc.channelId)` preserva o caminho existente).

## T5 — Menu de contexto de amigo (RODAS) conforme mock

- Status: aguardando validação
- Requisitos/aceite: menu de contexto do item de RODAS conforme imagem
  anexada — painel escuro (~270px, radius ~14px), itens com label à
  esquerda e ícone à direita, divisor antes da zona de perigo; lista na
  ordem pedida pelo usuário:
  1. Marcar como lida
  2. Perfil
  3. Silenciar @<username> (nome dinâmico do contato)
  4. Pin
  5. Convidar para comunidade
  6. Desfazer conexão
  7. Bloquear contato (danger, vermelho, ícone à direita)
- Dependências: T1 (seção RODAS usa `friendMenu`)
- Escopo e arquivos prováveis:
  - `web/src/components/ContextMenu.vue` — suporte a `icon` e
    `{ divider: true }` nos items; estilo do mock.
  - `web/src/views/HomeView.vue` — `friendMenuItems` vira função do
    contato alvo (para interpolar o nome em "Silenciar @…");
    `onFriendMenuSelect` com os novos `value`s; imports de ícones.
- Implementação:
  - `ContextMenu.vue`: `v-for` com `<template>` suportando
    `item.divider` (`.ctx-sep`, `role="separator"`) e `item.icon`
    (`<component :is>` à direita, `justify-content: space-between`);
    estilo: min-width ~268px, padding 8px, radius 14px, fundo
    `var(--acai-700)`, sombra `0 16px 40px #0009`; danger `#F14A4A`
    com hover `#f14a4a1a`; manter `role="menu"/menuitem`, foco,
    Esc/backdrop e `menuPosition` existentes.
  - `friendMenuItems(user)`: valores `read`, `profile`, `mute`, `pin`,
    `invite`, `remove` ("Desfazer conexão" — mesma ação de hoje,
    `contacts.remove`), `block` ("Bloquear contato" — `contacts.block`)
    com `danger: true`; divisor antes de "Desfazer conexão".
  - `onFriendMenuSelect`: `read` → `services.messages.markRead` no
    canal da DM do contato (`store.dms.find(d => d.recipients[0]?.id
    === userId)?.id`; no P2P `markRead` é no-op — manter chamada);
    `remove`/`block` → `contacts.*` + `loadRelationships()` como hoje;
    `profile`, `mute`, `pin`, `invite` → sem efeito (features
    inexistentes) ou ocultos — decidir na execução; o mock mostra os
    itens, então preferência é renderizar e não disparar ação.
- Testes e comandos de validação:
  - `npm run build`, `git diff --check`.
  - Manual/headless: botão direito num item de RODAS (perfil com
    contato) → menu renderiza como o mock; "Desfazer conexão" e
    "Bloquear contato" executam e recarregam a lista; itens sem
    feature não lançam erro; Esc/backdrop/scroll fecham.
- Critério de conclusão: menu renderiza conforme o mock; `read`,
  `remove` e `block` funcionam (ou estão documentados quando P2P não
  suporta); demais itens presentes sem efeito.
- Evidências:
  - Arquivos alterados: `web/src/components/ContextMenu.vue` (items
    com `icon` à direita e `divider`; estilo do mock — min-width 268px,
    fundo `acai-700`, radius 14px, danger `#F14A4A` com hover
    `#f14a4a1a`; mantidos role=menu/menuitem, foco, Esc/backdrop e
    `menuPosition`), `web/src/views/HomeView.vue` (`friendMenuItems`
    virou computed do contato — "Silenciar @<username>" dinâmico;
    `onFriendMenuSelect` com `read` → `messages.markRead` da DM,
    `remove`/`block` → contacts + reload; `profile`/`mute`/`pin`/
    `invite` renderizam sem efeito; ícones CheckCheck/UserRound/
    BellOff/Pin/UserPlus/Link2Off/Ban).
  - `npm run build`: ok. `git diff --check`: limpo.
  - Pendente: observação visual do menu — exige perfil com contato em
    RODAS para abrir o context menu (headless com perfil limpo não
    cobre).

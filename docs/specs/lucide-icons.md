# Ícones Lucide no Prosa

- Status: aprovada
- Data: 2026-10-17

## 1. Objetivo e contexto

A UI do Prosa (`web/`, Vue 3 + Vite) hoje usa emojis Unicode e símbolos de
texto (⚙, 🔊, 📎, ➤, ⌂ etc.) como ícones. Eles variam de aparência entre
plataformas, não seguem a linguagem visual do app e misturam conteúdo com
chrome de UI.

Objetivo: adotar o Lucide (`lucide-vue-next`) como sistema de ícones e
substituir todos os glifos decorativos existentes por componentes Lucide,
preservando comportamento e o tema atual (stroke `currentColor`).

## 2. Escopo

### Dentro do escopo

- Adicionar a dependência `lucide-vue-next` em `web/package.json`
  (versão fixa publicada há mais de 7 dias, via `npm --prefix web add`).
- Substituir os glifos listados no inventário abaixo por componentes Lucide
  nos arquivos: `App.vue`, `views/HomeView.vue`, `components/ChatView.vue`,
  `components/VoiceBar.vue`, `components/AdminPanel.vue`.
- Ajustes mínimos de CSS/alinhamento onde o SVG precisar de tamanho ou
  alinhamento vertical (ex.: `.hash`, `.pin-tag`, `.tools`, `.voice-controls`).

### Fora do escopo

- `iconUrl` de comunidades (`CommunitySettings.vue`, `HomeView.vue` L11):
  é imagem enviada pelo usuário, não ícone de UI.
- Reações: tanto as já gravadas (`{{ r.emoji }}` em `ChatView.vue` L32)
  quanto os botões de reação rápida (`👍`/`❤️`/`😀`, L36-38) permanecem
  emoji — o emoji é o próprio dado/conteúdo, não chrome de UI.
- Labels de `<option>` no seletor de encaminhamento (`ChatView.vue` L165-167,
  `👥`/`#`): `<option>` não renderiza SVG; permanece texto.
- Placeholder `'#' + name` (`ChatView.vue` L104) e título `#{name}`
  (`HomeView.vue` L92): texto, não ícone — mantidos.
- `ContextMenu.vue`: hoje só tem labels de texto; adicionar ícones ao menu é
  melhoria nova, fora do escopo.
- Avatares com iniciais: permanecem.
- Backend, providers, P2P, IPC/Electron, testes de protocolo: inalterados.

## 3. Inventário e mapeamento emoji → Lucide

| Local | Glifo atual | Componente Lucide | Uso |
|---|---|---|---|
| `App.vue` L4 | ⚠️ | `TriangleAlert` | erro de boot |
| `App.vue` L11 | 💬 | `MessageSquare` | tela de loading |
| `App.vue` L13 | ✕ | `X` | fechar toast |
| `HomeView.vue` L6 | ⌂ | `House` | rail: início |
| `HomeView.vue` L14 | ＋ | `Plus` | rail: criar comunidade |
| `HomeView.vue` L15 | ⤵ | `LogIn` | rail: entrar com convite |
| `HomeView.vue` L23, L76 | ⚙ | `Settings` | configurações |
| `HomeView.vue` L24 | ✎ | `SquarePen` | novo grupo |
| `HomeView.vue` L29 | → | `ArrowRight` | ver amigos |
| `HomeView.vue` L30 | ☺ | `Smile` | item "Amigos" |
| `HomeView.vue` L45 | ＋ | `Plus` | novo canal |
| `HomeView.vue` L49 | 🔊 / `#` | `Volume2` / `Hash` | tipo de canal |
| `HomeView.vue` L55 | 🔇 / 🖥 | `MicOff` / `ScreenShare` | estado em canal de voz |
| `HomeView.vue` L74 | ● | `Circle` (fill `currentColor`) | ciclar presença |
| `HomeView.vue` L75 | 🛡 | `Shield` | botão admin |
| `HomeView.vue` L84, L91 | ← / `&larr;` | `ArrowLeft` | voltar |
| `HomeView.vue` L100 | 👤 | `UserRound` | resultado de busca (usuário) |
| `HomeView.vue` L104 | 🔊 | `Volume2` | estado vazio (canal de voz) |
| `HomeView.vue` L108 | 🗣 | `Speech` | estado vazio inicial |
| `ChatView.vue` L13, L40 | ↩ | `Reply` | referência/ação de resposta |
| `ChatView.vue` L17 | 📌 | `Pin` | tag "fixada" |
| `ChatView.vue` L23, L52 | 📎 | `Paperclip` | anexo |
| `ChatView.vue` L39 | 📋 | `Copy` | copiar texto |
| `ChatView.vue` L48 | ✕ | `X` | cancelar resposta |
| `ChatView.vue` L56 | ➤ | `SendHorizontal` | enviar mensagem |
| `VoiceBar.vue` L3 | 🔊 | `Volume2` | status "Conectado" |
| `VoiceBar.vue` L8, L12 | 🔇 / 🖥 | `MicOff` / `ScreenShare` | badges nos tiles |
| `VoiceBar.vue` L16 | 🔇 / 🎙 | `MicOff` / `Mic` | toggle microfone |
| `VoiceBar.vue` L17 | 📷 | `Video` | toggle câmera |
| `VoiceBar.vue` L18 | 🖥 | `ScreenShare` | toggle tela |
| `VoiceBar.vue` L19 | 🔕 | `HeadphoneOff` | toggle surdo |
| `AdminPanel.vue` L3 | 🛡 | `Shield` | título |

Nomes conforme `lucide-vue-next`; equivalentes aceitos desde que o glifo
corresponda (ex.: `Reply`/`CornerUpLeft`).

## 4. Requisitos

### Funcionais

- RF-01: Todo glifo decorativo do inventário é substituído pelo componente
  Lucide correspondente; nenhum emoji/símbolo decorativo resta nos templates.
- RF-02: Botões de reação (`👍`, `❤️`, `😀`) permanecem com os emojis —
  decisão do usuário; nada muda nessa linha de botões.
- RF-03: Ícones condicionais preservam os `v-if`/ternários atuais (mudo,
  tela, pin, tipo de canal, `isAdmin`, `canManage`).
- RF-04: Ícones dentro de texto corrente (pin-tag, "Conectado", hits de
  busca, who-labels) ficam alinhados ao texto com tamanho proporcional
  (12–16px) e `vertical-align`/`display:inline-flex` conforme necessário.
- RF-05: `title`/`aria-label` existentes nos botões são mantidos; os SVGs
  decorativos recebem `aria-hidden="true"` (ou equivalente do pacote).
- RF-06: `●` de presença vira `Circle` preenchido cuja cor segue o estado
  (`online`/`idle`/`dnd`/`invisible`), reutilizando a lógica/cores de
  `.dot` quando aplicável.

### Não funcionais

- RNF-01: Ícones herdam cor via `currentColor`; nenhuma cor hardcoded.
- RNF-02: Tamanhos consistentes por contexto (rail ~20px, botões de
  ferramentas ~14–16px, `.big` de estados vazios ~42px).
- RNF-03: Import nomeado por componente (tree-shaking); sem import global
  do pacote inteiro.
- RNF-04: Sem nova dependência além de `lucide-vue-next`; versão fixa,
  publicada há mais de 7 dias.
- RNF-05: Sem regressão visual nos temas claro/escuro (`data-theme`).

## 5. Modos, plataformas e UI/UX

- Aplica-se igualmente aos modos `server` e `p2p`: a mudança é só de
  renderização no renderer.
- Plataformas: web (Vite) e Electron renderer — `lucide-vue-next` é Vue
  puro, sem API Node, seguro para o renderer com isolamento de contexto.
- Responsividade: botões `.back`/`.friends-back` mantêm comportamento
  mobile existente.
- Nenhuma mudança de fluxo, texto ou navegação.

## 6. Contratos afetados

Não se aplica. Nenhuma mudança em API REST, erros, WebSocket, providers,
eventos P2P ou IPC. Payloads de reação continuam enviando emoji (RF-02).

## 7. Estado, persistência e migrações

Não se aplica. Nenhum estado, schema ou dado persistido é afetado; reações
armazenadas como emoji permanecem válidas e renderizadas como texto.

## 8. Autenticação, autorização e privacidade

Não se aplica. Ícones não alteram permissões (`canManage`, `isAdmin`
continuam guardando a exibição dos botões, não a autorização em si).

## 9. Falhas e recuperação

Não se aplica. Não há chamadas de rede novas nem estados de falha novos.

## 10. Critérios de aceite

- CA-01 (RF-01): `grep` por glifos do inventário em `web/src/**/*.vue`
  não retorna ocorrências fora das exceções de escopo (opção de
  encaminhamento, placeholder, botões e chips de reação).
- CA-02 (RF-02, RF-03): Reagir 👍/❤️, responder, copiar, anexar, enviar,
  fixar e os toggles de voz funcionam como antes (smoke manual ou
  verificação de handlers inalterados).
- CA-03 (RNF-01, RNF-05): Ícones acompanham `color`/`--fg` e mudam de cor
  nos dois temas sem CSS por-ícone.
- CA-04: `npm --prefix web test` e `npm run build` passam.
- CA-05 (RNF-04): `web/package.json` e lockfile registram `lucide-vue-next`
  com versão fixa; `npm ls lucide-vue-next` confirma.

## 11. Testes, riscos e decisões em aberto

### Estratégia de testes

- Automatizado: `npm --prefix web test` (suite P2P, sem cobertura de UI —
  serve como regressão) e `npm run build`. `git diff --check`.
- Manual (roteiro): abrir app nos dois temas; verificar rail, sidebar,
  userbar, chat (pin/anexo/reações/resposta/composer), VoiceBar conectado,
  AdminPanel, estados vazios e toasts.

### Riscos

- Baixo. Maior risco é desalinhamento vertical de SVG inline junto a texto;
  mitigado por RF-04 e revisão visual.
- Instalação exige acesso à rede (aprovação na task correspondente).

### Decisões em aberto

- D1 (decidido pelo usuário): botões de reação mantêm emoji — não viram
  Lucide.
- D2 (padrão adotado): `#` de canal de texto vira `Hash`, consistente com
  `Volume2`.
- D3 (padrão adotado): `👥` em labels de `<option>` (encaminhar) não pode
  virar SVG — permanece emoji no texto da opção.
- D4 (padrão adotado): indicador ● de presença vira `Circle` com `fill`,
  com cor por estado de presença.

Aguardando aprovação da spec para criar as tasks.

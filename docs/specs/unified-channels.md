# Canais unificados: palco de voz central + chat em aside lateral

- Status: aprovada
- Data: 2026-10-22

## 1. Objetivo e contexto

Hoje os canais de comunidade são de dois tipos: `text` (o clique abre o
`ChatView` na área central) e `voice` (o clique entra direto na chamada,
com o modal `voiceSwitch` se já conectado a outro canal — spec
`voice-channel-switch-confirm.md`). O usuário escolhe o tipo ao criar o
canal.

Objetivo: unificar — todo canal de comunidade suporta texto e voz. A
área central passa a ser o palco de voz do canal aberto (participantes,
controles, entrar/sair, indicador de quem fala) e o chat de texto passa
a um painel lateral direito, aberto/fechado por um ícone
`MessageCircle` no topbar. Não há mais escolha de tipo na criação.

## 2. Escopo

### Dentro do escopo

- Novo componente `web/src/components/VoiceStage.vue` — palco de voz da
  área central para o canal de comunidade aberto:
  - grade de participantes do canal (`store.voice[channel.id]`),
    estilo `.voice-tile` do VoiceBar: avatar/vídeo, nome, ícones de
    mudo/tela e anel visual de "falando";
  - botão **Entrar** (quando não conectado a este canal) e **Sair**
    (quando conectado a ele); Entrar estando conectado a outro canal
    dispara o modal `voiceSwitch` existente;
  - controles de microfone e alto-falante (reuso de `toggleMute`/
    `toggleSpeaker`) visíveis quando conectado a este canal;
  - estado vazio ("Ninguém na chamada" + Entrar) quando a sala está
    vazia.
- `HomeView.vue`: todo canal de comunidade abre via `openChannel` (o
  clique deixa de entrar na voz); `.main` passa a ter linha flexível
  `palco + aside`; aside direito (`.chat-aside`) contém `ChatView` do
  canal aberto, controlado por `chatOpen`; botão `MessageCircle` no
  `.topbar` com estado visual aberto/fechado; remoção do select "Tipo"
  do modal Novo canal (criação sempre `'text'`); ícone único `Hash` na
  sidebar; a lista `.voice-users` sob os canais é preservada.
- `rtc.js`: detecção local de fala — `rtc.speaking` (`Set`/`Map` de
  `userId` falando) alimentado por `AudioContext` + `AnalyserNode` sobre
  o stream local e cada `rtc.remoteStreams`, com polling leve
  (~100–150 ms) e threshold de volume; limpeza no `leaveVoice`/
  `dropPeer`.
- `ChatView.vue`: `forwardTargets` passa a incluir todos os canais da
  comunidade (não apenas `type === 'text'`); ajuste do `channelLabel`
  se necessário.
- Servidor: relaxar `joinVoice` em `server/src/realtime.js` para aceitar
  canais de comunidade `text` e `voice` (rejeita apenas `dm`/`group_dm`)
  — decisão D1.

### Fora do escopo

- DMs e grupos: `ChatView` segue na área central, sem palco nem aside.
- Protocolo P2P, envelopes, WebSocket (`/ws`), sinalização WebRTC e IPC
  Electron: inalterados (o tipo do canal vira metadado legado).
- Migração de dados: canais existentes `text`/`voice` passam a se
  comportar como unificados na UI, sem alteração persistida.
- Compartilhamento de tela/câmera: seguem controlados pelo VoiceBar e
  userbar (não duplicados no palco — decisão D7).
- Comunidades, permissões, notificações, busca: inalterados.

## 3. Estado e fluxo

- `clickChannel(ch)` passa a sempre chamar `openChannel(ch.id)` +
  `mobileChat = true`; o gate `voiceSwitch` migra para o botão Entrar do
  `VoiceStage` (`rtc.channelId && rtc.channelId !== ch.id` → modal).
- `chatOpen` (`ref`, padrão `false` — decisão D3) controla o aside;
  ícone `MessageCircle` exibe estado ativo quando aberto.
- `.main` mantém `.topbar` (título do canal + busca + ícone de chat);
  abaixo, `.chat-wrap` (classe já existente e sem uso) recebe
  `<VoiceStage>` (flex: 1) e `<aside class="chat-aside">` com
  `<ChatView>` quando `chatOpen`.
- `rtc.speaking`: atualizado por analysers locais/remotos; o tile aplica
  classe visual (ex.: `.speaking` — borda/anel na cor `verde-mata`)
  quando o `userId` correspondente está falando.
- `VoiceBar` permanece na sidebar (barra persistente da conexão), sem
  mudança de comportamento.

## 4. Requisitos

### Funcionais

- RF-01: O modal "Novo canal" não exibe mais seleção de tipo;
  `createChannel` envia `type: 'text'` fixo. Canais `voice` legados
  continuam funcionando como unificados.
- RF-02: Clicar em qualquer canal de comunidade abre o canal
  (`openChannel`), sem entrar na voz. A área central exibe o
  `VoiceStage` do canal.
- RF-03: `.topbar` exibe o nome do canal e, à direita, um botão
  `MessageCircle` que alterna `chatOpen`; o botão indica visualmente o
  estado (ex.: classe `on`/cor de destaque quando aberto).
- RF-04: O aside direito (`.chat-aside`, largura ~320–360px) renderiza
  `ChatView` do canal aberto apenas quando `chatOpen`; a área central se
  adapta à largura disponível.
- RF-05: `VoiceStage` lista os participantes de `store.voice[ch.id]`
  (inclui o próprio usuário quando conectado a este canal), com
  avatar/`avatarUrl`+iniciais, nome, ícones `MicOff`/`ScreenShare`
  conforme o estado e anel de "falando" via `rtc.speaking`.
- RF-06: Botão principal do palco: "Entrar" quando `rtc.channelId !==
  ch.id`; "Sair" quando `rtc.channelId === ch.id`. Entrar estando
  conectado a outro canal abre o modal `voiceSwitch` (textos e botões da
  spec anterior, sem mudança); confirmar chama `joinVoice(ch.id,
  ch.name)`. Entrar sem conexão chama `joinVoice` direto.
- RF-07: Quando `rtc.channelId === ch.id`, o palco exibe os controles de
  microfone e alto-falante (`toggleMute`/`toggleSpeaker`, classes e
  ícones do padrão `.voice-controls`).
- RF-08: `rtc.speaking` reflete quem fala: analyser sobre
  `rtc.localStream` (self) e sobre cada `remoteStreams[key]`; threshold
  de RMS/pico e histerese curta (~300 ms) para evitar flicker; sem
  propagação por evento — cada cliente detecta localmente.
- RF-09: Sidebar: todo canal usa ícone `Hash`; a lista `.voice-users`
  sob o canal e o contador continuam; `.active` vale para canal de texto
  aberto e para canal de voz conectado (regra atual combinada).
- RF-10: `forwardTargets` do ChatView inclui todos os canais da
  comunidade.
- RF-11: Servidor: `joinVoice` aceita `type` `'text'` ou `'voice'` e
  rejeita `dm`/`group_dm`.
- RF-12: Em viewport ≤700px, o aside de chat ocupa a área do palco
  (overlay/full-width dentro de `.main`), fechando-se ao voltar —
  comportamento responsivo coerente com o padrão `chat-open` existente.

### Não funcionais

- RNF-01: Reuso máximo: `ChatView` sem refactor interno; estilos novos
  mínimos (`.chat-aside`, `.voice-stage` reaproveitando `.voice-grid`/
  `.voice-tile`/`.voice-controls`, `.speaking`, estado do ícone).
- RNF-02: Sem novas dependências; sem mudança de envelope P2P, WS,
  provider ou IPC.
- RNF-03: Ícones Lucide (`MessageCircle` disponível em
  `lucide-vue-next`), `aria-hidden` nos decorativos, `title` no botão de
  chat; textos pt-BR.
- RNF-04: Analysers criados só enquanto houver streams; `AudioContext`
  encerrado/suspenso no `leaveVoice`; sem timers após desmontar.
- RNF-05: Comportamento equivalente nos modos `p2p` e `server` (RF-11
  cobre o servidor).

## 5. Modos, plataformas e UI/UX

- Modo `p2p` (único ativo): tudo funciona localmente — tipo vira
  metadado, voz por `channelId` já é genérica, `store.voice` populado
  desde a spec anterior.
- Modo `server` (legado): depende de RF-11 para voz em canal `text`;
  demais comportamentos idênticos.
- Plataformas: web e Electron renderer; `getUserMedia`/`AudioContext`
  são APIs do renderer, sem IPC.
- UX: um clique abre o canal; entrar na voz é sempre pelo botão do
  palco. O ícone de chat não altera nome nem configurações do canal.

## 6. Contratos afetados

- REST/WS/P2P: nenhum contrato alterado. `channel.create` segue com
  `type` (sempre `'text'` nos novos); `VOICE_JOIN`/`VOICE_STATE`/
  `SIGNAL` inalterados.
- Servidor (interno): apenas a validação de tipo em `joinVoice`
  (`realtime.js`) — de `type !== 'voice'` para "apenas canais de
  comunidade". Mensagens WS no fio permanecem iguais.
- `rtc` (estado interno): novo campo `speaking` — não é contrato.

## 7. Estado, persistência e migrações

- Estado novo em memória: `chatOpen` (view) e `rtc.speaking`. Nenhuma
  migração: o `CHECK (type IN ('text','voice','dm','group_dm'))` do
  SQLite permanece válido — novos canais são `'text'`.

## 8. Autenticação, autorização e privacidade

- Não se aplica além do existente: `join_voice`/`channelContext`
  seguem validando acesso; indicador de fala é processado localmente e
  não expõe áudio adicional (o stream já é recebido).

## 9. Falhas e recuperação

- `getUserMedia` falha ao Entrar: comportamento atual preservado
  (usuário não conecta; `rtc.channelId` nulo).
- Modal de troca: cancelar mantém conexão atual — mesmo fluxo já
  entregue.
- Analyser indisponível/falho: o palco simplesmente não exibe anel de
  fala (degradação silenciosa, sem quebrar a chamada).
- `AudioContext` bloqueado por autoplay policy: criado/retomado no
  gesto de Entrar (user gesture), risco baixo.

## 10. Critérios de aceite

- CA-01 (RF-01): "Novo canal" não mostra "Tipo"; canal criado funciona
  com texto e voz.
- CA-02 (RF-02, RF-04): Clicar num canal abre o palco central; o chat
  só aparece ao ativar o ícone, e a área central se adapta ao abrir/
  fechar.
- CA-03 (RF-03): `MessageCircle` no topbar alterna o aside e mostra
  estado ativo/inativo.
- CA-04 (RF-05, RF-08): Com dois clientes na sala, o palco exibe
  avatar+nome de ambos e o anel de fala acompanha quem fala.
- CA-05 (RF-06): Desconectado, "Entrar" conecta direto; conectado a
  outro canal, "Entrar" abre o modal `voiceSwitch` e confirmar troca;
  conectado ao canal aberto, o botão é "Sair".
- CA-06 (RF-07): Mic e alto-falante do palco funcionam como no
  VoiceBar.
- CA-07 (RF-01, RF-09): Canais `voice` legados abrem o mesmo palco +
  chat unificados; destaque `active` correto na sidebar.
- CA-08 (RF-10): Encaminhar mensagem lista todos os canais da
  comunidade.
- CA-09 (RF-12): Em ≤700px o chat abre sobre a área do palco e fecha
  corretamente.
- CA-10: `npm test`, `npm --prefix web test`, `npm run build` e
  `git diff --check` passam; DMs, VoiceBar, modal `voiceSwitch` e
  toggles sem regressão.

## 11. Testes, riscos e decisões em aberto

### Estratégia de testes

- Automatizado: suites existentes + `npm run build` + `git diff
  --check`; servidor cobre RF-11 se houver teste de voz (verificar
  `server/test/api.test.js`; caso contrário, inspeção + roteiro).
- Manual (roteiro): dois perfis/peers — criar canal único; texto no
  aside; entrar na voz pelo palco; indicador de fala; troca de canal
  com modal; sair e reabrir chat; resize/mobile.

### Riscos

- Moderado: reorganização do `.main` afeta layout desktop e mobile —
  mitigar reutilizando `.chat-wrap` e os breakpoints existentes.
- `rtc.speaking` adiciona polling contínuo durante chamadas — mitigar
  com intervalo ≥100 ms e teardown correto.
- Relaxar o check no servidor (RF-11) é mudança de validação, não de
  protocolo; impacto limitado ao modo `server` legado.

### Decisões adotadas (revisáveis)

- D1: relaxar `joinVoice` no servidor para canais de comunidade
  (`text`/`voice`), preservando compatibilidade do modo `server`.
  Alternativa: deixar a checagem e aceitar voz unificada só no P2P.
- D2: indicador de fala via `AnalyserNode` local (sem evento novo).
- D3: aside de chat **fechado** por padrão ao abrir o canal.
- D4: ícone único `Hash` para todos os canais na sidebar.
- D5: `MessageCircle` no canto direito do `.topbar`.
- D6: DMs fora do escopo (sem palco nem aside).
- D7: palco expõe mic, alto-falante e Entrar/Sair; câmera/tela/surdo
  seguem no VoiceBar/userbar (evita duplicar toda a barra).

Aguardando aprovação da spec para criar as tasks.

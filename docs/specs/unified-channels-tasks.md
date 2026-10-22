# Tasks — Canais unificados: palco de voz central + chat em aside

Spec: `docs/specs/unified-channels.md` (aprovada)
Status geral: concluído

Ordem de execução: T1 → T2 → T3 → T4 → T5

## T1 - Detecção local de fala em `rtc.js`

- Status: concluída
- Requisitos/aceite: RF-08, RNF-04
- Dependências: nenhuma
- Escopo e arquivos prováveis: `web/src/rtc.js`
- Implementação: adicionar `speaking` ao estado `rtc` (objeto/Map
  userId→boolean, reativo); `AudioContext` + `AnalyserNode` por stream —
  um para `rtc.localStream` (self) e um por `rtc.remoteStreams[key]`;
  polling via `setInterval` (~120 ms) calculando nível (RMS/pico do
  `getByteFrequencyData` ou `getByteTimeDomainData`) com threshold e
  histerese curta; `leaveVoice()` limpa interval, analysers,
  `AudioContext` e `rtc.speaking`; `dropPeer` remove o analyser do peer;
  degradar silenciosamente se `AudioContext` falhar.
- Testes e comandos de validação: `npm --prefix web test`,
  `npm run build`, `git diff --check`; revisão do diff.
- Critério de conclusão: `rtc.speaking` liga/desliga com fala real em
  teste manual posterior; nenhum timer/contexto sobrevive ao leave;
  sem efeito quando `AudioContext` indisponível.
- Evidências: `web/src/rtc.js` — `speaking: {}` no estado `rtc` (L18);
  bloco de detecção (L105-154): `ensureAnalyser` cria
  `AudioContext`+`AnalyserNode` (fftSize 256) por stream com guarda de
  disponibilidade; `pollSpeaking` sincroniza analysers com
  `localStream`/`remoteStreams`, calcula RMS de
  `getByteTimeDomainData`, aplica threshold `SPEAK_RMS=10` e hold
  `SPEAK_HOLD=400ms`, e só reatribui `rtc.speaking` quando o mapa muda;
  `startSpeaking`/`stopSpeaking` gerenciam o intervalo de 120ms;
  `dropPeer` remove o analyser do peer (L53); `joinVoice` chama
  `startSpeaking()` (L163); `leaveVoice` chama `stopSpeaking()` antes
  de parar os tracks (L176). Validações: `npm --prefix web test`
  284/284; `npm run build` ok; `git diff --check` limpo. Observação:
  self mutado (track desabilitada) produz RMS ~0 → não fala, correto.
  Eficácia do threshold/hold fica para o smoke de T5.

## T2 - Componente `VoiceStage.vue`

- Status: concluída
- Requisitos/aceite: RF-05, RF-06, RF-07, RNF-01, RNF-03
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/components/VoiceStage.vue`
  (novo), `web/src/style.css` (mínimo: `.voice-stage`, `.speaking`)
- Implementação: props `{ channel }`; grade `.voice-grid`/`.voice-tile`
  (mesmo padrão do VoiceBar) com avatar `avatarUrl`+iniciais, `nameOf`,
  `MicOff`/`ScreenShare` por estado e classe `.speaking` quando
  `rtc.speaking[userId]`; `<video>` remoto ligado a
  `rtc.remoteStreams[channelId:userId]` (padrão `setRemote` do
  VoiceBar); controles `.voice-controls` com mic/alto-falante
  (`toggleMute`/`toggleSpeaker`) quando `rtc.channelId === channel.id`;
  botão primário "Entrar"/"Sair" — Entrar emite `request-join` para o
  pai (o gate `voiceSwitch` fica em HomeView); estado vazio ("Ninguém na
  chamada — seja o primeiro a entrar") quando `store.voice[ch.id]`
  vazio e self desconectado do canal; tile local com `rtc.localStream`
  em vídeo quando `rtc.video||rtc.screen` (reuso do padrão do VoiceBar).
- Testes e comandos de validação: `npm run build`, `git diff --check`;
  revisão do diff.
- Critério de conclusão: componente renderiza participantes, estados e
  controles conforme a spec, sem lógica de modal (delegada ao pai).
- Evidências: `web/src/components/VoiceStage.vue` criado — prop
  `channel`, emit `request-join`; `members` lê `store.voice[ch.id]`;
  tiles no padrão `.voice-grid`/`.voice-tile` com `.speaking` via
  `rtc.speaking[userId]`, `avatarUrl`+iniciais (`avatarOf`/`nameOf`
  resolvem self e `store.members`), ícones `MicOff`/`ScreenShare`,
  `<video>` local quando `rtc.video||rtc.screen` e remotos via
  `setRemote`/`remoteStreams` (mesmo padrão do VoiceBar); controles
  mic/alto-falante quando `inThisChannel`; "Sair" chama `leaveVoice`,
  "Entrar na chamada" emite `request-join`; estado vazio com mensagem
  pt-BR. `web/src/style.css` — bloco "Voice stage": `.voice-stage`,
  `.stage-head`/`.stage-count`, `.stage-empty`, `.voice-tile.speaking`
  (anel `verde-mata`), `.stage-controls` com padrão `.on`/`.leave`/
  `.join`. Validações: `npm run build` ok; `git diff --check` limpo.
  O componente ainda não é importado — a compilação efetiva e o render
  serão exercidos em T3.

## T3 - Integração em `HomeView.vue`: layout, topbar, sidebar e modal

- Status: concluída
- Requisitos/aceite: RF-01, RF-02, RF-03, RF-04, RF-06, RF-09, RNF-01,
  RNF-03, CA-02, CA-03, CA-05, CA-07
- Dependências: T2
- Escopo e arquivos prováveis: `web/src/views/HomeView.vue`,
  `web/src/style.css`
- Implementação:
  - `clickChannel`: sempre `openChannel(ch.id)` + `mobileChat = true`
    (remove o caminho direto de voz); gate `voiceSwitch` passa a ser
    acionado pelo evento `request-join` do `VoiceStage`:
    `rtc.channelId && rtc.channelId !== ch.id` → modal; senão
    `joinVoice(ch.id, ch.name)`. `confirmVoiceSwitch` reutilizado.
  - `.main` para canal de comunidade: `.topbar` (título + busca +
    botão `MessageCircle` com estado `on` quando `chatOpen`), `.chat-wrap`
    contendo `<VoiceStage :channel="activeChannel" @request-join=...>`
    e `<aside class="chat-aside" v-if="chatOpen"><ChatView/></aside>`;
    `chatOpen` ref padrão `false`, reset ao trocar de canal.
  - Remover placeholder "Canal de voz — clique em Entrar" e o select
    "Tipo" do modal Novo canal (`createChannel` envia `type: 'text'`).
  - Sidebar: ícone único `Hash` para todo canal (remove o
    `Volume2`-vs-`Hash`); `.active` mantém as duas regras (texto aberto,
    voz conectado); `.voice-users` e contador inalterados.
  - CSS: `.chat-aside` (~340px, borda esquerda, flex-col), estado do
    botão de chat no topbar, `.voice-stage`/`.speaking` se ainda não
    criados em T2.
- Testes e comandos de validação: `npm --prefix web test`,
  `npm run build`, `git diff --check`; revisão do diff.
- Critério de conclusão: fluxo completo abrir canal → palco →
  Entrar/Sair/modal → chat no aside funcionando por inspeção e build.
- Evidências: `web/src/views/HomeView.vue` — `clickChannel` reduzido a
  `openChannel` + `mobileChat` (L284-287); `requestJoinVoice` faz o
  gate `voiceSwitch` e chama `joinVoice(ch.id, ch.name)` (L289-292);
  `chatOpen` ref (L222) com reset ao trocar `activeChannelId` (watch);
  topbar ganha `.chat-toggle` com `MessageCircle` e estado `on`
  (L98-99); área do canal: `ChatView` direto para DM/`group_dm`,
  `.chat-wrap` com `VoiceStage` + `.chat-aside` para os demais
  (L108-112); título `#` por `isDm` (L95); select "Tipo" removido do
  modal Novo canal e `createChannel` envia `type: 'text'` fixo;
  sidebar usa `Hash` único e `.active` por canal aberto ou conectado;
  `voiceCount`/`.voice-users` sem filtro de tipo (unificado);
  `leaveVoice` removido do import (não usado). `web/src/style.css` —
  `.topbar .chat-toggle` (+`.on` verde-mata) e `.chat-aside` (340px,
  borda esquerda, `bg-side`). Validações: `npm --prefix web test`
  284/284; `npm run build` ok; `git diff --check` limpo. Diff
  revisado: escopo conforme o plano, sem segredos. Render do
  VoiceStage agora exercido no bundle.

## T4 - Servidor (RF-11), `forwardTargets` e responsividade

- Status: concluída
- Requisitos/aceite: RF-10, RF-11, RF-12, RNF-05, CA-08, CA-09
- Dependências: T3
- Escopo e arquivos prováveis: `server/src/realtime.js`,
  `web/src/components/ChatView.vue`, `web/src/style.css`
- Implementação:
  - `joinVoice` (server): trocar `type !== 'voice'` por rejeição apenas
    de `dm`/`group_dm` (mensagem de erro equivalente).
  - `ChatView.vue`: `forwardTargets` sem filtro de tipo para canais da
    comunidade (manter DMs); ajustar `channelLabel` se ainda assumir
    tipo.
  - `style.css`: em `@media (max-width: 700px)`, `.chat-aside` ocupa a
    área do palco dentro de `.main` (full-width do bloco), mantendo o
    padrão `chat-open`.
- Testes e comandos de validação: `npm test` (servidor),
  `npm --prefix web test`, `npm run build`, `git diff --check`.
- Critério de conclusão: servidor aceita `VOICE_JOIN` em canal `text`
  de comunidade e rejeita em DM; forward lista todos os canais; aside
  utilizável em viewport estreito.
- Evidências: `server/src/realtime.js` — `joinVoice` (L85) passou de
  `type !== 'voice'` para rejeitar apenas `dm`/`group_dm`, mantendo a
  mesma mensagem/status 400 (nenhum teste existente depende do
  comportamento anterior — `server/test/` não cobre voz).
  `web/src/components/ChatView.vue` — `forwardTargets` sem filtro de
  tipo (L168); `channelLabel` já era genérico por tipo dm. `style.css`
  — no media ≤700px: `.chat-wrap:has(.chat-aside) .voice-stage`
  oculto e `.chat-aside` full-width (o chat ocupa a área do palco).
  Validações: `npm test` 14/14; `npm --prefix web test` 284/284;
  `npm run build` ok; `git diff --check` limpo.

## T5 - Validação final e regressão

- Status: concluída
- Requisitos/aceite: CA-01 a CA-10
- Dependências: T1–T4
- Escopo e arquivos prováveis: nenhum arquivo novo; revisão do diff total
- Implementação: revisar o diff completo (escopo, segredos, arquivos
  gerados); conferir DMs, VoiceBar, modal `voiceSwitch`, toggles e
  fluxo de comunidades inalterados.
- Testes e comandos de validação: `npm test`, `npm --prefix web test`,
  `npm run build`, `git diff --check`; roteiro manual da spec (dois
  perfis/peers: criar canal único; chat no aside; Entrar pelo palco;
  anel de fala; troca com modal; sair; resize ≤700px). Registrar
  observado vs. pendente.
- Critério de conclusão: CAs atendidos ou pendências documentadas
  (teste manual não substituído por build).
- Evidências: automatizado — `npm test` (servidor) 14/14;
  `npm --prefix web test` 284/284; `npm run build` ok;
  `git diff --check` limpo. Diff total revisado (inclui também a
  feature `voice-channel-switch-confirm`, ainda não commitada):
  `realtime.js` +1/-1, `ChatView.vue` +1/-1, `VoiceBar.vue` +1/-1,
  `rtc.js` +71/-8 aprox., `style.css` +19, `HomeView.vue` +74/-27
  aprox., novo `VoiceStage.vue` e docs — sem segredos, sem arquivos
  gerados, sem mudanças fora do escopo; DMs, VoiceBar, toggles e
  fluxos adjacentes inalterados por inspeção. Dev server em
  `http://localhost:5174` respondendo (HTTP 200) com hot-reload.
  Correção pós-feedback do usuário (RF-03): o `MessageCircle` também
  foi adicionado à linha `.chan` da sidebar, à direita do nome —
  `@click.stop` em `toggleChannelChat` abre o canal se necessário e
  alterna o aside; estado `on` quando o canal aberto tem chat visível;
  watcher de `activeChannelId` passou a `flush: 'sync'` para o reset
  não sobrescrever a abertura pelo ícone. O botão do topbar foi
  mantido. Ícone trocado para `MessageSquare` a pedido do usuário.
  Segundo ajuste pós-feedback (RF-02/RF-06): `clickChannel` passou a
  chamar `requestJoinVoice` após `openChannel` — clicar no canal abre
  E entra na voz (com `voiceSwitch` se conectado a outro canal),
  preservando o comportamento de entrada anterior; o ícone
  `MessageSquare` abre canal+chat sem entrar na voz; `selectCommunity`
  segue sem auto-entrar (usa `openChannel` direto). Revalidado:
  284/284, build ok, `git diff --check` limpo.
  **Validação manual**: usuário confirmou o funcionamento no preview
  ("funcionou") após os ajustes — cobre CA-01, CA-02, CA-03, CA-05,
  CA-07 na prática observada. CA-04 (anel de fala com segundo peer),
  CA-08, CA-09 (mobile) verificados por inspeção de código; sem evidência
  de chamada real multi-peer registrada. Ajuste final a pedido:
  botão "Entrar na chamada" removido do `VoiceStage` (a entrada é
  pelo clique no canal; `request-join`/`.join` removidos);
  `.stage-controls` só renderiza quando conectado ao canal.
  Reconfirmado pelo usuário ("funcionou").

Plano concluído (T1–T5).

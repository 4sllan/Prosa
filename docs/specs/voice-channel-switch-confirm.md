# Confirmação ao trocar de canal de voz (clique simples)

- Status: aprovada
- Data: 2026-10-22

## 1. Objetivo e contexto

Hoje, clicar em um canal de voz na sidebar de uma comunidade entra
diretamente: `clickChannel` em `web/src/views/HomeView.vue` chama
`joinVoice(ch.id)` (`web/src/rtc.js`), que executa `leaveVoice()` +
`getUserMedia` + `events.joinVoice` — a troca entre canais é silenciosa e
imediata, sem confirmação.

Objetivo (Opção A definida pelo usuário): manter o clique simples como
único gesto necessário, mas exibir um modal de confirmação quando o
usuário já estiver conectado a outro canal de voz. O modal informa o
canal atual e o canal de destino; "Cancelar" mantém o usuário onde está
e "Confirmar" realiza a troca. Após a entrada, o canal conectado deve
receber destaque visual e o usuário deve aparecer (avatar + nome) na
lista de participantes sob o canal, no estilo Discord — indicação que
já existe parcialmente na UI, mas que não é alimentada no modo P2P.

## 2. Escopo

### Dentro do escopo

- Gate de confirmação em `clickChannel` (`HomeView.vue`): ao clicar em
  canal de voz estando conectado a outro, abrir modal em vez de entrar
  diretamente.
- Modal inline seguindo o padrão existente (`.modal-bg`/`.modal`/
  `.actions`/`.btn.ghost`/`.btn.primary`), com título "Trocar de canal
  de voz?", mensagem citando os dois canais e botões Cancelar/Confirmar.
- Registro do nome do canal de voz conectado no estado `rtc`
  (`rtc.channelName`), resolvendo o nome mesmo quando o canal pertence a
  outra comunidade; reaproveitado pelo `VoiceBar` (que hoje cai no
  fallback `'voz'` nesse caso).
- Hidratação de `store.voice` no caminho P2P: o handler `VOICE_STATE` do
  `rtc.js` passa a espelhar `members` em `store.voice[channelId]` e o
  join/leave local sincroniza o estado para o próprio usuário, de modo
  que a lista `.voice-users` sob o canal exiba o usuário conectado
  (avatar/iniciais + nome) e os demais participantes.
- Destaque visual do canal de voz conectado: `.chan` de voz recebe a
  classe `active` (ou classe dedicada equivalente) enquanto
  `rtc.channelId === ch.id`.
- Item `.voice-user` passa a renderizar `avatarUrl` quando disponível
  (padrão `dm-item`: `<img>` com fallback para iniciais).

### Fora do escopo

- Backend (`server/`): inalterado — `joinVoice` no servidor já sai de
  todas as salas antes de entrar (`leaveAllVoice`) e broadcasta os
  `VOICE_STATE`.
- Contratos WS/P2P, providers, transporte, IPC/Electron: inalterados.
- Duplo clique: não será introduzido como requisito de entrada.
- Canais de texto, DMs, comunidades, permissões e demais fluxos de voz
  (mute, vídeo, tela, surdo, alto-falante): inalterados.
- Tratamento novo para falha de `getUserMedia`: comportamento atual
  preservado (decisão D3).

## 3. Estado e fluxo atuais

- `rtc.channelId` indica o canal conectado; `joinVoice(id)` retorna cedo
  se `id === rtc.channelId` e, caso contrário, chama `leaveVoice()`
  antes de entrar — a troca já é funcional no cliente e no servidor.
- `store.voice` (`channelId -> members[]`) é alimentado apenas pelo
  `dispatch` do WS (`stores.js`, caso `VOICE_STATE`) — ou seja, somente
  no provider `server`. Como o app roda exclusivamente em `MODE = 'p2p'`
  (`services/provider.js`), `store.voice` permanece vazio em runtime: a
  lista `.voice-users`, o contador `voiceCount` e os tiles remotos do
  `VoiceBar` não exibem participantes hoje.
- No provider P2P (`services/providers/p2p.js`), `voiceJoinSelf`/
  `voiceLeaveSelf`/`voiceTrack` mantêm um `Map` local; eventos
  `voice_state` de peers chegam apenas ao handler registrado via
  `events.on('VOICE_STATE')` (o do `rtc.js`, que gerencia peers) e o
  `dispatchP2P` da store ignora o tipo `voice_state`.
- A sidebar já renderiza `.voice-users` a partir de `store.voice[ch.id]`
  com iniciais + `nameOf(userId)`; `nameOf` resolve o próprio usuário
  via `store.user` e demais via `store.members`/DMs.

## 4. Requisitos

### Funcionais

- RF-01: Clicar em canal de voz **sem** estar conectado a outro canal de
  voz entra normalmente, com um único clique (comportamento atual
  preservado).
- RF-02: Clicar em canal de voz estando conectado a outro canal de voz
  (`rtc.channelId` definido e diferente do canal clicado) abre o modal
  de confirmação em vez de entrar.
- RF-03: Clicar no mesmo canal de voz em que já está conectado não abre
  modal nem reinicia a conexão.
- RF-04: O modal exibe título "Trocar de canal de voz?" e mensagem
  "Você já está conectado ao canal de voz {canal atual}. Deseja sair
  dele e entrar no canal {novo canal}?"; botões "Cancelar" (`.btn.ghost`,
  fecha o modal e mantém a conexão atual) e "Confirmar" (`.btn.primary`,
  executa a troca via `joinVoice` e fecha o modal).
- RF-05: O nome do canal atual exibido no modal resolve corretamente
  mesmo quando o canal conectado pertence a outra comunidade: o nome é
  registrado em `rtc.channelName` no momento do join (passado por
  `clickChannel`) e limpo no `leaveVoice`.
- RF-06: `VoiceBar` passa a usar `rtc.channelName` (com fallback
  `store.channels` → `'voz'`), eliminando o fallback genérico quando o
  canal é de outra comunidade.
- RF-07: O handler `VOICE_STATE` do `rtc.js` espelha `members` em
  `store.voice[channelId]` — idêntico ao que o `dispatch` da store já
  faz no modo server (dado equivalente, sem conflito).
- RF-08: No join/leave locais, `store.voice` é sincronizado para o
  próprio usuário: após `events.joinVoice`, `store.voice[channelId]`
  recebe o snapshot de `misc.voiceState(channelId)` (funciona nos dois
  providers); em `leaveVoice`, a entrada do próprio usuário é removida
  do canal anterior.
- RF-09: Enquanto conectado, o `.chan` do canal de voz exibe destaque
  `active` (mesma classe visual do canal de texto ativo).
- RF-10: `.voice-user` exibe `<img>` com `avatarUrl` quando o membro
  resolvido possuir avatar; caso contrário mantém as iniciais atuais.
  Helper `avatarOf(userId)` resolve `store.user.avatarUrl` para o
  próprio usuário e `member.user.avatarUrl` para os demais.

### Não funcionais

- RNF-01: Modal replica o markup/estilo dos modais existentes de
  `HomeView.vue`; nenhum componente novo, nenhum estilo novo além do
  estritamente necessário (o destaque reutiliza `.chan.active`).
- RNF-02: Sem novas dependências; sem mudança de REST, WS, providers,
  transporte P2P ou IPC.
- RNF-03: Comportamento equivalente nos modos `server` e `p2p`; no modo
  server a hidratação extra de `store.voice` é redundante e inócua.
- RNF-04: Ícones decorativos com `aria-hidden="true"`; modal fecha ao
  clicar no fundo (`@click.self`), como os demais.

## 5. Modos, plataformas e UI/UX

- Modo `p2p` (modo único atual): RF-07/RF-08 são o que efetivamente faz
  a lista de participantes aparecer — sem eles, nem o próprio usuário
  seria listado. No modo `server` o comportamento permanece igual ao
  atual, com o `VOICE_STATE` do WS reconciliando qualquer divergência
  transitória.
- Plataformas: web (Vite) e Electron renderer — mudança restrita a
  componentes Vue e `rtc.js`, sem IPC.
- UX: fluxo de entrada permanece em clique simples; o modal só aparece
  na transição entre canais de voz. Textos em português, conforme o
  exemplo fornecido pelo usuário.

## 6. Contratos afetados

- Nenhum contrato alterado. Reuso de `misc.voiceState(channelId)` (já
  exposto pelos dois providers: REST `GET /channels/:chId/voice` no
  server e `voiceMembers` local no P2P) e dos eventos `VOICE_JOIN`/
  `VOICE_LEAVE`/`VOICE_STATE` existentes.
- `rtc` (estado interno do renderer) ganha o campo `channelName` — não é
  contrato externo.

## 7. Estado, persistência e migrações

- Somente estado em memória: `rtc.channelName` e `store.voice` (já
  existente). Não se aplica persistência, schema ou migração.

## 8. Autenticação, autorização e privacidade

- Não se aplica além do existente: o servidor valida `join_voice` e
  acesso ao canal em `joinVoice` (`realtime.js`); no P2P, os eventos
  `voice_state` seguem o espaço/canal como hoje. Nenhum dado novo é
  trafegado — `channelName` vive apenas no renderer.

## 9. Falhas e recuperação

- Cancelar no modal não emite nenhum evento: o usuário permanece no
  canal atual com peers e streams intactos.
- Confirmar delega a `joinVoice`, que já encapsula leave + join; no
  servidor, `VOICE_JOIN` também executa `leaveAllVoice`, tornando a
  troca robusta mesmo se um `VOICE_LEAVE` se perder.
- Falha de `getUserMedia` após o `leaveVoice` deixa o usuário fora dos
  dois canais — comportamento atual preservado (D3); o `rtc.channelId`
  fica `null` e a UI reflete "desconectado".
- Reconexão WS reenvia `READY` com snapshot `voice` — hoje ignorado pelo
  `dispatch` (lacuna preexistente, fora do escopo; no P2P não há
  equivalente).

## 10. Critérios de aceite

- CA-01 (RF-01): Sem estar em voz, um clique no canal de voz conecta
  diretamente, sem modal.
- CA-02 (RF-02, RF-04): Conectado ao canal A, clicar no canal B abre o
  modal com os nomes corretos; "Cancelar" mantém o usuário em A;
  "Confirmar" o move para B.
- CA-03 (RF-03): Clicar no canal em que já está conectado não abre modal
  nem reinicia a chamada.
- CA-04 (RF-05, RF-06): Conectado ao canal A da comunidade X, navegar
  para a comunidade Y e clicar em um canal de voz exibe o nome real de A
  no modal (e no `VoiceBar`), não o fallback genérico.
- CA-05 (RF-07, RF-08): Ao entrar em canal de voz no modo P2P, a lista
  sob o canal exibe o próprio usuário (avatar/iniciais + nome) enquanto
  conectado, e o remove ao sair; outros participantes conectados também
  aparecem.
- CA-06 (RF-09): O canal de voz conectado exibe destaque `active` na
  sidebar enquanto durar a conexão.
- CA-07 (RF-10): Participante com `avatarUrl` exibe a imagem; sem
  `avatarUrl`, exibe as iniciais (fallback atual).
- CA-08: `npm --prefix web test`, `npm run build` e `git diff --check`
  passam; entrada em canal sem conflito, saída pelo VoiceBar e toggles
  de voz sem regressão.

## 11. Testes, riscos e decisões em aberto

### Estratégia de testes

- Automatizado: `npm --prefix web test` (regressão P2P), `npm run build`,
  `git diff --check`. Não há cobertura de UI/`rtc.js` hoje; se viável
  sem infraestrutura nova, extrair a decisão "precisa confirmar?" para
  função pura testável, ou validar por build + roteiro manual.
- Manual (roteiro): dois perfis/peers — entrar em A; clicar em B e
  cancelar (permanece em A, áudio intacto); clicar em B e confirmar
  (move para B, lista de participantes atualiza nos dois lados); trocar
  de comunidade conectado e abrir o modal (nome correto, CA-04);
  verificar destaque `active`, avatar/iniciais e remoção da lista ao
  sair. Registrar o que foi efetivamente observado.

### Riscos

- Baixo/moderado. O gate do modal é trivial; o ponto sensível é a
  hidratação de `store.voice` no P2P (RF-07/RF-08) — divergências de
  ordem entre snapshot local e eventos de peers se resolvem porque cada
  `voice_state` reidrata o canal inteiro via `voiceMembers`.
- No modo server, escrever `store.voice` no handler do `rtc.js` duplica
  o `dispatch` — mesmo payload, sem efeito colateral identificado.

### Decisões em aberto

- D1 (padrão adotado): canal conectado usa a classe `active` existente
  em vez de classe nova — destaque idêntico ao canal de texto ativo.
  Alternativa: classe dedicada (ex.: `.connected`) com cor própria.
- D2 (padrão adotado): `rtc.channelName` registrado no join para nomes
  fora da comunidade atual, reaproveitado pelo `VoiceBar`. Alternativa:
  manter fallback `'voz'`.
- D3 (padrão adotado): falha de `getUserMedia` na troca mantém o
  comportamento atual (usuário fica desconectado). Alternativa: tentar
  reconectar ao canal anterior — aumenta escopo e complexidade.
- D4 (padrão adotado): `store.voice` sincronizado no `rtc.js` (join,
  leave e handler `VOICE_STATE`), cobrindo P2P sem alterar providers.
  Alternativa: emitir `VOICE_STATE` para a store no provider P2P —
  mexeria no `dispatchP2P`/provider, além do necessário.

Aguardando aprovação da spec para criar as tasks.

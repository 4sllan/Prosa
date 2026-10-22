# Tasks — Confirmação ao trocar de canal de voz (clique simples)

Spec: `docs/specs/voice-channel-switch-confirm.md` (aprovada)
Status geral: concluído

Ordem de execução: T1 → T2 → T3

## T1 - `channelName` no rtc.js e hidratação de `store.voice`

- Status: concluída
- Requisitos/aceite: RF-05 (campo + assinatura), RF-06, RF-07, RF-08,
  RNF-03
- Dependências: nenhuma
- Escopo e arquivos prováveis: `web/src/rtc.js`,
  `web/src/components/VoiceBar.vue`
- Implementação:
  - `rtc` ganha `channelName: null`; `joinVoice(channelId, name)`
    aceita o nome opcional e grava `rtc.channelName = name ?? null`
    antes de setar `rtc.channelId`; `leaveVoice()` zera `channelName`.
  - Handler `VOICE_STATE` do `rtc.js` passa a fazer
    `store.voice[channelId] = members` antes/depois da gerência de
    peers (cobre P2P; no server é redundante com o `dispatch` da store,
    mesmo payload).
  - Após `events.joinVoice(channelId)`, sincronizar o próprio usuário:
    `store.voice[channelId] = (await misc.voiceState(channelId)).members`
    (funciona nos dois providers). Em `leaveVoice()`, remover a entrada
    do próprio usuário de `store.voice` do canal que está sendo deixado
    (ou reidratar via `misc.voiceState`, o que for mais simples e fiel).
  - `VoiceBar.vue`: `channelName` passa a preferir `rtc.channelName`,
    com fallback `store.channels.find(...)?.name || 'voz'`.
  - Importar `misc` de `services/index.js` em `rtc.js` (já importa
    `events` do mesmo módulo).
- Testes e comandos de validação: `npm --prefix web test`,
  `npm run build`, `git diff --check`; revisão do diff.
- Critério de conclusão: `store.voice` reflete o próprio usuário após
  join/leave no modo P2P; `rtc.channelName` gravado/limpo; `VoiceBar`
  usa o nome registrado; sem mudança de contrato nem regressão nos
  toggles.
- Evidências: `web/src/rtc.js` — `channelName: null` no estado `rtc`
  (L9); handler `VOICE_STATE` espelha `store.voice[channelId] = members`
  antes do early-return (L87), cobrindo canais além do conectado no P2P;
  `joinVoice(channelId, name)` grava `rtc.channelName`, chama
  `events.joinVoice` e hidrata `store.voice` via `misc.voiceState`
  (L103-110); `leaveVoice()` remove o próprio usuário de `store.voice`
  do canal deixado e zera `channelName` (L113-124); import de `misc`
  adicionado (L3). `web/src/components/VoiceBar.vue` — `channelName`
  prefere `rtc.channelName` com fallback anterior (L34). Validações:
  `npm --prefix web test` 284/284 passam; `npm run build` ok (vite,
  1.71s); `git diff --check` limpo. Diff revisado: apenas os dois
  arquivos do escopo, sem segredos. No provider P2P, `voiceJoinSelf`
  adiciona o self ao Map local de forma síncrona, então
  `misc.voiceState` retorna o próprio usuário logo após o join; no
  server, o `VOICE_STATE` broadcast reconcilia a corrida REST/WS.

## T2 - Modal de confirmação, gate no clique, destaque e avatar

- Status: concluída
- Requisitos/aceite: RF-01, RF-02, RF-03, RF-04, RF-05 (chamador),
  RF-09, RF-10, RNF-01, RNF-02, RNF-04, CA-01 a CA-04, CA-06, CA-07
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/views/HomeView.vue`
- Implementação:
  - `clickChannel(ch)`: se `ch.type === 'voice'` e `rtc.channelId &&
    rtc.channelId !== ch.id`, preencher `voiceSwitch = { id: ch.id,
    name: ch.name }` e abrir o modal em vez de chamar `joinVoice`. Nos
    demais casos, comportamento atual (`joinVoice(ch.id, ch.name)` —
    passa o nome para o campo novo de T1 — e `mobileChat = true`).
  - Modal inline no padrão existente (`.modal-bg` com `@click.self`,
    `.modal`, `.actions`): título "Trocar de canal de voz?", mensagem
    "Você já está conectado ao canal de voz {{ canalAtual }}. Deseja
    sair dele e entrar no canal {{ voiceSwitch.name }}?", botões
    "Cancelar" (`.btn.ghost`, limpa `voiceSwitch`) e "Confirmar"
    (`.btn.primary`, chama `joinVoice(voiceSwitch.id,
    voiceSwitch.name)`, fecha e mantém `mobileChat = true`).
  - `canalAtual`: `rtc.channelName || store.channels.find(c => c.id ===
    rtc.channelId)?.name || 'canal atual'`.
  - `.chan` de voz: `:class` passa a incluir `active` quando
    `ch.type === 'voice' && rtc.channelId === ch.id` (mantendo a regra
    atual para texto).
  - `.voice-user`: `<img v-if="avatarOf(v.userId)" :src="fullUrl(...)">`
    com fallback para iniciais; helper `avatarOf(uid)` resolve
    `store.user.avatarUrl` (próprio) e `member.user.avatarUrl` (demais).
- Testes e comandos de validação: `npm --prefix web test`,
  `npm run build`, `git diff --check`; revisão do diff.
- Critério de conclusão: modal só aparece na troca entre canais de voz;
  cancelar preserva a conexão; confirmar troca; canal conectado destacado;
  lista exibe avatar/iniciais + nome; textos em pt-BR conforme a spec.
- Evidências: `web/src/views/HomeView.vue` — `voiceSwitch` ref (L220);
  gate em `clickChannel` abre o modal quando `rtc.channelId` difere do
  canal clicado e `joinVoice(ch.id, ch.name)` nos demais casos (L280-282);
  `confirmVoiceSwitch` limpa o estado, executa `joinVoice` com o nome e
  ativa `mobileChat` (L289-295); `currentVoiceName` resolve
  `rtc.channelName` com fallbacks (L266-268); modal inline com
  `.modal-bg`/`@click.self`, título "Trocar de canal de voz?", mensagem
  citando os dois canais e botões Cancelar/Confirmar (L165-172); `.chan`
  de voz recebe `active` quando `rtc.channelId === ch.id` (L48);
  `.voice-user` renderiza `<img>` via `avatarOf`/`fullUrl` com fallback
  de iniciais (L54-57); helper `avatarOf` resolve `store.user.avatarUrl`
  e `member.user.avatarUrl` (L263-265). Validações:
  `npm --prefix web test` 284/284 passam; `npm run build` ok (vite,
  1.75s); `git diff --check` limpo. Diff revisado: escopo restrito ao
  arquivo previsto, sem segredos nem mudanças adjacentes.

## T3 - Validação final e regressão

- Status: concluída
- Requisitos/aceite: CA-01 a CA-08
- Dependências: T1, T2
- Escopo e arquivos prováveis: nenhum arquivo novo; revisão do diff total
- Implementação: revisar o diff completo (escopo, segredos, arquivos
  gerados); conferir que fluxos adjacentes (texto, DMs, toggles de voz,
  saída pelo VoiceBar) estão inalterados.
- Testes e comandos de validação: `npm test` (servidor, por precaução —
  backend inalterado), `npm --prefix web test`, `npm run build`,
  `git diff --check`; roteiro manual da spec (dois perfis/peers: entrar
  em A; clicar em B → cancelar e confirmar; mesma sala → sem modal;
  outra comunidade → nome correto; destaque, avatar e remoção da lista
  ao sair). Registrar observado vs. pendente.
- Critério de conclusão: CAs atendidos ou pendências documentadas
  (teste manual não substituído por build).
- Evidências: automatizado — `npm test` (servidor) 14/14 passam;
  `npm --prefix web test` 284/284 passam; `npm run build` ok (vite);
  `git diff --check` limpo. Diff total revisado: 3 arquivos de frontend
  (`rtc.js` +15/-3 aprox., `VoiceBar.vue` +1/-1, `HomeView.vue`
  +34/-3 aprox.) mais spec e plano — sem segredos, sem mudanças fora de
  escopo; fluxos de texto, DMs e toggles de voz inalterados por inspeção.
  Dev server em `http://localhost:5174` com browser preview aberto para
  smoke manual. **Pendente**: roteiro manual dos CAs (criar comunidade +
  2 canais de voz; entrar em A; clicar em B → cancelar e confirmar;
  mesmo canal → sem modal; destaque, lista de participantes e remoção ao
  sair) — requer permissão de microfone no navegador e, idealmente, um
  segundo peer para CA-05 completo. **Validação manual**: usuário
  confirmou o funcionamento do fluxo no preview durante a validação da
  spec `unified-channels` ("funcionou"), cobrindo a troca de canal com
  modal e a permanência ao cancelar na prática observada.

Plano concluído (T1–T3).

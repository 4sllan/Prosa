# Botão de alto-falante (áudio de saída) nas chamadas

- Status: aprovada
- Data: 2026-10-21

## 1. Objetivo e contexto

Durante chamadas de voz/vídeo, o Prosa (`web/`, Vue 3 + Vite) só permite
silenciar a saída de áudio pelo botão "Surdo" (`toggleDeafen` em
`web/src/rtc.js`), que também muta o microfone. Não existe controle
independente para desligar apenas o alto-falante.

Objetivo: adicionar um botão para ativar/desativar o alto-falante ao lado
do botão do microfone, com ícone que indique claramente o estado atual,
seguindo o padrão visual dos controles existentes.

## 2. Escopo

### Dentro do escopo

- Novo flag `speakerMuted` no estado reativo `rtc` e função
  `toggleSpeaker()` em `web/src/rtc.js`, incluindo reset em `leaveVoice`.
- Silenciar a saída remota: elementos `<video>` remotos do VoiceBar passam
  a respeitar `rtc.deafened || rtc.speakerMuted`.
- Botão em `web/src/components/VoiceBar.vue` (`.voice-controls`), ao lado
  do botão do microfone, com ícone + label e classe `.on` no padrão
  existente.
- Botão somente-ícone em `web/src/views/HomeView.vue` (`.userbar .acts`),
  ao lado do botão do microfone, com `title` dinâmico — espelha o
  comportamento do mic, que pode ser pré-armado fora da chamada.
- Propagação do estado `speakerMuted` via `events.updateVoice` quando em
  canal de voz (mesmo padrão de `muted`/`deafened`).

### Fora do escopo

- Indicador visual do `speakerMuted` de outros participantes nos tiles
  remotos (estado é propagado, mas não renderizado — decisão D2).
- Slider de volume, seleção de dispositivo de saída ou áudio por
  participante.
- Mudanças no comportamento de "Surdo" além da interação definida em
  RF-06.
- Backend, providers, transporte P2P, IPC/Electron: inalterados (o estado
  novo atravessa os contratos existentes como campo adicional do patch de
  voz).

## 3. Estado e fluxo

`rtc.js` hoje mantém `muted`, `deafened`, `video`, `screen`. A saída de
áudio remota é controlada exclusivamente por `:muted="rtc.deafened"` nos
`<video>` do VoiceBar (`rtc.js` L166-171, `VoiceBar.vue` L11).

Após a mudança:

- `rtc.speakerMuted` inicia `false`; `toggleSpeaker()` inverte o flag e,
  quando `rtc.channelId` estiver definido, envia
  `events.updateVoice(rtc.channelId, { speakerMuted: rtc.speakerMuted })`.
- `leaveVoice()` zera `speakerMuted` junto dos demais flags (mesmo padrão
  de `muted`/`deafened`).
- Saída remota fica muda quando `rtc.deafened || rtc.speakerMuted`.

## 4. Requisitos

### Funcionais

- RF-01: `rtc` ganha `speakerMuted: false`; `toggleSpeaker()` inverte o
  flag e propaga `{ speakerMuted }` via `events.updateVoice` quando em
  canal (guarda `rtc.channelId`, como `toggleMute`).
- RF-02: `leaveVoice()` reseta `speakerMuted` para `false`; o flag
  persiste ao entrar em chamada (pré-armado pela userbar, como `muted`).
- RF-03: Cada `<video>` remoto do VoiceBar usa
  `:muted="rtc.deafened || rtc.speakerMuted"`.
- RF-04: Botão no `.voice-controls` posicionado imediatamente após o
  botão do microfone, no mesmo padrão visual: ícone Lucide + label +
  classe `.on` quando o alto-falante está ativo.
- RF-05: Botão somente-ícone no `.userbar .acts` imediatamente após o
  botão do microfone, com `title` dinâmico
  ("Desativar alto-falante" / "Ativar alto-falante").
- RF-06: Ícone reflete o estado: `Volume2` quando ativo, `VolumeX`
  quando desativado (ambos já disponíveis em `lucide-vue-next`; `Volume2`
  já é importado nos dois arquivos).
- RF-07: Interação com "Surdo": ao ativar o alto-falante enquanto
  `rtc.deafened` está ativo, o Surdo é desativado antes (via
  `toggleDeafen()`, preservando a semântica existente de restaurar o
  microfone). Desativar o alto-falante não altera `deafened`.
- RF-08: O toggle de alto-falante não afeta o microfone nem o estado
  `muted`.

### Não funcionais

- RNF-01: Reutilizar apenas as classes CSS existentes
  (`.voice-controls button`/`.on`, `.userbar .acts button`); sem novas
  cores ou estilos.
- RNF-02: Imports nomeados de `lucide-vue-next`; ícones decorativos com
  `aria-hidden="true"`; tamanhos 14px nos controles de voz e 16px na
  userbar, como os vizinhos.
- RNF-03: Sem novas dependências; sem mudança de API REST, WS, providers,
  P2P ou IPC.
- RNF-04: Funciona igualmente nos modos `server` e `p2p` — o campo novo
  trafega no patch de voz existente em ambos.

## 5. Modos, plataformas e UI/UX

- Modos `server` e `p2p`: idênticos. `updateVoiceState` (server) faz
  `Object.assign` do patch sem validar campos; o transporte P2P espalha
  `...state` no evento `voice_state`. Nenhuma mudança necessária.
- Plataformas: web (Vite) e Electron renderer — `muted` em `<video>` é
  comportamento DOM padrão, sem IPC.
- Labels: botão do VoiceBar exibe "Alto-falante" quando ativo e
  "Sem som" quando desativado (espelha o padrão "Microfone"/"Mudo" do
  botão de mic). Ver decisão D3.
- Acessibilidade: `title` dinâmico na userbar; `aria-hidden` nos ícones.

## 6. Contratos afetados

- WS `VOICE_UPDATE` / evento P2P `voice_state`: o patch de estado passa a
  poder incluir `speakerMuted: boolean`. Compatível com clientes antigos,
  que ignoram o campo. Exemplo de payload (server):
  `{ t: 'VOICE_UPDATE', d: { channelId, state: { speakerMuted: true } } }`.
- Nenhum outro contrato afetado (REST, SIGNAL, IPC).

## 7. Estado, persistência e migrações

- Estado novo apenas em memória (`rtc.speakerMuted` no renderer e campo
  transitório no `voiceStates` do servidor, que já é `Map` em memória).
- Não se aplica persistência, schema ou migração.

## 8. Autenticação, autorização e privacidade

- Não se aplica além do padrão existente: o servidor/P2P já retransmite o
  estado de voz apenas a participantes do mesmo canal; `speakerMuted`
  segue o mesmo caminho e não expõe dado sensível adicional.

## 9. Falhas e recuperação

- Falha no envio do `updateVoice` deixa apenas o estado remoto
  desatualizado; o silenciamento local é aplicado no renderer de forma
  síncrona, independente da rede.
- Reconexão reenvia `VOICE_STATE` com o snapshot atual (o campo viaja no
  estado do membro, sem tratamento especial).

## 10. Critérios de aceite

- CA-01 (RF-03, RF-08): Em chamada com outro participante, desativar o
  alto-falante silencia o áudio remoto mantendo o microfone funcionando
  (o outro lado continua ouvindo); reativar restaura o áudio.
- CA-02 (RF-04, RF-05, RF-06): Os dois botões aparecem ao lado do
  respectivo microfone, ícone/label/`title` alternam conforme o estado e
  o padrão visual é idêntico aos controles vizinhos.
- CA-03 (RF-07): Com "Surdo" ativo, ativar o alto-falante desativa o
  Surdo (restaurando o microfone conforme `toggleDeafen`); com
  alto-falante desativado, ativar o Surdo continua mutando o microfone.
- CA-04 (RF-02): Sair da chamada reseta o alto-falante para ativo.
- CA-05: `npm --prefix web test`, `npm run build` e `git diff --check`
  passam; toggles existentes (mic, câmera, tela, surdo) sem regressão.

## 11. Testes, riscos e decisões em aberto

### Estratégia de testes

- Automatizado: `npm --prefix web test` (regressão P2P; não há cobertura
  de `rtc.js`/UI hoje), `npm run build`, `git diff --check`.
- Manual (roteiro): dois clientes em canal de voz — alternar
  alto-falante pelo VoiceBar e pela userbar; verificar silêncio da saída,
  microfone intacto no outro lado, interação com Surdo (CA-03) e reset
  ao sair (CA-04). Registrar o que foi efetivamente observado.

### Riscos

- Baixo. Mudança isolada no renderer; o único ponto sutil é a interação
  com `deafened` (coberta por RF-07/CA-03).
- `speakerMuted` propagado sem renderização remota é campo inerte hoje —
  mantido por consistência com `muted`/`deafened` e por custo zero.

### Decisões em aberto

- D1 (padrão adotado): botão adicionado nos dois lugares com botão de
  microfone — VoiceBar e userbar. Alternativa: apenas VoiceBar.
- D2 (padrão adotado): estado propagado aos demais participantes, sem
  indicador remoto nesta entrega.
- D3 (padrão adotado): labels "Alto-falante"/"Sem som" e ícones
  `Volume2`/`VolumeX`. Alternativa: label fixo "Alto-falante" mudando só
  o ícone.
- D4 (padrão adotado): ativar o alto-falante com Surdo ativo desativa o
  Surdo. Alternativa: flags totalmente independentes.

Aguardando aprovação da spec para criar as tasks.

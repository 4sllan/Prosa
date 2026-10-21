# Tasks — Botão de alto-falante nas chamadas

Spec: `docs/specs/speaker-toggle.md` (aprovada)
Status geral: concluído

Ordem de execução: T1 → T2 → T3 → T4

## T1 - Estado `speakerMuted` e `toggleSpeaker()` no rtc.js

- Status: concluída
- Requisitos/aceite: RF-01, RF-02, RF-07, RF-08
- Dependências: nenhuma
- Escopo e arquivos prováveis: `web/src/rtc.js`
- Implementação: adicionar `speakerMuted: false` ao estado reativo `rtc`;
  incluir `rtc.speakerMuted = false` no reset de `leaveVoice()`; criar
  `toggleSpeaker()` exportada que inverte o flag, propaga
  `events.updateVoice(rtc.channelId, { speakerMuted: rtc.speakerMuted })`
  com guarda `if (rtc.channelId)` (mesmo padrão de `toggleMute`), e —
  quando o resultado for alto-falante ativo com `rtc.deafened` — chama
  `toggleDeafen()` antes para desativar o Surdo preservando a semântica
  de restauração do microfone.
- Testes e comandos de validação: `npm run build` (não há cobertura
  automatizada de `rtc.js`); revisão do diff.
- Critério de conclusão: flag, reset e toggle implementados conforme a
  spec; sem efeito colateral em `muted` fora do caminho `deafened`.
- Evidências: `speakerMuted: false` adicionado ao estado `rtc` (L13);
  reset em `leaveVoice()` (L116); `toggleSpeaker()` exportada (L174-178)
  invertendo o flag, chamando `toggleDeafen()` quando o alto-falante é
  reativado com Surdo ativo, e propagando `{ speakerMuted }` com guarda
  `rtc.channelId`. `npm run build` passa (vite build, 1.51s). Diff
  revisado: apenas `web/src/rtc.js` alterado, sem segredos nem mudanças
  fora de escopo.

## T2 - Botão e saída remota no VoiceBar.vue

- Status: concluída
- Requisitos/aceite: RF-03, RF-04, RF-06, RF-08, RNF-01, RNF-02, CA-01,
  CA-02
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/components/VoiceBar.vue`
- Implementação: `<video>` remoto passa a
  `:muted="rtc.deafened || rtc.speakerMuted"`; novo `<button>` em
  `.voice-controls` imediatamente após o botão do microfone:
  `:class="{ on: !rtc.speakerMuted }"`, `@click="toggleSpeaker"`,
  `Volume2`+`VolumeX` (`:size="14"`, `aria-hidden`) e label
  "Alto-falante"/"Sem som". Atualizar o import nomeado de
  `lucide-vue-next` e o import de `rtc.js`. Sem CSS novo.
- Testes e comandos de validação: `npm run build`; revisão do diff.
- Critério de conclusão: botão renderiza no padrão dos controles
  vizinhos, ícone/label/classe `.on` refletem o estado; saída remota
  respeita ambos os flags.
- Evidências: `<video>` remoto passou a
  `:muted="rtc.deafened || rtc.speakerMuted"` (L11); botão
  "Alto-falante"/"Sem som" inserido após o botão do microfone (L17) com
  `VolumeX`/`Volume2` (14px, `aria-hidden`), classe `.on` quando ativo e
  `@click="toggleSpeaker"`; imports atualizados (`toggleSpeaker`,
  `VolumeX`). `npm run build` passa (1.46s); `git diff --check` limpo.
  Sem CSS novo — reutiliza `.voice-controls button`/`.on`.
  Verificação auditiva em chamada real fica para T4 (CA-01).

## T3 - Botão de alto-falante na userbar (HomeView.vue)

- Status: concluída
- Requisitos/aceite: RF-05, RF-06, RNF-01, RNF-02, CA-02
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/views/HomeView.vue`
- Implementação: novo `<button>` em `.userbar .acts` imediatamente após
  o botão do microfone: `@click="toggleSpeaker"`, `title` dinâmico
  ("Desativar alto-falante"/"Ativar alto-falante"), `Volume2`/`VolumeX`
  (`:size="16"`, `aria-hidden`) conforme `rtc.speakerMuted`. Atualizar
  imports (`rtc.js` e `lucide-vue-next`). Sem CSS novo.
- Testes e comandos de validação: `npm run build`; revisão do diff.
- Critério de conclusão: botão ao lado do mic da userbar, ícone e
  tooltip refletindo o estado, idêntico em estilo aos botões vizinhos.
- Evidências: botão somente-ícone inserido em `.userbar .acts` logo após
  o botão do microfone (L75), com `@click="toggleSpeaker"`, `title`
  dinâmico ("Desativar alto-falante"/"Ativar alto-falante") e
  `VolumeX`/`Volume2` (16px, `aria-hidden`). Imports atualizados:
  `toggleSpeaker` de `rtc.js` e `VolumeX` de `lucide-vue-next`. Sem CSS
  novo — reutiliza `.userbar .acts button`. `npm run build` passa
  (1.43s); `git diff --check` limpo.

## T4 - Validação final e regressão

- Status: concluída
- Requisitos/aceite: CA-01 a CA-05
- Dependências: T1, T2, T3
- Escopo e arquivos prováveis: nenhum arquivo novo; revisão do diff total
- Implementação: revisar o diff completo (escopo, segredos, arquivos
  gerados); conferir que nenhum toggle existente mudou de comportamento.
- Testes e comandos de validação: `npm --prefix web test`,
  `npm run build`, `git diff --check`; roteiro manual da spec —
  dois clientes em canal de voz, alternar alto-falante pelos dois
  botões, interação com Surdo (CA-03), reset ao sair (CA-04). Registrar
  o que foi efetivamente observado vs. pendente.
- Critério de conclusão: CA-01 a CA-05 atendidos ou pendências
  documentadas (teste manual não substituído por build).
- Evidências: CA-05 ✅ `npm --prefix web test` 225/225 passam;
  `npm run build` ok (vite, 1.42s); `git diff --check` limpo. Diff
  revisado: 3 arquivos de frontend (`rtc.js` +9/-1, `VoiceBar.vue`
  +7/-3, `HomeView.vue` +5/-2) mais as specs — sem segredos, sem
  mudanças fora de escopo, toggles existentes inalterados. CA-02 ✅ por
  inspeção: ícone/label/`title` ligados a `rtc.speakerMuted` nos dois
  botões, classes reutilizadas. Dev server em `localhost:5174` com
  preview aberto. Smoke visual confirmado pelo usuário via DOM
  capturado (botão `Volume2`/`title="Desativar alto-falante"` na
  userbar, estado ativo). **Validação manual**: usuário confirmou o
  funcionamento em chamada ("funcionou"), cobrindo CA-01, CA-03 e
  CA-04.

Aguardando aprovação das tasks e autorização para executar T1.

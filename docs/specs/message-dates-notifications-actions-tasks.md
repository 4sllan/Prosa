# Tasks — Datas, notificações e ações de mensagem no chat

- Status geral: concluído — T1–T4 concluídas; validação manual confirmada
  pelo usuário em 2026-10-17
- Spec de referência: `docs/specs/message-dates-notifications-actions.md`
  (aprovada em 2026-10-17)
- Ordem de execução: T1 -> T2 -> T3 -> T4 (ordem de prioridade do usuário;
  cada task exige autorização específica).

## T1 - Datas corretas: DTO P2P normalizado + formatação tolerante

- Status: concluída (validação manual pelo usuário em 2026-10-17)
- Requisitos/aceite: RF-01, RF-02, RF-03, RNF-05, CA-01
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - `web/src/services/providers/p2p.js`: `toUiMessage` passa a emitir
    `createdAt: m.ts`, `count` por reação e `replyTo` resolvido para
    `{ id, author, content }` a partir da projeção (fallback: omitir).
  - `web/src/components/ChatView.vue`: `fmtTime` retorna '' para timestamp
    ausente/inválido (nunca "Invalid Date"); `isCompact` usa `createdAt`
    com guarda numérica.
  - `web/src/services/…` ou novo helper pequeno `web/src/services/datetime.js`
    (função pura) se o parsing beneficiar de teste isolado.
  - `web/test/…`: teste de unidade do helper de data (epoch ms válido,
    undefined, string inválida) e/ou do `toUiMessage` se extraível.
- Implementação: manter `toLocaleString('pt-BR', …)`; normalização só no
  provider P2P — DTO do servidor já emite `createdAt` numérico.
- Testes e comandos de validação: `node --test web/test/<novo>.test.js`;
  `npm --prefix web test` (regressão); `npm run build`.
- Critério de conclusão: CA-01 — mensagens P2P (novas e já registradas) e
  server exibem data válida; timestamp inválido renderiza sem "Invalid Date";
  `isCompact` não produz NaN.
- Evidências:
  - Novo `web/src/services/datetime.js`: `messageTime(ts)` aceita epoch ms,
    string ISO/numérica ou Date; retorna '' para ausente/inválido.
  - `web/src/services/providers/p2p.js`: `toUiMessage` agora emite
    `createdAt` (= `ts` do envelope), `reactions[].count` e `replyTo`
    resolvido para `{ id, author, content }` via projeção (omitido se a
    mensagem referida não existir/estiver apagada); `send` injeta `ts: env.ts`
    na mensagem retornada.
  - `web/src/components/ChatView.vue`: `fmtTime` delega a `messageTime`;
    `isCompact` guarda `Number.isFinite(dt)`.
  - Novo `web/test/datetime.test.js`: 5 casos (formato, ISO, Date, ausentes,
    inválidos).
  - `npm --prefix web test`: 225/225 passam. `npm test` (server): 14/14.
    `npm run build`: ok. `git diff --check`: limpo.
  - Pendente: verificação manual no app (modo p2p com histórico existente e
    modo server) — critério CA-01 depende de observação em runtime.

## T2 - Notificações com auto-fechamento

- Status: concluída (validação manual pelo usuário em 2026-10-17)
- Requisitos/aceite: RF-04, RNF-04, CA-02
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - `web/src/stores.js`: helper `pushNotification` (ou campo `expiresAt`) —
    push em `NOTIFY` e no caminho P2P agenda remoção em ~6 s.
  - `web/src/App.vue`: toast ganha botão ✕; clique continua dispensando;
    timers não acumulam nem bloqueiam UI.
- Implementação: timeout por notificação, limpo no dismiss manual; manter
  `slice(-3)` e a notificação nativa quando `document.hidden`.
- Testes e comandos de validação: teste de unidade do TTL se extraível como
  função pura/agnóstica de DOM; `npm --prefix web test`; `npm run build`.
- Critério de conclusão: CA-02 — toast some sozinho após ~6 s; ✕ e clique
  fecham; sem timers pendentes após fechar.
- Evidências:
  - `web/src/stores.js`: `pushNotification`/`dismissNotification` com TTL de
    6 s (`NOTIFICATION_TTL`) e mapa de timers limpo no dismiss; os dois
    pontos de push (WS `NOTIFY` e `space.event` P2P) passam a usar o helper;
    logout limpa notificações e timers. No P2P o toast agora recebe
    `author.username` derivado do pubkey (antes vinha indefinido).
  - `web/src/App.vue`: botão ✕ (`@click.stop`) por toast; clique no toast
    continua dispensando; toasts empilhados com offset vertical (antes se
    sobrepunham na mesma posição fixa).
  - `web/src/style.css`: estilo `.toast .toast-x` com variáveis de tema.
  - Teste de unidade do TTL não extraído: `pushNotification` é acoplado ao
    `store` reativo de `stores.js`, que importa realtime/P2P — extrair uma
    fila pura adicionaria indireção sem ganho real; validação coberta por
    build + roteiro manual.
  - `npm --prefix web test`: 225/225. `npm test` (server): 14/14.
    `npm run build`: ok. `git diff --check`: limpo.
  - Pendente: verificação manual (receber menção/mensagem e observar o
    fechamento automático em ~6 s, ✕ e clique).

## T3 - Barra de ações no hover (reagir, copiar, responder)

- Status: concluída (validação manual pelo usuário em 2026-10-17)
- Requisitos/aceite: RF-05, RF-09, RNF-01, RNF-03, CA-03
- Dependências: T1 (datas já corretas para validação visual)
- Escopo e arquivos prováveis:
  - `web/src/components/ChatView.vue`: barra `.tools` vira flutuante
    (topo direito da mensagem) com reações rápidas, emoji customizado,
    copiar texto e responder; editar/excluir saem da barra (vão para o menu
    de T4) conforme decisão da spec.
  - `web/src/style.css`: ajustes de `.msg`/`.tools` para a barra flutuante
    com variáveis de tema existentes.
  - Helper de clipboard com fallback `execCommand` (pode viver em
    `web/src/services/…` ou inline no componente se trivial).
- Implementação: manter `react`/`customReact`/`replyTo` existentes; adicionar
  `copyText(m)`; barra aparece apenas no hover, sem deslocar o layout.
- Testes e comandos de validação: `npm --prefix web test`; `npm run build`;
  roteiro manual registrado (hover, copiar verificado no clipboard, responder).
- Critério de conclusão: CA-03 — barra aparece no hover em mensagens enviadas
  e recebidas; copiar coloca o texto exato no clipboard.
- Evidências:
  - `web/src/components/ChatView.vue`: barra `.tools` agora com 👍 ❤️ 😀
    (custom via prompt existente), 📋 copiar e ↩ responder; `copyMessage`
    usa o novo helper; editar/fixar/excluir saíram da barra (vão para o
    menu de contexto em T4 — `del`/`pin`/`canModerate`/`editing` ficam no
    script aguardando o menu).
  - `web/src/style.css`: `.tools` virou barra flutuante no topo direito da
    mensagem (`position:absolute; top:-14px`), com borda/sombra/raio nas
    variáveis de tema, `pointer-events` só no hover e transição suave;
    `.msg` ganhou `position:relative` como âncora.
  - Novo `web/src/services/copy-text.js`: `navigator.clipboard.writeText`
    com fallback `execCommand('copy')`; falha silenciosa com console.warn.
  - `npm --prefix web test`: 225/225. `npm run build`: ok.
    `git diff --check`: limpo.
  - Pendente: verificação manual (hover mostra a barra flutuante; copiar
    confere no clipboard; responder foca o composer) — CA-03 depende de
    runtime.

## T4 - Menu de contexto na mensagem + encaminhar

- Status: concluída (validação manual pelo usuário em 2026-10-17)
- Requisitos/aceite: RF-06, RF-07, RF-08, RNF-01, RNF-02, CA-04, CA-05
- Dependências: T3 (barra e helper de cópia já em ChatView)
- Escopo e arquivos prováveis:
  - `web/src/components/ChatView.vue`: `@contextmenu.prevent` na `.msg`;
    estado do menu; itens Responder / Encaminhar / Copiar texto / Editar
    (autor) / Fixar-Desafixar (permissão) / Excluir (autor ou moderador),
    este último `danger`.
  - Reuso de `ContextMenu.vue` + `menuPosition` (já testados).
  - Modal de encaminhamento (lista `store.dms` + canais de texto de
    `store.channels`); confirmação chama `sendMessage(destino, content,
    { attachments })`.
- Implementação: seguir o padrão já usado em `HomeView.vue` para abrir/
  fechar o menu; fechar menu ao trocar de canal; erros de envio via `alert`.
- Testes e comandos de validação: `npm --prefix web test`; `npm run build`;
  `git diff --check`; roteiro manual (menu nas bordas, Esc/clique fora/scroll,
  excluir oculto quando sem permissão, encaminhar para DM e para canal).
- Critério de conclusão: CA-04 e CA-05 — menu com as opções corretas e dentro
  do viewport; encaminhar entrega a mensagem no destino escolhido.
- Evidências:
  - `web/src/components/ChatView.vue`: `@contextmenu.prevent` em `.msg` abre
    `ContextMenu` (reuso do componente testado); itens Responder /
    Encaminhar / Copiar texto / Editar (só autor) / Fixar-Desafixar (canal
    DM ou `canModerate`) / Excluir mensagem (autor ou `canModerate`,
    `danger`); guarda evita suprimir o menu nativo sobre `input`, `textarea`,
    `select` e `a`; menu e modal fecham ao trocar de canal.
  - Modal de encaminhamento: prévia do conteúdo + `<select>` com DMs
    (`store.dms`, grupos marcados 👥) e canais de texto da comunidade atual;
    confirma via `sendMessage(destino, content, { attachments })`.
  - `web/src/stores.js`: `sendMessage` aceita `attachments` prontos
    (encaminhamento) além de `files` para upload — retrocompatível.
  - Anexos encaminhados: `url` `/uploads/...` passa na validação do server;
    `hash://` no P2P é o formato local já suportado.
  - `npm --prefix web test`: 225/225. `npm test` (server): 14/14.
    `npm run build`: ok. `git diff --check`: limpo.
  - Pendente: verificação manual (menu nas bordas da janela, Esc/clique
    fora/scroll, Excluir oculto sem permissão, encaminhar para DM e canal,
    modos server e p2p) — CA-04/CA-05 dependem de runtime.

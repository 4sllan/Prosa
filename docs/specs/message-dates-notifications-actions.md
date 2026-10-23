# Spec — Datas, notificações e ações de mensagem no chat

- Status: aprovada (2026-10-17; decisões em aberto mantidas nos defaults
  propostos: encaminhamento sem marca, TTL de 6 s, barra de hover enxuta com
  editar/fixar/excluir no menu de contexto)
- Data: 2026-10-17
- Escopo: frontend Vue (`web/src`), provider P2P (`web/src/services/providers/p2p.js`)

## 1. Objetivo e contexto

O chat do Prosa apresenta quatro problemas/lacunas no sistema de mensagens:

1. Mensagens exibem `Invalid Date` no lugar da data/hora (evidência: modo `p2p`,
   onde `toUiMessage` emite `ts` mas não o campo `createdAt` consumido pela UI).
2. Toasts de notificação de mensagem ficam presos na tela — só saem no clique.
3. A barra de ações no hover existe (`.msg .tools`), mas não oferece copiar
   texto e não segue o padrão visual de referência (barra flutuante estilo
   WhatsApp).
4. Não existe menu de contexto (botão direito) sobre mensagens; o componente
   `ContextMenu.vue` já existe e é usado apenas na lista de amigos.

Objetivo: corrigir datas e notificações e completar as interações de mensagem
(hover + menu de contexto com Responder / Encaminhar / Copiar texto / Excluir),
nos modos `server` e `p2p`, sem mudar contratos externos.

## 2. Escopo e fora de escopo

Dentro do escopo:

- Normalização do DTO de mensagem do provider P2P (`createdAt`, `count` de
  reações, `replyTo` resolvido para `{ id, author, content }`).
- Formatação de data/hora tolerante a valores ausentes/inválidos.
- Auto-fechamento de toasts de notificação com TTL e botão de fechar.
- Barra de ações no hover com reações rápidas, copiar e responder (mais
  editar/excluir quando permitido), visual flutuante consistente com o tema.
- Menu de contexto na mensagem reutilizando `ContextMenu.vue` +
  `menuPosition`.
- Encaminhar como reenvio de conteúdo (e anexos) para conversa/canal
  escolhido em modal, via `messages.send` existente.

Fora de escopo:

- Novos endpoints REST, eventos WS, tipos de evento P2P, IPC do Electron ou
  mudanças de schema SQLite.
- Marcação "Encaminhada" / atribuição de origem da mensagem encaminhada
  (exigiria campo novo no modelo; ver decisões em aberto).
- Editor de emoji completo (picker com busca); mantém-se o prompt existente
  para emoji customizado.
- Notificações nativas do SO além do comportamento já existente.

## 3. Requisitos

### Funcionais

- RF-01: Toda mensagem (enviada ou recebida, modo `server` ou `p2p`) exibe
  data e hora corretas no fuso local do usuário, no formato já usado
  (`dd/mm hh:mm`, `pt-BR`).
- RF-02: `createdAt` (epoch ms, número) é o campo canônico do DTO de UI;
  cada provider garante o campo preenchido.
- RF-03: Timestamp ausente/inválido nunca renderiza `Invalid Date`; a UI
  omite a hora nesse caso (fallback seguro).
- RF-04: Toasts de notificação fecham automaticamente após o TTL definido
  (~6 s), ao clicar no toast ou no botão ✕; no máximo 3 simultâneos e sem
  timers acumulados após fechar.
- RF-05: Ao passar o mouse sobre uma mensagem, uma barra flutuante oferece:
  reagir com emoji rápido, abrir reação customizada, copiar o texto da
  mensagem e responder. Editar e excluir aparecem apenas quando permitidos
  (autor; excluir também para moderador no modo `server`).
- RF-06: Botão direito sobre uma mensagem abre menu de contexto com:
  Responder, Encaminhar, Copiar texto e Excluir mensagem (este último só
  quando a exclusão é permitida).
- RF-07: Encaminhar abre modal listando destinos disponíveis (DMs e canais
  de texto da comunidade atual); ao confirmar, o conteúdo — e anexos, se
  houver — é enviado via `messages.send` ao destino.
- RF-08: O menu de contexto nunca fica cortado ou fora do viewport (clamping
  via `menuPosition`) e fecha por Esc, clique fora, scroll, resize ou
  seleção.
- RF-09: Copiar usa `navigator.clipboard.writeText` com fallback para
  `execCommand('copy')` quando a API assíncrona não estiver disponível.

### Não funcionais

- RNF-01: Visual e comportamento consistentes com a identidade do Prosa
  (variáveis de tema `--bg-side`, `--border`, `--fg`, `--fg-dim`,
  `--accent`, `--danger`, raios e sombras existentes).
- RNF-02: Nenhuma mudança de contrato externo: REST, WS, eventos P2P, IPC e
  schema permanecem como estão.
- RNF-03: Compatível com Windows, macOS e Linux (sem APIs específicas de SO;
  clipboard usa API web padrão com fallback).
- RNF-04: Não interferir no tempo real: listeners/timers criados são limpos
  ao fechar menu/toast ou desmontar componente.
- RNF-05: Agrupamento visual (`isCompact`) e ordenação continuam corretos
  após a normalização de `createdAt`.

## 4. Modos e plataformas

- Modo `server`: comportamento atual de datas já correto; ganha tolerância a
  timestamp inválido e as novas ações/menus. Permissão de excluir segue
  `m.author.id === store.user.id || canModerate` (backend valida de novo).
- Modo `p2p`: `toUiMessage` passa a emitir `createdAt: m.ts`,
  `reactions[].count = users.length` e `replyTo` resolvido a partir da
  projeção (id → `{ id, author, content }` resumido). Permissão de excluir:
  autor ou admin do espaço (convergência já garante autoridade).
- Plataformas: web e Electron (Windows/macOS/Linux) — apenas APIs web
  padrão.

## 5. Contratos afetados

- DTO interno de UI do provider P2P (`toUiMessage`): acrescenta `createdAt`,
  `count` por reação e `replyTo` no formato `{ id, author, content }`.
  Alinhamento com o `messageDto` do servidor — nenhum campo removido.
- Não se aplica a novos endpoints, payloads WS, envelopes P2P ou IPC — o
  encaminhamento reutiliza `messages.send(channelId, { content,
  replyTo, attachments })` já existente; anexos encaminhados mantêm `url`
  (`/uploads/...` no server passa na validação; `hash://` no P2P já é o
  formato local).

## 6. Estado, persistência e migrações

Não se aplica: nenhuma migração nem mudança de persistência. O evento P2P
`message.send` já carrega `ts` no envelope; a projeção existente basta para
derivar `createdAt` — dados antigos passam a exibir data correta sem
reprocessamento.

## 7. Autenticação, autorização e validação

- Excluir: UI só oferece a ação quando autor ou moderador/admin; backend
  (`server`) e convergência (`p2p`) já revalidam — a UI não é a fronteira de
  segurança.
- Editar: apenas o autor (já validado nos dois modos).
- Encaminhar: destinos limitados a conversas/canais onde o usuário pode
  enviar; regras de slowmode/limite do backend seguem valendo no envio.
- Privacidade: toasts continuam exibindo apenas remetente e trecho do
  conteúdo, como hoje.

## 8. Falhas e recuperação

- Clipboard indisponível/negado: fallback `execCommand`; se ambos falharem,
  falha silenciosa com console.warn (não bloqueia a UI).
- Falha no envio do encaminhamento: erro propagado ao usuário via `alert`/
  toast, padrão já usado no composer.
- Timers de toast são limpos ao dispensar manualmente e no unmount.
- Reconexão/offline: não se aplica — sem mudanças em realtime.

## 9. Critérios de aceite

- CA-01 (RF-01..03): no modo `p2p`, mensagens novas e já registradas exibem
  data/hora válida; no modo `server` idem; nenhuma renderiza `Invalid Date`.
- CA-02 (RF-04): toast desaparece sozinho após o TTL; ✕ e clique também
  fecham; toasts não acumulam timers nem bloqueiam cliques na UI.
- CA-03 (RF-05): hover sobre mensagem exibe a barra; "copiar" coloca o
  texto exato na área de transferência; reagir e responder funcionam em
  mensagens enviadas e recebidas.
- CA-04 (RF-06, RF-08): botão direito abre o menu com as 4 opções; Excluir
  ausente quando não permitido; menu permanece dentro do viewport inclusive
  perto das bordas; fecha por todos os caminhos previstos.
- CA-05 (RF-07): encaminhar envia o conteúdo ao destino escolhido e a
  mensagem aparece na conversa/canal de destino.
- CA-06 (RNF-04): suites existentes passam (`npm test`,
  `npm --prefix web test`) e `npm run build` conclui sem erros.

## 10. Testes e riscos

- Automatizados: função pura de formatação/parsing de timestamp e helper de
  TTL de notificações em `web/test/` (padrão `node --test` existente);
  regressão das duas suites; `npm run build`; `git diff --check`.
- Manual (web/Electron): hover, copiar, responder, menu de contexto nas
  bordas da janela, encaminhar para DM e canal, toasts expirando, nos modos
  `server` e `p2p`.
- Riscos: `replyTo` em P2P referencia mensagem fora da projeção (apagada ou
  ainda não sincronizada) — fallback: omitir a prévia de resposta; encaminhar
  anexos `hash://` no P2P depende do peer ter o arquivo — limitação já
  existente do transporte, não introduzida aqui.

## 11. Decisões em aberto

- Encaminhamento sem marca "Encaminhada" (reenvio simples do conteúdo).
  Adicionar a marca exigiria campo novo no modelo — fora de escopo.
- TTL do toast proposto: 6 segundos.
- Ações na barra de hover: reagir (👍 ❤️ 😀), copiar, responder; editar,
  fixar e excluir ficam no menu de contexto (mantidos também na barra apenas
  se a revisão pedir paridade com a barra atual).

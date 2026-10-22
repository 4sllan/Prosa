# Plano — Convidar amigo para comunidade

- Status geral: em andamento
- Spec de referência: `docs/specs/invite-friend-to-community.md` (aprovada)
- Ordem de execução: T1 → T2 (T2 depende da operação do Service Layer de T1)

## T1 - `communities.inviteMember` no Service Layer (P2P) + notify de `space_invite`

- Status: concluida
- Requisitos/aceite: RF-04, RF-05, RF-06, RF-07, RF-08; CA-03 (parte P2P),
  CA-05, CA-06, CA-08
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - `web/src/services/p2p/spaces.js` — helper `inviteToSpace(identity,
    spaceId, userId)` (ou nome análogo) encapsulando: guarda de admin
    (`sp.admins`), no-op informativo se já membro, `emitEvent` de
    `member.add`, `joinSpace`, broadcast e envio de `space_invite` com
    genesis re-emitido pelo convidante (mesmo formato de
    `createInvite` do provider: `seq:1`, `body.admins`/`body.members`
    atuais, assinado pelo convidante).
  - `web/src/services/providers/p2p.js` — `communities.inviteMember(id, uid)`
    delegando ao helper + melhor-esforço `sendNotify(uid, { kind:
    'space_invite', genesis })` quando `sendToPeer` não entregar (fila).
  - `web/src/services/providers/server.js` — `inviteMember:
    notImpl('communities.inviteMember')`.
  - `web/src/services/p2p/contacts.js` — `handleHubNotify` reconhece
    `kind === 'space_invite'` e chama `acceptSpaceInvite(msg.genesis,
    getLocalStore())`; o evento de mudança emitido ao store deve ser
    `spaces.changed` (não `contacts.changed`) — ajustar retorno/contrato do
    handler ou o dispatch em `node.js` para diferenciar.
  - `web/test/p2p.test.js` — regressão.
- Implementação:
  - Ordem no helper: validar espaço e admin → se `sp.members.has(uid)`
    retornar `{ ok: true, already: true }` → `emitEvent(member.add)` →
    `broadcast` aos membros atuais → `joinSpace(spaceId, uid)` → montar e
    assinar genesis com a lista já atualizada → `sendToPeer(uid,
    'space_invite', { spaceId, genesis }, spaceId)`; retorno do `sendToPeer`
    decide o fallback de notify no provider.
  - `member.add` é persistido e espelhado via `mirrorEvent` pelo caminho
    existente (`localListener` em `node.js`) — nada a adicionar.
  - Idempotência: `acceptSpaceInvite` já retorna espaço conhecido;
    `member.add` repetido cai na dedupe por autor/seq — manter.
- Testes e comandos de validação:
  - Novos testes em `web/test/p2p.test.js` com identidades/stores
    descartáveis: (a) admin convida → `member.add` aplicado e convidado
    aplica genesis via `acceptSpaceInvite`, figurando como membro;
    (b) `member.add` de não-admin sobre terceiro é ignorado pela projeção;
    (c) `space_invite`/`acceptSpaceInvite` duplicado é no-op; (d) convite de
    já-membro retorna `already` sem emitir evento.
  - `npm --prefix web test`, `git diff --check`.
- Critério de conclusão: operação disponível no Service Layer com guardas e
  entrega implementadas; testes novos verdes junto da suite existente.
- Evidências:
  - Arquivos alterados:
    - `web/src/services/p2p/spaces.js` — novo `inviteToSpace(identity,
      spaceId, userId)`: guarda de espaço desconhecido, DM e admin; no-op
      `{already:true}` para já-membro; `member.add` + broadcast aos membros
      atuais; `joinSpace` e `space_invite` com genesis re-emitido via
      `makeSignedEnvelope` (assinatura verificável por `verifyEnvelope`,
      sem persistir no log local).
    - `web/src/services/providers/p2p.js` — `communities.inviteMember`:
      delega a `inviteToSpace`; quando a entrega imediata falha, melhor-
      esforço `sendNotify(uid, {kind:'space_invite', genesis})` pelo hub.
    - `web/src/services/providers/server.js` — `inviteMember` lança erro
      tipado "indisponível no modo server".
    - `web/src/services/p2p/node.js` — `onNotify` reconhece
      `kind:'space_invite'` antes de `handleHubNotify` e emite
      `spaces.changed` (variante de dispatch no próprio node, prevista no
      escopo; `contacts.js` permanece restrito a contatos).
    - `web/test/p2p.test.js` — 3 testes novos.
  - `npm --prefix web test`: **299/299 pass**, 0 fail.
  - `git diff --check`: limpo.
  - Cobertura dos testes novos: inserção por admin converge e o genesis
    entregue recria o espaço no lado do convidado (admins preservados,
    convidado como membro, assinatura válida); `space_invite` duplicado é
    no-op; não-admin é rejeitado antes de emitir; DM recusa membros
    adicionais; já-membro é no-op sem evento novo; `member.add` de
    não-admin sobre terceiro é ignorado pela projeção.
  - Não coberto por teste automatizado: o envio real do notify pelo hub
    (depende de Supabase configurado) — caminho melhor-esforço, idempotente
    por `acceptSpaceInvite`.

## T2 - Modal de seleção de comunidade no menu de contexto de amigo

- Status: concluida
- Requisitos/aceite: RF-01, RF-02, RF-03; CA-01, CA-02, CA-03 (parte UI),
  CA-07, CA-09; RNF-03
- Dependências: T1 (`communities.inviteMember` disponível)
- Escopo e arquivos prováveis:
  - `web/src/views/HomeView.vue` — estado do modal (`inviteFor` = userId do
    amigo alvo), lista computada de espaços elegíveis, modal inline no
    template e handler em `onFriendMenuSelect` para `value === 'invite'`.
- Implementação:
  - `onFriendMenuSelect`: `invite` → `inviteFor.value = menu.value.userId`
    (o `ContextMenu` já se fecha sozinho via `pick` → `close`).
  - Modal `.modal-bg`/`.modal` como os demais: título "Convidar <nome do
    amigo> para comunidade"; itens derivados de `store.communities` (mesmos
    espaços do rail, `type !== 'dm'`) com avatar/iniciais via
    `fullUrl(iconUrl)`/`initials`; cada item desabilitado quando
    `c.members` já inclui o amigo ("já é membro") ou `c.myRole !== 'owner'`
    ("apenas administradores podem convidar"); estado vazio dedicado;
    `@keydown.esc` e `@click.self` para fechar.
  - Confirmar → `await communities.inviteMember(c.id, inviteFor)`; sucesso
    fecha o modal e registra feedback via `pushNotification` (infra de
    notificação existente em `stores.js`); erro `alert(e.message)`/mensagem
    no modal sem fechá-lo.
  - Remover `invite` do comentário de "aguardam features" em
    `onFriendMenuSelect`.
- Testes e comandos de validação:
  - `npm run build`, `git diff --check`.
  - Roteiro manual/headless: menu de contexto em amigo de RODAS → modal
    abre com alvo correto; itens desabilitados mostram o motivo; confirmar
    insere e fecha; Esc/backdrop/cancelar fecham; erro permanece visível.
    Registrar o observado (CDP/headless aceitável, como em tasks anteriores).
- Critério de conclusão: fluxo ponta a ponta funciona no P2P para amigo
  online; estados e motivos corretos; build limpo.
- Evidências:
  - Arquivos alterados:
    - `web/src/views/HomeView.vue` — estado `inviteFor`/`inviteBusy`/
      `inviteError`; `invite` em `onFriendMenuSelect` abre o modal (removido
      do comentário de features pendentes); computeds `inviteFriend` e
      `inviteSpaces` (motivos "já é membro" / "apenas administradores podem
      convidar"); modal inline `.modal-bg`/`.modal` com lista, estado vazio,
      erro e Cancelar; `inviteTo` chama `communities.inviteMember`, fecha com
      `pushNotification({type:'invite', text})` e mantém erro no modal;
      `watch(inviteFor)` registra Esc com `onCleanup` (sem listener
      acumulado); estilos scoped `.invite-list`/`.invite-item`/`.invite-why`/
      `.invite-err` nos tokens existentes.
    - `web/src/App.vue` — toast aceita `n.text` genérico (menções intactas),
      necessário para o feedback de sucesso via `pushNotification`.
  - `npm run build`: ok (aviso de chunk >500 kB preexistente).
  - `git diff --check`: limpo.
  - Headless: Chrome `--headless=new` + CDP contra Vite dev
    (`localhost:5175`), perfil limpo `/tmp/prosa-cdp-invite`, script
    `/tmp/cdp-invite-check.mjs` via `Runtime.evaluate` — amigo e comunidade
    semeados pelos próprios módulos da página (`putContact` +
    `communities.create`), identidade P2P real do bootstrap:
    - Menu de contexto em RODAS → item "Convidar para comunidade" abre o
      modal com título "Convidar Amigo Teste para comunidade" (CA-01).
    - Comunidade listada habilitada; confirmar executa `inviteMember`:
      `getSpace(cid).members.has(friend) === true`, modal fecha e toast
      "Amigo Teste adicionado a Comunidade Convite" aparece (CA-03).
    - Reabrindo, o item consta desabilitado com motivo "já é membro"
      (CA-02, parcial).
    - Esc e clique no backdrop fecham o modal (CA-01); zero erros de
      console.
  - Não coberto pelo roteiro headless: motivo "apenas administradores podem
    convidar" (todos os espaços semeados têm o usuário como admin — lógica
    `c.myRole !== 'owner'` verificada por inspeção e pela guarda de admin
    testada em T1); erro exibido no modal sem fechá-lo (CA-07 — caminho
    `inviteError` verificado por inspeção); entrega ao convidado remoto
    (coberta pelos testes de `acceptSpaceInvite` em T1; hub notify não
    exercido sem Supabase).

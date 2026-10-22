# Convidar amigo para comunidade (modal de seleção)

- Status: aprovada
- Data: 2026-10-22
- Origem: pedido do usuário — o item "Convidar para comunidade" do menu de
  contexto de amigo deve abrir um modal para selecionar a comunidade onde
  inserir o amigo. Análise SDD concluída e autorizada a criação da spec.
- Aprovação: "continuar", após apresentação da spec e dos pontos de decisão,
  em 2026-10-22. Os pontos da seção 10 seguem as decisões propostas no texto
  (inserção sem aceite, lista = espaços do rail, genesis re-emitido pelo
  convidante, entrega volátil + notify melhor-esforço).

## 1. Objetivo e contexto

Dar efeito ao item "Convidar para comunidade" do menu de contexto dos amigos
(lista RODAS da sidebar), que hoje é um placeholder sem ação: ao clicar, abrir
um modal listando as comunidades do usuário e, ao escolher uma, inserir o amigo
como membro dessa comunidade.

Contexto observado na análise:

- `friendMenuItems` já renderiza `{ value: 'invite' }` sem handler
  (`web/src/views/HomeView.vue`); o comentário registra que aguarda a feature.
- O modo ativo do app é exclusivamente P2P (`MODE='p2p'`); o provider "server"
  existe mas não é instanciado.
- No P2P, adicionar membro a espaço existente usa o evento assinado
  `member.add` (aceito pelas réplicas apenas se o autor for admin do espaço
  ou o próprio usuário adicionado). A entrega do espaço ao novo membro usa o
  controle `space_invite` com o evento genesis, aplicado por
  `acceptSpaceInvite` sem etapa de consentimento — mesmo comportamento já
  existente quando `createSpace` inclui membros na criação.
- Não existe hoje caminho para adicionar membro a espaço já criado: nem UI,
  nem operação no provider, nem função nos módulos P2P.

## 2. Escopo

Inclui: o modal de seleção de comunidade no `HomeView.vue`; a operação
`communities.inviteMember(communityId, userId)` no Service Layer e sua
implementação P2P (`member.add` + `space_invite`); entrega melhor-esforço do
convite ao amigo online via canal de notify do hub quando não houver
DataChannel; tratamento de estados do modal (lista vazia, item desabilitado,
erro, sucesso); testes de regressão P2P e validação de build.

Fora de escopo: consentimento/aceite do convidado (ver decisão em aberto);
convite para usuário que não é contato/amigo; revogação de convite;
notificação dedicada de "você foi adicionado"; endpoint novo no backend Node
(modo server permanece sem a operação); inbox persistente de convites de
espaço no Postgres do hub; mudança nas regras de `converge.js`; migração de
dados; alterações visuais fora do modal.

## 3. Modos, plataformas e comportamento

| Comportamento | P2P | Server |
| --- | --- | --- |
| Abrir modal e listar comunidades | Sim | Sim (dados existentes) |
| Inserir amigo na comunidade | Sim | Não se aplica (provider inativo; operação indisponível) |
| Amigo entra ao receber o convite | Sim, automático | Não se aplica |

Alvo: Electron (desktop) e navegador de desenvolvimento, mantendo o padrão
visual dos modais inline existentes (`.modal-bg`/`.modal`).

UX do modal:

1. Abre ao selecionar "Convidar para comunidade" no menu de contexto do amigo.
   O menu fecha e o modal identifica o destinatário pelo nome de exibição.
2. Lista os mesmos espaços exibidos no rail (`type !== 'dm'`), com avatar/
   iniciais, nome e papel local.
3. Itens não elegíveis aparecem desabilitados com motivo visível:
   - amigo já é membro do espaço;
   - usuário local não é admin do espaço (somente admins inserem membros).
4. Confirmar em um item elegível dispara a inserção, fecha o modal e informa
   sucesso; falha exibe mensagem sem fechar o modal.
5. Lista vazia exibe estado dedicado ("Nenhuma comunidade disponível").
6. Fechamento por botão Cancelar, clique no backdrop e Esc — mesmo padrão dos
   modais existentes.

## 4. Requisitos

### Funcionais

- **RF-01:** O item "Convidar para comunidade" do menu de contexto de amigo
  abre o modal de seleção, com o amigo alvo preservado do menu.
- **RF-02:** O modal lista os espaços do usuário conforme a seção 3, marcando
  como desabilitados os que já contêm o amigo ou onde o usuário não é admin.
- **RF-03:** Confirmar uma comunidade elegível executa
  `communities.inviteMember(id, userId)`; sucesso fecha o modal e informa o
  resultado; erro é exibido sem descartar a seleção.
- **RF-04:** No P2P, `inviteMember` exige que o autor seja admin do espaço
  (`sp.admins`); do contrário lança erro tipado antes de emitir qualquer
  evento. Amigo já membro é tratado como no-op informativo, não como erro.
- **RF-05:** No P2P, a inserção emite `member.add` assinado, persiste e faz
  broadcast aos membros atuais; registra o amigo no roteamento do espaço
  (`joinSpace`); e envia `space_invite` com o genesis atualizado (lista de
  membros já incluindo o convidado) ao amigo por `sendToPeer`.
- **RF-06:** Sem DataChannel aberto mas com o amigo online no hub, o convite é
  retransmitido como `notify` com `kind: 'space_invite'` — melhor-esforço,
  sem nova promessa de entrega. O receptor aplica o genesis pelo mesmo
  `acceptSpaceInvite` e ignora duplicatas (espaço já conhecido).
- **RF-07:** A inserção é idempotente: convite repetido, `space_invite`
  duplicado ou `member.add` reenviado não duplicam membros nem quebram a
  convergência das réplicas.
- **RF-08:** No provider "server", `inviteMember` lança erro tipado de
  operação indisponível, coerente com `notImpl` existente.

### Não funcionais

- **RNF-01:** Preservar a superfície do Service Layer: a operação nova entra
  como método adicional de `communities`, sem mudar assinaturas existentes
  nem o proxy de `services/index.js`.
- **RNF-02:** Preservar verificação de assinatura, deduplicação por
  autor/seq e regras de convergência; nenhum evento ou controle novo altera o
  envelope `v:1` nem exige novo tipo de mensagem persistida.
- **RNF-03:** Reutilizar o padrão de modal inline, ícones Lucide e tokens de
  tema existentes; estados acessíveis por teclado como nos demais modais.
- **RNF-04:** Sem novas dependências, sem IPC novo e sem expor identidade ou
  chave privada; logs/diagnóstico seguem o padrão atual (sem perfis nem
  conteúdo).

## 5. Contratos afetados

### Service Layer / providers

Nova operação no grupo `communities`:

```js
inviteMember: (communityId, userId) => Promise<{ ok: true }>
```

- P2P (`providers/p2p.js`): implementa RF-04 a RF-07.
- Server (`providers/server.js`): `notImpl('communities.inviteMember')` —
  o backend não possui endpoint de inserção direta de membro; manter dormência
  documentada.

### Eventos e controles P2P

Reutilizados, sem alteração de formato:

```json
// evento persistido (assinado) — já suportado por converge.js
{ "type": "member.add", "body": { "userId": "<pubkey do amigo>" } }

// controle — já roteado em node.receive
{ "type": "space_invite", "body": { "spaceId": "<id>", "genesis": { "...envelope genesis..." } } }
```

O genesis enviado ao convidado é construído como em `createInvite`: `seq: 1`,
autor = convidante, `body.admins` e `body.members` refletindo o estado atual
do espaço (membros já com o convidado). Para o receptor, `space_invite`
continua sendo aceitação implícita — `acceptSpaceInvite` já verifica espaço
conhecido antes de criar.

### Notify do hub (Supabase)

Extensão mínima de `handleHubNotify` para reconhecer
`{ kind: 'space_invite', genesis }` e aplicar `acceptSpaceInvite` com o store
local — reutilizando o mesmo caminho do controle por DataChannel. Sem tabela
nova: a entrega é melhor-esforço em tempo real; amigo offline segue o limite
da fila volátil (seção 7).

### WS, REST e IPC

Não se aplica: sem novos endpoints, eventos WS ou canais IPC. O provider
server não é instanciado; a operação existe apenas para preservar a
superfície do contrato.

## 6. Estado, persistência e integridade

- `member.add` é persistido no log local do espaço (mesmo caminho dos demais
  eventos de domínio) e espelhado no Postgres do hub por `mirrorEvent`
  (mapeamento `member.add` → `conversation_members` já existente).
- O convidado persiste o genesis recebido pelo caminho atual de
  `acceptSpaceInvite`; o `member.add` que o inclui chega depois por sync ou
  broadcast e é idempotente na projeção.
- Sem migração de schema, sem dado real tocado; `data/` e perfis Electron
  permanecem intocados.

## 7. Falhas e recuperação

- **Amigo offline:** `sendToPeer` enfileira na fila volátil em memória
  (cap 500, perdida ao reiniciar) — limite já documentado (CA-08 de
  `friend-invitation-flow`). Com hub, o `notify` cobre o caso "online no hub
  sem DC"; amigo totalmente offline não recebe o espaço até novo convite.
  `member.add` persiste e converge entre os demais membros normalmente.
- **Convidante reinicia antes da entrega:** o espaço pode nunca chegar ao
  amigo; nenhum estado falso de sucesso é exibido como "entregue" — a UI
  informa inserção realizada, não recebimento.
- **Duplicata:** genesis repetido (DC + notify) é absorvido por
  `acceptSpaceInvite`; `member.add` repetido cai na deduplicação por
  autor/seq.
- **Não-admin tenta convidar:** rejeitado antes de emitir; mesmo que um
  cliente adulterado emita, as demais réplicas ignoram `member.add` de
  não-admin sobre terceiros (regra de convergência existente).
- **Amigo bloqueado/removido:** não se aplica ao fluxo — o menu de contexto
  só existe para contatos `friend`.

## 8. Critérios de aceite

| ID | Verificação | Requisitos |
| --- | --- | --- |
| CA-01 | Menu de contexto do amigo → "Convidar para comunidade" abre o modal com o alvo correto e Esc/backdrop/cancelar fecham | RF-01, RNF-03 |
| CA-02 | Modal lista os espaços do rail; comunidade onde o amigo já é membro e onde não sou admin aparecem desabilitadas com motivo | RF-02 |
| CA-03 | Confirmar comunidade elegível insere o amigo: `member.add` aplicado localmente, broadcast emitido, modal fecha com feedback de sucesso | RF-03, RF-05 |
| CA-04 | Amigo online com o espaço entregue aparece como membro na comunidade sem recarregar (rail e lista de membros atualizam) | RF-05, RF-06 |
| CA-05 | `inviteMember` por não-admin lança erro e não emite evento; réplica remota ignora `member.add` de não-admin | RF-04, RNF-02 |
| CA-06 | Convite duplicado (repetir ação, DC + notify) não duplica membro nem quebra projeção | RF-07 |
| CA-07 | Falha na operação exibe erro no modal sem fechá-lo | RF-03, RNF-03 |
| CA-08 | Provider server rejeita `inviteMember` com erro tipado de indisponível | RF-08 |
| CA-09 | `npm --prefix web test` e `npm run build` verdes; `git diff --check` limpo | — |

## 9. Estratégia de validação

- Regressão em `web/test/p2p.test.js` com identidades e stores descartáveis:
  admin insere membro e a projeção converge; convidado aplica genesis via
  `acceptSpaceInvite` e passa a constar como membro; `member.add` de
  não-admin é rejeitado; duplicata é absorvida.
- UI: roteiro manual/headless — abrir menu de contexto em amigo de RODAS,
  conferir itens desabilitados e motivos, confirmar convite e verificar a
  comunidade no lado do amigo. Registrar o que for efetivamente observado.
- Comandos: `npm --prefix web test`, `npm run build`, `git diff --check`.

## 10. Riscos e decisões em aberto

1. **Sem consentimento:** o convidado entra automaticamente ao receber
   `space_invite` — mesma semântica de `createSpace` e do pedido ("inserir
   amigo"), e o membro pode sair da comunidade depois. Se for desejado um
   aceite explícito, a spec precisa de revisão (novo controle, inbox e UI de
   aceite no receptor).
2. **Grupos no rail:** o modal lista todos os espaços não-DM, incluindo
   grupos que o rail já exibe como comunidades. Restringir a
   `type === 'community'` é uma alternativa se grupos não devem receber
   membros por este caminho.
3. **Genesis re-emitido pelo convidante:** o receptor confia em
   `body.admins`/`body.members` do envelope assinado pelo convidante (mesma
   confiança do `space_invite` de `createSpace` e do convite por código).
   Um convidante adulterado pode alterar o genesis entregue; endurecer isso
   (ex.: verificar autor ∈ admins ou carregar o genesis original do log) é
   melhoria de protocolo fora deste escopo.
4. **Entrega offline:** limitada à fila volátil + notify melhor-esforço;
   inbox persistente de convites de espaço no hub ficaria para spec futura.

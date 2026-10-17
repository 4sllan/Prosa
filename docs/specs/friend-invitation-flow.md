# Fluxo de convites de amizade

- Status: aprovada (R2 - simplificacao do pareamento)
- Data: 2026-10-16
- Origem: analise do fluxo de conexao com amigos, autorizacao para criar a spec.
- Aprovacao original (R1): o usuario autorizou a criacao das tasks com "continuar", apos
  a apresentacao desta spec e dos pontos de decisao, em 2026-10-16.
- Implementacao: plano aprovado e T1/T2 autorizadas em 2026-10-16; execucao
  sujeita aos gates entre tasks definidos em `.devin/sdd.md`.
- Revisao R2 autorizada com "pode sim", apos proposta de fluxo guiado.
  Essa autorizacao permitiu revisar a spec, sem aprovar antecipadamente seus requisitos.
- Aprovacao R2: "continuar", apos apresentacao da spec revisada e pedido de
  aprovacao para revisar as tasks.
- Plano R2 aprovado e T2A autorizada com "continuar", apos apresentacao do
  plano revisado. Demais tasks continuam sujeitas a autorizacao especifica.
- T2B autorizada com "continar", apos conclusao de T2A e pedido especifico
  para implementar o fluxo guiado. Sua validacao manual permanece obrigatoria.
- T3 autorizada com "continuar", apos revalidacao de T2 e pedido especifico
  para implementar copia da chave e detalhes recolhidos.
- RF-01 a RF-08 e decisoes de amizade/offline da R1 sao preservados.
  A nova UX, validacao de entrada e criterios associados foram aprovados.
  A aprovacao do plano R2 nao autoriza executar todas as tasks.

## 1. Objetivo e contexto

Integrar o pareamento manual P2P ao fluxo de solicitacoes de amizade, tornar
explicita a copia da chave publica e permitir cancelar solicitacoes enviadas.
Simplificar a troca dos links de pareamento para evitar copia parcial e a
escolha manual entre aceitar um convite e completar uma resposta.

No diagnostico inicial, `PairingPanel.vue` conectava o peer apos o handshake,
mas nao solicitava amizade. `contacts.js` implementa esse fluxo separadamente.
O status "Peer conectado" informa rede, mesmo sem relacionamento cadastrado.

O cartao "Sua chave" ja possui copia por clique, mas nao oferece botao,
confirmacao ou erro visivel. `FriendsPanel.vue` lista solicitacoes enviadas
sem acao de cancelamento. No diagnostico inicial, o provider P2P tambem
convertia `removed` em `incoming` antes da filtragem.

Estado da execucao: T1, T2A, T2B, T2 revalidada, T3, T4 e T5 foram concluidas.
A falha manual anterior de link invalido permanece como historico da R1; a R2
substituiu a escolha manual por fluxo guiado e validacao previa. O limite
documentado de CA-08 permanece: a fila de controle P2P offline e volatil e
nao promete entrega remota apos reinicio.

Referencias existentes:

- `web/src/components/PairingPanel.vue`
- `web/src/components/FriendsPanel.vue`
- `web/src/services/p2p/contacts.js`
- `web/src/services/p2p/node.js`
- `web/src/services/providers/p2p.js`
- `web/src/stores.js`
- `web/src/services/providers/server.js`
- `server/src/routes/users.js`

## 2. Escopo

Inclui integracao entre pareamento e solicitacao, transicoes dos estados
afetados, atualizacao das listas, botao de copia e cancelamento de enviadas.
Inclui testes de regressao e documentacao do comportamento e dos limites.
Na R2, inclui copia explicita de convite/resposta, acao unica para o link
recebido, validacao/normalizacao de entrada e detalhes tecnicos recolhidos.

Fora de escopo: discovery, mailbox/relay, fila persistente de controle,
revogacao de links SDP, alteracao de ICE/STUN/TURN, novo protocolo de
pareamento, reformulacao visual global, busca P2P por username, novos endpoints,
dependencias e reparacao automatica de dados antigos.
Tambem fora de escopo: codigo curto resolvido por servidor, QR code,
leitura automatica do clipboard, abertura de links pelo sistema operacional
e eliminacao da troca de resposta exigida pelo protocolo manual atual.

## 3. Modos, plataformas e semantica

| Comportamento | P2P | Server |
| --- | --- | --- |
| Solicitacao apos pareamento manual | Sim | Nao se aplica |
| Fluxo guiado e copia de convite/resposta | Sim | Nao se aplica |
| Copiar chave publica | Sim | Nao se aplica |
| Cancelar solicitacao enviada | Sim | Sim |

O alvo principal P2P e o Electron; manter compatibilidade com o navegador de
desenvolvimento. O cancelamento compartilhado deve funcionar tambem na web
em modo servidor, sem alterar suas regras de autenticacao.

- A gera o convite de pareamento; B aceita e devolve a resposta; A completa.
- Gerar o link, isoladamente, nao cria relacionamento: a chave remota ainda
  nao e conhecida.
- Apos handshake aceito e canal registrado, A solicita amizade a B.
- A ve B em "Enviadas"; B ve A em "Recebidas", sem recarregar a pagina.
- Receber um convite de pareamento nao aceita automaticamente a amizade.
- Ao aceitar a amizade em "Recebidas", ambos passam a "Amigos".
- "Peer conectado" informa somente conectividade, nao amizade.
- O respondente B nao deve enviar automaticamente uma solicitacao inversa.

### Fluxo guiado da R2

1. A escolhe "Criar convite". A interface coleta candidatos e apresenta
   "Copiar convite" e "Envie este convite ao amigo".
2. B cola o link no campo "Cole o link recebido" e escolhe "Continuar".
   O tipo `offer` e identificado pelo conteudo validado; B gera a resposta.
3. B escolhe "Copiar resposta". A instrucao e "Envie esta resposta de volta
   a quem criou o convite".
4. A cola a resposta no mesmo campo e escolhe "Continuar". O tipo `answer`
   conclui a oferta pendente desta sessao; a UI informa que esta conectando.
5. Apos o handshake, mostrar conexao separada do estado da amizade.
   A solicitacao aparece em Enviadas de A e Recebidas de B, como na R1.

Os botoes separados "Aceitar convite" e "Completar" deixam de ser exigidos.
Links longos nao ocupam o fluxo principal; "Ver link" permite acesso ao
conteudo integral, somente leitura, para copia manual alternativa.
Nao encurtar nem modificar o link efetivamente copiado.

Estados visiveis: inicial, gerando convite, aguardando resposta, gerando
resposta, resposta pronta, conectando, conectado e erro recuperavel.
Mostrar apenas a instrucao e as acoes pertinentes ao estado atual.

## 4. Requisitos

### Funcionais

- **RF-01:** O lado que gerou a oferta deve iniciar uma unica solicitacao de
  amizade apos o handshake aceito, usando a chave identificada nesse canal.
  Handshake rejeitado ou pareamento incompleto nao deve criar solicitacao.
- **RF-02:** Persistir e exibir os estados `outgoing`, `incoming` e `friend`
  conforme a semantica da secao 3, notificando a UI apos as alteracoes.
- **RF-03:** Repeticao de handshake, reconexao ou solicitacao nao deve
  duplicar contatos, rebaixar `friend`, inverter uma pendencia existente
  nem remover `blocked`. Re-pareamento sozinho nao deve recriar um contato
  `removed`; um novo pedido explicito por chave continua permitido.
- **RF-04:** Aceitar amizade deve atuar somente em solicitacao recebida.
  Aceite remoto somente pode promover uma solicitacao enviada existente;
  nao pode criar contato nem promover `blocked` ou `removed`.
- **RF-05:** Exibir botao "Copiar chave" associado a "Sua chave". Copiar a
  chave publica completa, nunca a versao truncada nem o fingerprint.
  Confirmar sucesso somente apos a escrita no clipboard; indisponibilidade
  ou rejeicao deve produzir mensagem de erro e permitir nova tentativa.
- **RF-06:** Exibir "Cancelar convite" para cada solicitacao em "Enviadas".
  A acao deve reutilizar a remocao do provider ativo, atualizar a lista e o
  contador e exibir falha sem ocultar antecipadamente a solicitacao.
  Desabilitar a acao enquanto estiver pendente para aquele contato.
- **RF-07:** Contatos P2P `removed` nao devem aparecer em nenhuma secao.
  Estados desconhecidos nao devem ser tratados como solicitacao recebida.
- **RF-08:** No P2P, o cancelamento deve comunicar `contact_remove` pelo
  transporte existente. Quando entregue ao destinatario, remover sua
  pendencia sem desfazer um bloqueio local. Nao desconectar o peer nem
  apagar mensagens, espacos, identidade ou a lista de peers conhecidos.
- **RF-09 (R2):** Substituir a escolha manual aceitar/completar por um unico
  campo e acao "Continuar". Decidir a operacao por `t` no payload validado,
  nunca por tentativa de executar ambas as operacoes. Desabilitar inicio de
  operacoes WebRTC concorrentes durante geracao, aplicacao de resposta e
  handshake em curso, sem impedir copia ou a acao explicita de recomecar.
- **RF-10 (R2):** Disponibilizar "Copiar convite" e "Copiar resposta" por
  gesto explicito, copiando o link completo do estado correspondente.
  Confirmar sucesso apenas apos a escrita no clipboard. Erro deve preservar
  o link e oferecer "Ver link" para copia manual integral, sem novo IPC.
- **RF-11 (R2):** Normalizar apenas espacos ASCII, tabs e quebras de linha
  do texto codificado, inclusive nas extremidades. Validar tamanho, formato,
  base64url, JSON, versao, tipo e SDP antes de alterar uma sessao WebRTC.
  Nao reconstruir conteudo faltante nem normalizar o SDP decodificado.
- **RF-12 (R2):** Recolher chave publica, fingerprint, peers conhecidos e
  adicao por chave em "Detalhes da conexao", mantendo RF-05 disponivel ao
  expandir. Preservar acesso por teclado e aviso visivel para handshake
  legado, com orientacao para conferir identidade nos detalhes.
- **RF-13 (R2):** Entrada invalida nao deve apagar oferta/resposta valida.
  "Recomecar pareamento" deve permitir nova tentativa, fechando apenas os
  canais/PCs ainda nao anexados e descartando seus links/handlers pendentes.
  Nao remover amizades, desconectar peers anexados nem apagar dados.
  Resultados assincronos de tentativa descartada nao podem alterar a nova UI.

### Nao funcionais

- **RNF-01:** Preservar interfaces dos providers, formato dos links,
  verificacao de handshake, assinaturas de dominio e isolamento Electron.
  Manter a compatibilidade legada ja existente, sem apresenta-la como
  equivalente a prova de posse assinada.
- **RNF-02:** Preservar estilo visual e funcionamento em janela desktop e
  viewport estreita. Botoes devem ter texto acessivel, foco por teclado e
  feedback de copia anunciado por tecnologia assistiva.
  Aplicar o mesmo padrao a copia de links e ao controle de detalhes.
- **RNF-03:** Nao adicionar dependencias, backend auxiliar, IPC generico,
  timers recorrentes ou listeners acumulados a cada novo pareamento.
- **RNF-04:** Erros de persistencia/envio na nova integracao devem ser
  visiveis, distinguindo falha da solicitacao de conexao estabelecida.

## 5. Contratos afetados

### Providers e servidor

Reutilizar `contacts.list()`, `request(chaveOuUsername)`, `accept(userId)` e
`remove(userId)`. A lista mantem `{ relationships: [{ id, user, type }] }`.
Filtrar estados nao exibiveis antes de produzir tipos de relacionamento.

No servidor, reutilizar `DELETE /api/users/@me/relationships/:otherId`.
Autenticacao e verificacao de participacao no relacionamento permanecem no
backend. Preservar o evento WS `RELATIONSHIP_UPDATE` existente.
Nao ha novos endpoints, erros HTTP ou eventos WS.

### P2P e atualizacao de estado

Reutilizar controles existentes, sem alterar versao ou envelope:

```json
{ "type": "contact_req", "body": { "profile": { "id": "<chave publica>", "username": "<nome>", "displayName": "<nome exibido>" } } }
{ "type": "contact_accept", "body": { "profile": { "id": "<chave publica>" } } }
{ "type": "contact_remove", "body": {} }
```

Os exemplos mostram somente tipo e corpo; os demais campos continuam sendo
produzidos pelo transporte. A identidade do contato deve vir do peer
associado ao canal, nao de `body.profile.id`.

Reutilizar `contacts.changed` e `loadRelationships` para refletir alteracoes.
A iniciacao automatica precisa conhecer o papel local de ofertante ou
respondente, sem enviar esse papel como novo campo de protocolo.
Os controles de contato existentes nao passam a ser eventos de dominio
assinados por esta mudanca.

### Links e validacao de pareamento (R2)

Manter os links `prosa://pair/<base64url>` e payload
`{ "v": 1, "t": "offer|answer", "sdp": "<SDP completo>" }`.
Nao ha nova versao ou servidor de sinalizacao. O tamanho do texto de entrada
fica limitado a 256 KiB (UTF-8) antes da normalizacao/decodificacao.
Manter os formatos de payload codificado sem prefixo ou precedido de `#`
ja aceitos pelo decoder; a UI recomenda compartilhar o link completo.

Validar objeto JSON nao nulo, `v === 1`, `t` igual a `offer` ou `answer`,
e `sdp` string nao vazia. WebRTC continua validando a semantica do SDP;
validacao previa nao comprova autenticidade nem vincula a resposta a uma
oferta especifica. Essa vinculacao adicional exigiria outro contrato.

Centralizar validacao no servico de pareamento, para UI e chamadas diretas
obedecerem as mesmas regras. Rejeitar tipo incorreto antes de criar PC ou
aplicar descricao remota. A UI deve mapear erros para mensagens simples:

| Caso | Comportamento esperado |
| --- | --- |
| Vazio | Orientar "Cole o link recebido" sem iniciar operacao |
| Grande demais | Informar tamanho excedido sem decodificar |
| Prefixo incorreto, base64/JSON invalido ou campos ausentes | Informar "Link incompleto ou invalido. Peca ao amigo para usar Copiar convite ou Copiar resposta" |
| Versao diferente de 1 | Informar que o link usa versao nao suportada |
| Resposta sem oferta local pendente, inclusive apos reload | Orientar criar novo convite nesta janela e pedir nova resposta |
| Convite recebido enquanto aguarda resposta a uma oferta local | Explicar que esta janela aguarda uma resposta; oferecer recomecar antes de aceitar outro convite |
| Falha ao aplicar SDP ou conectar | Distinguir falha de conexao de erro de copia; permitir recomecar sem apagar contatos |

As mensagens sao textos de UX, nao novos codigos HTTP/WS.

### Clipboard e IPC

Usar a API de clipboard disponivel no renderer, com erro explicito.
Aplicar a chave publica e aos links gerados; nao ler o clipboard
automaticamente nem exigir permissao de leitura para colagem manual.
Nao expor Node, filesystem ou chave privada, nem ampliar a ponte IPC.
Se a API nao funcionar em alguma plataforma alvo, reportar essa limitacao
antes de propor nova capacidade IPC.

## 6. Estado, persistencia e integridade

Reutilizar contatos indexados por chave publica no store local e seus estados
`outgoing`, `incoming`, `friend`, `blocked` e `removed`. Cancelamento P2P
mantem a marcacao `removed`; nao requer apagar fisicamente o registro.

Nao ha migracao de schema nem mudanca no banco do servidor. Registros
`removed` preexistentes passam a ser ocultados corretamente, sem alterar
seus dados. Nao inferir retrospectivamente amizades a partir de peers
conhecidos nem corrigir solicitacoes antigas automaticamente.

Estado do assistente de pareamento e links gerados permanecem apenas na
sessao em memoria. Nao persistir SDP no store de contatos nem no clipboard
automaticamente. Recarregar a janela perde a oferta pendente, com orientacao
de recuperacao descrita na secao 5.

## 7. Seguranca, privacidade e limites

Somente usar a identidade remota apos o handshake aceito pelo verificador
existente. Preservar a verificacao de fingerprint fora de banda.
Bloqueios locais prevalecem sobre pedidos, aceites e remocoes remotos.
Nao registrar chaves privadas, links SDP, perfis ou conteudo do clipboard.

Limites de fila e controles existentes permanecem. Nao introduzir varreduras
de todos os contatos por renderizacao nem retries ilimitados.

## 8. Falhas e recuperacao

- Offline: cancelamento local fica persistido. O controle remoto usa a fila
  em memoria existente, limitada e sem garantia de entrega.
- Reconexao no mesmo processo: controles enfileirados podem ser entregues;
  a integracao nao deve gerar novo pedido automatico para `removed`.
- Reinicio: a fila de controle nao e persistente; o destinatario pode manter
  pendencia antiga. Nao indicar cancelamento remoto confirmado.
- Duplicacao: pedidos repetidos preservam estados protegidos; aceites
  atrasados nao ressuscitam contatos removidos ou bloqueados.
- Solicitacoes cruzadas: preservar a pendencia existente, sem inverter sua
  direcao nem aceitar amizade implicitamente.
- Corridas e ordenacao arbitraria entre dispositivos, inclusive pedido novo
  versus remocao antiga apos reinicio, nao recebem garantia de convergencia
  global nesta spec. Isso exigiria contrato de protocolo separado.
- Timeout/erro de pareamento: manter o tratamento atual e nao criar amizade.
  Falha de solicitacao apos conexao deve permitir tentativa explicita por
  chave, sem anunciar envio bem-sucedido.
- R2, copia negada/indisponivel: manter o link gerado e permitir copia manual
  integral por "Ver link". Nao gerar nova oferta/resposta por falha de copia.
- R2, entrada parcial ou tipo inesperado: manter a sessao valida e mostrar a
  proxima acao necessaria, sem avancar o estado nem iniciar tentativa dupla.
- R2, cancelamento/reinicio explicito de tentativa: ignorar conclusoes
  assincronas antigas e limpar apenas recursos de pareamento nao anexados.
  Usar a mesma regra na desmontagem do painel, sem encerrar peers anexados.

## 9. Criterios de aceite

| ID | Verificacao | Requisitos |
| --- | --- | --- |
| CA-01 | A e B pareiam; A ve uma enviada e B uma recebida sem reload; gerar link ou falhar handshake nao cria contato | RF-01, RF-02 |
| CA-02 | B aceita; ambos veem amizade e nao veem a pendencia anterior | RF-02, RF-04 |
| CA-03 | Repeticao, reconexao e pedidos cruzados nao duplicam nem invertem pendencias; `friend` e `blocked` sao preservados | RF-03 |
| CA-04 | Clique ou teclado copia exatamente a chave completa; sucesso, rejeicao e API indisponivel recebem feedback correto | RF-05, RNF-02 |
| CA-05 | Cancelar remove a enviada e ajusta contador em ambos os modos; erro mantem item e informa falha; acao pendente nao se repete | RF-06 |
| CA-06 | P2P cancelado nao aparece em Recebidas nem apos reler o store; destinatario online perde a pendencia; bloqueio e dados nao relacionados permanecem | RF-07, RF-08 |
| CA-07 | Aceite tardio nao restaura `removed`/`blocked`; novo pareamento nao os altera; novo pedido explicito pode reutilizar `removed` | RF-03, RF-04 |
| CA-08 | Offline e reinicio respeitam limites documentados, sem confirmacao falsa de entrega remota | RF-08, RNF-04 |
| CA-09 | UI mantem layout, foco e feedback acessivel no Electron e em viewport estreita; contratos e fronteira IPC permanecem | RNF-01, RNF-02, RNF-03 |
| CA-10 (R2) | A e B concluem o fluxo usando Criar convite, Copiar convite, Copiar resposta e Continuar, sem selecionar links manualmente ou escolher aceitar/completar | RF-09, RF-10 |
| CA-11 (R2) | Copia integral funciona por clique/teclado; rejeicao/API ausente nao anuncia sucesso nem perde link e oferece copia manual alternativa | RF-10, RNF-02 |
| CA-12 (R2) | Espacos/tabs/quebras de linha no link codificado sao tolerados sem alterar SDP; entrada vazia, truncada, excessiva, versao/tipo invalido e campos ausentes nao criam PC nem aplicam resposta | RF-11 |
| CA-13 (R2) | Resposta sem oferta e convite durante oferta pendente recebem instrucao correta; erro e recomeco preservam contatos, peers anexados e estado valido; tentativa descartada nao altera a nova UI | RF-09, RF-13 |
| CA-14 (R2) | Detalhes ficam recolhidos por padrao; chave, fingerprint e adicao manual continuam acessiveis ao expandir, com foco e aviso legado preservados | RF-05, RF-12, RNF-01, RNF-02 |

## 10. Estrategia de validacao

Adicionar regressao no conjunto P2P para transicoes de contato, duplicacao,
papel ofertante/respondente, handshake rejeitado, pedidos cruzados, estados
protegidos, filtragem, cancelamento e aceite atrasado. Usar identidades e
stores descartaveis; nenhum dado real de `data/` ou perfil Electron.

Validar cancelamento servidor com contas isoladas, incluindo autorizacao,
remocao da pendencia e notificacao do outro participante.
Para clipboard/UI, usar testes automatizados quando viaveis sem nova
dependencia; cobrir manualmente estados nao exercitados pela suite.

Na R2, adicionar testes de ida e volta do codec, whitespace no texto
codificado, prefixos/formatos compativeis, versao/tipo/campos invalidos,
tamanho excessivo, payload truncado e falhas de WebRTC. Verificar que a
validacao invalida nao cria PC nem aplica descricao remota. Usar payloads
sinteticos, sem coletar os links das capturas ou logs do usuario.

Cobrir roteamento da acao unica, copia integral de ambos os links, erros do
clipboard, oferta local ausente, oferta concorrente, recomeco e resultados
assincronos antigos. Testar logica de producao, sem replicar a implementacao
no teste. Reexecutar as regressoes de T1/T2 para nao alterar estados de amizade.

Comandos previstos na raiz, somente durante tasks autorizadas:

```sh
npm --prefix web test
npm test
npm run build
git diff --check
```

Validacao manual: duas instancias com perfis descartaveis; parear, conferir
ambas as listas, aceitar, repetir pareamento, cancelar pendencia online e
offline, reiniciar, verificar preservacao de bloqueio e testar clipboard por
mouse/teclado. Repetir cancelamento em modo servidor com contas de teste.
Verificar layout estreito e feedback de erro.

No Electron atualizado, repetir manualmente o fluxo da R2 em duas
instancias/perfis descartaveis usando os botoes de copia. Incluir colagem
com whitespace, link incompleto, resposta sem oferta local, recomeco de
tentativa, acesso aos detalhes e copia por teclado. Verificar Enviadas,
Recebidas e Amigos sem reload. O erro reportado pelo usuario mantem a
validacao de T2 pendente ate o roteiro completo passar com evidencias.

Mocks nao comprovam conectividade entre redes reais; nao ha promessa de
conectividade universal ou validacao do Electron empacotado pelo build Vite.

## 11. Decisoes aprovadas

- Semantica de dois passos: aceitar pareamento nao
  aceita amizade; "Recebidas" pertence ao destinatario e "Amigos" ao aceite.
- "Cancelar convite" cancela a solicitacao de amizade, nao
  revoga o link de pareamento nem encerra uma conexao ja aberta.
- A ausencia de entrega persistente offline e uma limitacao aceita,
  nao um requisito de mailbox ou novo protocolo.
- A compatibilidade de handshake legado preserva suas limitacoes atuais.
- Qualquer necessidade de migracao, IPC adicional ou protocolo de ordenacao
  exige revisao desta spec antes da implementacao.

Decisoes aprovadas na R2:

- Fluxo guiado sem escolha manual entre convite/resposta, copia por botoes
  e detalhes tecnicos recolhidos, preservando o protocolo e a troca de resposta.
- Validacao compartilhada com limite de 256 KiB, normalizacao apenas do
  texto codificado e mensagens de recuperacao antes de operar no WebRTC.
- Recomeco de tentativa sem apagar contatos nem desconectar peers anexados;
  nenhum encurtador, clipboard automatico ou nova capacidade IPC.
- A aprovacao da R2 abrange RF-09 a RF-13, CA-10 a CA-14 e as alteracoes
  correspondentes de UX/codec. A implementacao depende da aprovacao do plano
  revisado e da autorizacao especifica da task correspondente.

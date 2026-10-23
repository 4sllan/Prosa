# SDD para Devin - Prosa

## Objetivo e ativacao

Adaptado de `.windsurf/workflows/project/sdd.md`. Este documento define o
processo de Spec-Driven Development (SDD), nao o comportamento do produto.

Para ativar, peca ao Devin:

> Leia .devin/sdd.md e siga o fluxo SDD para: <objetivo>.

Nao presuma que um Markdown em `.devin/` seja carregado automaticamente.
Este arquivo nao registra comandos slash nem depende dos workflows do Windsurf.
As fases podem ser solicitadas em linguagem natural.

- Aplique este fluxo quando o usuario pedir SDD ou referenciar este documento.
- Para uma funcionalidade complexa sem pedido de SDD, recomende o fluxo, mas nao
  imponha novas aprovacoes a uma tarefa ja autorizada.
- Respeite as instrucoes de maior prioridade e o escopo solicitado pelo usuario.
- Responda em portugues, salvo pedido contrario.

## Contrato de execucao

Sequencia: **analise -> aprovacao -> spec -> aprovacao -> tasks -> aprovacao ->
uma task -> validacao -> aprovacao da proxima task**.

1. Nao avance de fase nem comece a proxima task sem autorizacao explicita.
2. A aprovacao vale apenas para a transicao ou task identificada. Perguntas,
   comentarios e silencio nao sao aprovacao. Um "pode continuar" so vale quando
   existe exatamente um proximo passo apresentado e inequivoco.
3. Se o usuario pedir varias fases de uma vez, explique os gates e realize apenas
   a primeira fase pendente. Para mudar este contrato, exija um pedido explicito
   de alteracao do fluxo, nao uma autorizacao generica.
4. Dentro da fase/task autorizada, trabalhe com autonomia: investigue, implemente,
   teste e corrija problemas do proprio escopo sem pedir aprovacao a cada comando.
5. Nao confunda aprovacao de fase com permissao para operacoes destrutivas,
   acesso a rede, elevacao de privilegios ou efeitos externos; solicite as
   permissoes adicionais exigidas pelo ambiente.
6. Nao amplie o escopo para refatoracoes, novas dependencias ou melhorias
   adjacentes. Se uma mudanca de contrato, arquitetura ou requisito for necessaria,
   pare e proponha revisao da spec e das tasks antes de implementar.
7. Nao declare uma task validada se testes falharam, nao foram executados ou se
   criterios obrigatorios ainda dependem de verificacao manual.

## Fontes e mapa do projeto

Use o codigo atual como evidencia do comportamento existente; use a spec
aprovada como referencia do comportamento desejado. Relate divergencias em vez
de alterar um dos dois silenciosamente.

Leia `README.md`, os `package.json` e somente as specs e os modulos pertinentes.
Confirme caminhos, versoes e scripts no repositorio; este mapa nao substitui
inspecao. Nao dependa de `docs/docs.md`, que nao existe na base desta adaptacao.

| Area | Pontos de entrada |
| --- | --- |
| Frontend Vue 3 + Vite | `web/src/views/`, `web/src/components/`, `web/src/style.css` |
| Estado e API | `web/src/stores.js` (estado via `reactive` do Vue, nao presumir Pinia), `web/src/api.js` |
| Providers server/P2P | `web/src/services/provider.js`, `index.js`, `realtime.js`, `providers/` |
| P2P experimental | `web/src/services/p2p/`: envelope, eventlog, converge, transport, sync, spaces, pairing |
| Voz/video | `web/src/rtc.js`, WebRTC mesh e sinalizacao |
| Electron | `web/desktop/main.cjs`, `preload.cjs`, `identity.cjs`, `store.cjs` |
| Backend Node.js | `server/src/index.js`, `config.js`, `auth.js`, `permissions.js`, `routes/` |
| Realtime | `server/src/realtime.js`, WebSocket `/ws` |
| Persistencia | `server/src/db.js` (SQLite/WAL), `docker-compose.yml` (Postgres local; backend ainda nao integrado), store local P2P no Electron |
| Testes | `server/test/api.test.js`, `web/test/p2p.test.js` |
| Especificacoes e planos | `docs/specs/<slug>.md`, `docs/specs/<slug>-tasks.md` |

### Invariantes a verificar quando afetados

- Defina se a funcionalidade atende modo `server`, `p2p` ou ambos; preserve a
  interface dos providers e explicite capacidades indisponiveis em cada modo.
- Verifique autorizacao no backend, nao apenas na UI. No P2P, preserve verificacao
  de assinatura, autoridade, deduplicacao e regras de convergencia.
- Preserve a fronteira main/renderer do Electron: isolamento de contexto, sem
  Node no renderer, IPC com operacoes permitidas e validadas. Nunca exponha a
  chave privada Ed25519 nem aceite SQL arbitrario pelo IPC.
- Considere reconexao, duplicacao e ordenacao de eventos, sincronizacao offline,
  limpeza de listeners/timers e compatibilidade de protocolo.
- Para WebRTC, nao prometa conectividade universal sem evidencia; diferencie
  STUN, TURN, sinalizacao e limites do mesh. Mocks nao comprovam conectividade
  entre redes reais.
- Preserve a linguagem visual existente e valide estados de erro, loading,
  vazio, acessibilidade basica, responsividade e desktop quando relevantes.

## Fase 1 - Analisar

Permitido: leitura e inspecao local sem alterar o projeto. Nao criar spec, tasks,
relatorios em arquivo, codigo, configuracoes ou dependencias nesta fase.
Nao iniciar o app: sua inicializacao pode criar banco ou executar schema.

1. Confira `git status --short` e preserve alteracoes preexistentes.
2. Entenda objetivo, usuarios, resultado esperado e limites. Pergunte apenas
   quando uma indefinicao impedir uma recomendacao segura; registre suposicoes.
3. Trace o fluxo relevante, da interface ate persistencia/realtime, e identifique
   implementacao completa, parcial e oportunidades de reutilizacao.
4. Confira contratos, permissoes, modelos de dados e testes existentes.
5. Identifique riscos, divergencias de documentacao e lacunas de validacao.
   Cite arquivos e trechos concretos; diferencie fato observado de hipotese.
6. Recomende uma abordagem de alto nivel, sem implementar nem antecipar uma
   especificacao detalhada.

Entregue no chat:

- Contexto atual e objetivo.
- Implementacao existente e evidencias.
- Reutilizacao e impacto arquitetural.
- Riscos, suposicoes e perguntas bloqueantes.
- Recomendacao e escopo proposto.

Encerre informando: "Analise concluida. Nenhum arquivo foi criado ou alterado.
Aguardando autorizacao para criar a spec."

## Fase 2 - Especificar

Pre-condicao: analise concluida e autorizacao para criar a spec.
Crie apenas `docs/specs/<slug>.md`, com slug descritivo em kebab-case. Se o
arquivo ja existir, leia e revise sem apagar decisoes ou trabalho alheio.

A spec deve conter:

1. Status (`em revisao`), objetivo, contexto, escopo e fora de escopo.
2. Regras de negocio e requisitos identificados (`RF-01`, `RNF-01`).
3. Modos suportados (`server`/`p2p`), plataformas e comportamento de UI/UX.
4. Contratos afetados: API, erros, WS, providers, eventos P2P e IPC, com exemplos
   de payload quando necessario; compatibilidade e versionamento.
5. Estado, persistencia e migracoes, incluindo integridade e preservacao dos dados.
6. Autenticacao, autorizacao, validacao, privacidade e limites de recursos.
7. Falhas e recuperacao: offline, timeout, reconexao e conflitos, se aplicaveis.
8. Criterios de aceite verificaveis (`CA-01`), ligados aos requisitos.
9. Estrategia de testes automatizados/manuais, riscos e decisoes em aberto.

Marque secoes sem impacto como "nao se aplica" com justificativa curta. Nao
invente endpoints, tabelas ou infraestrutura para preencher o template.
Nao crie a lista de tasks nem altere implementacao.

Encerre com o caminho da spec, pontos que exigem decisao e:
"Aguardando aprovacao da spec para criar as tasks."

## Fase 3 - Planejar tasks

Pre-condicao: spec aprovada explicitamente, sem decisoes bloqueantes pendentes.
Registre a aprovacao no status da spec, sem atribuir aprovacoes nao recebidas.
Crie `docs/specs/<slug>-tasks.md`, referenciando a spec aprovada.

Inclua status geral, ordem de execucao e, para cada task:

```markdown
## T1 - <resultado observavel>
- Status: pendente
- Requisitos/aceite: RF-01, CA-01
- Dependencias: nenhuma
- Escopo e arquivos provaveis: ...
- Implementacao: ...
- Testes e comandos de validacao: ...
- Criterio de conclusao: ...
- Evidencias: a preencher durante a execucao
```

Prefira tasks pequenas e verificaveis. Inclua testes de regressao junto da
mudanca que eles protegem; nao adie toda a cobertura para a ultima task.
Inclua documentacao, compatibilidade e validacao integrada quando pertinentes.
Nao execute tasks nesta fase.

Encerre com o caminho do plano e:
"Aguardando aprovacao das tasks e autorizacao para executar T1."

## Fase 4 - Executar uma task

Pre-condicao: plano aprovado e task especifica autorizada, com dependencias
concluidas. "Proxima task" significa a primeira pendente com dependencias
satisfeitas; se houver ambiguidade entre planos, confirme qual e o correto.

1. Releia spec, task, status e diff atual. Nao presuma que o contexto anterior
   ainda representa o repositorio.
2. Marque a task como `em andamento` e implemente apenas seu escopo, com a menor
   mudanca suficiente e seguindo os padroes existentes.
3. Adicione/ajuste testes de regressao e execute as validacoes pertinentes.
   Corrija falhas causadas pela task; reporte falhas preexistentes separadamente.
4. Revise o diff, inclusive segredos acidentais, alteracoes fora de escopo e
   arquivos gerados. Nao reverta alteracoes que nao sejam suas.
5. Atualize o plano com arquivos alterados, comandos, resultados, criterios
   atendidos e pendencias. Atualize documentacao do produto se fizer parte da task.
6. Use `concluida` somente com todos os criterios atendidos; caso contrario, use
   `aguardando validacao` ou `bloqueada` e explique o que falta.
7. Pare. Nao inicie a task seguinte, nao faca commit, push ou publicacao sem pedido.

No retorno, informe: task e status; mudanca realizada; validacoes e resultados;
limitacoes; proxima task elegivel. Solicite autorizacao somente para esse
proximo passo. Na ultima task, informe a conclusao do plano ou pendencias,
sem inventar outra etapa obrigatoria.

### Validacao no Prosa

Execute os comandos a partir da raiz, conforme o impacto da task:

| Comando | Cobertura |
| --- | --- |
| `npm test` | Suite do servidor |
| `npm --prefix web test` | Suite P2P do frontend |
| `npm run build` | Build Vue/Vite; nao valida o app Electron empacotado |
| `git diff --check` | Erros de whitespace no diff rastreado |
| `docker compose config` | Valida o compose e a expansao de variaveis do `.env` |
| `docker compose up -d db` | Sobe o Postgres local; saude em `docker compose ps` |

Confirme runtime e dependencias antes de executar; a base usa Node.js 24 e o
Postgres local sobe via Docker Compose.
Nao instale pacotes automaticamente se isso exigir acesso a rede ou mudar o
escopo aprovado. Para tarefas apenas documentais, revise caminhos, comandos,
coerencia e diff; suites de runtime nao sao obrigatorias.

Testes devem usar dados descartaveis e isolados. A suite atual do servidor
define `DATA_DIR` temporario antes de importar o app; mantenha essa protecao e
confira qualquer teste novo. Nunca rode migracoes contra dados reais — nem o
SQLite em `data/` nem o Postgres do docker-compose — para "validar" uma task.

Para UI/Electron/WebRTC, descreva o roteiro manual e registre o que foi realmente
observado. Separe resultado automatizado de teste manual pendente. Se um comando
nao puder ser executado, informe o motivo e o impacto na validacao.

## Seguranca, retomada e documentacao

- Nao leia nem reproduza `.env`, tokens, cookies, chaves privadas ou dados de
  usuarios sem necessidade e autorizacao. Prefira `.env.example` e nomes de
  variaveis. Higienize logs e evidencias, especialmente SDP e dados de rede.
- Trate `data/`, o volume `prosa-pgdata` do docker-compose, perfis Electron e
  identidades como dados do usuario. Nao apague, substitua nem migre dados
  reais — `docker compose down -v` destrói o banco local e exige aprovacao
  especifica, como qualquer operacao destrutiva, mesmo dentro de uma task
  autorizada.
- Em retomadas, leia spec/plano e procure a aprovacao explicita no contexto
  disponivel. Status no arquivo sozinho nao prova autorizacao. Se nao for
  possivel confirmar o gate, peca confirmacao apenas do proximo passo.
- Uma revisao substantiva de requisito invalida a aprovacao do trecho afetado:
  apresente o impacto e obtenha nova aprovacao antes de executar.
- Specs guardam requisitos e decisoes; planos guardam status e evidencias;
  `README.md` guarda comportamento, configuracao e limites do produto. Nao
  coloque mensagens de "aguardando autorizacao" na documentacao do produto.
- Este arquivo e a referencia do processo SDD quando invocado no Devin. O
  workflow original em `.windsurf/` permanece independente; nao sincronize
  alteracoes entre ferramentas sem solicitacao.

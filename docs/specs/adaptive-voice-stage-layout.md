# Layout adaptativo dos participantes da chamada

- Status: aprovada
- Data: 2026-10-22
- Aprovacao: usuario autorizou avancar para as tasks com "continuar"
  apos a entrega da spec.
- Fase: T1 implementada apos autorizacao; aguardando validacao integrada.

## 1. Objetivo e contexto

Permitir que um unico participante ocupe a area disponivel do palco da
chamada e que dois ou mais participantes sejam organizados em grade.

Hoje, `web/src/components/VoiceStage.vue` renderiza a lista reativa
`store.voice[channel.id]`. Em `web/src/style.css`, o palco usa flex com
tiles de largura fixa de 200 px e altura minima de 180 px, impedindo que
um participante sozinho ocupe o espaco disponivel.

"Tela inteira" significa a area de midia do palco, nao fullscreen do
navegador/sistema nem ocultacao da navegacao, cabecalho ou controles.
O chat lateral, quando aberto, continua ocupando seu espaco existente.

## 2. Escopo

Dentro do escopo:

- Layout adaptativo do VoiceStage baseado na quantidade de participantes.
- Dimensionamento de tiles e videos dentro da area disponivel.
- Responsividade, identificacao dos participantes e estados sem video.
- Preservacao da previa local corrigida na entrega anterior.
- Testes de regressao e validacao visual do layout.

Fora do escopo:

- Fullscreen nativo, destaque manual, fixacao de participante, arrastar
  tiles, paginacao ou ordenacao por quem esta falando.
- Alterar VoiceBar, shell, navegacao ou comportamento do chat lateral.
- Captura de midia, renegociacao WebRTC, conectividade ou transmissao remota.
- Providers, protocolos, backend, IPC, persistencia ou novas dependencias.

## 3. Requisitos

### Funcionais

- RF-01: Com exatamente um participante na lista do canal exibido, seu
  tile deve ocupar toda a largura e altura disponiveis da area de midia
  entre o cabecalho e os controles, respeitando margens e espacamentos.
- RF-02: Com dois ou mais participantes, usar grade com celulas de igual
  tamanho, colunas adaptadas a largura disponivel e linhas adicionais
  conforme necessario. Em espaco estreito, permitir uma coluna.
- RF-03: A contagem considera todos os participantes, inclusive os que
  estao sem camera/tela, e nao apenas os videos ativos.
- RF-04: Entradas e saidas devem atualizar automaticamente o layout,
  inclusive transicoes entre zero, um e varios participantes, sem
  exigir reconexao, nova captura ou reinicio dos streams.
- RF-05: Manter avatar/iniciais quando nao houver video, nome e indicadores
  de microfone/tela e destaque de fala. Avatar permanece centralizado no
  tile; nao deve ser ampliado ate preencher o espaco como uma imagem.
- RF-06: Videos devem respeitar os limites do tile. Camera pode usar
  preenchimento com corte proporcional (`cover`), como hoje; tela
  compartilhada deve mostrar o conteudo inteiro (`contain`), aceitando
  faixas livres. Preservar a prioridade atual da tela na previa local.
- RF-07: Preservar cabecalho, contador e controles acessiveis sem
  sobreposicao pela midia. A grade deve permitir rolagem vertical quando
  os tiles nao couberem com altura legivel, sem gerar rolagem horizontal.
- RF-08: Sem participantes, manter a mensagem de chamada vazia existente.
  Preservar atributos de reproducao, audio local mudo e controle de audio
  remoto existentes.

### Nao funcionais

- RNF-01: Manter linguagem visual, cores, tipografia, icones e controles
  existentes. Alterar apenas disposicao e dimensionamento pertinentes.
- RNF-02: Regras CSS limitadas ao VoiceStage; estilos compartilhados com
  VoiceBar nao devem alterar o comportamento desse componente.
- RNF-03: Sem dependencias novas ou mudancas de API/protocolo; preferir
  CSS Grid e estado reativo existente, sem timers ou listeners globais.
- RNF-04: Preservar a vinculacao de `srcObject` corrigida em
  `docs/specs/local-camera-preview.md` e sua cobertura de regressao.

## 4. Modos, plataformas e UI/UX

- P2P: modo ativo; quantidade e estados vindos da lista existente.
- Server: manter compatibilidade do componente compartilhado sem reativar
  esse modo nem mudar seu provider.
- Plataformas: navegador e renderer Electron; desktop e janelas estreitas.
- Grade baseada na largura efetiva do palco, inclusive com chat lateral,
  nao somente na largura da janela.
- A regra existente que oculta o palco com chat lateral aberto em telas
  de ate 700 px continua valida. Testar o palco estreito com chat fechado.
- Em contagens impares, a ultima linha pode ficar incompleta; nao duplicar
  participantes nem ampliar um tile isolado como se fosse o unico na sala.

## 5. Contratos afetados

Apenas apresentacao interna de `VoiceStage.vue` e seus estilos.
Reutilizar a lista `members`, flags de video/tela, streams e identificacao.
Classes ou estilos locais podem refletir contagem e compartilhamento.

API, erros de servico, WS, providers, eventos P2P e IPC: nao se aplica,
pois seus contratos permanecem inalterados. Sem payloads novos,
versionamento ou mudanca da origem dos dados.

## 6. Estado, persistencia e migracoes

Layout derivado de estado ja existente no renderer. Nao persistir contagem,
colunas ou dimensoes. Persistencia, schema e migracoes nao se aplicam;
nenhuma alteracao de bancos, identidades ou perfis.

## 7. Autenticacao, autorizacao, privacidade e recursos

Nao se aplica mudanca de autenticacao/autorizacao: preservar fluxo de
entrada e visibilidade de canais. Nao solicitar permissoes adicionais,
capturar/gravar midia ou registrar conteudo de streams.

A mudanca visual nao cria peers, trilhas ou capturas adicionais.
Rolagem deve manter participantes acessiveis sem prometer aumento da
capacidade do mesh WebRTC.

## 8. Falhas e recuperacao

- Fonte de video ausente ou indisponivel: preservar tratamento atual;
  layout nao garante recuperacao de captura ou recepcao.
- Atualizacoes da lista: recompor layout sem alterar chaves dos participantes
  para forcar remontagem dos videos.
- Redimensionamento/chat lateral: reajustar grade sem captura adicional.
- Lista vazia apos saida: voltar ao estado vazio existente.
- Offline, timeout, reconexao e conflitos: sem nova logica; usar a lista
  fornecida pelo fluxo atual, sem inventar presenca ou participantes.

## 9. Criterios de aceite

- CA-01 (RF-01, RF-07): Um participante, local ou remoto, ocupa toda a
  area de midia; cabecalho e controles continuam visiveis.
- CA-02 (RF-02, RF-03): Com 2, 3, 4 e 6 participantes, com e sem video,
  tiles aparecem em grade de celulas iguais, sem sobreposicao.
- CA-03 (RF-04, RF-08, RNF-04): Transicoes 0 -> 1 -> 2 -> 1 -> 0 atualizam
  a disposicao sem quebrar a previa local ou reiniciar captura.
- CA-04 (RF-05, RF-06): Avatar/nome/indicadores continuam legiveis;
  camera preenche proporcionalmente e tela compartilhada nao e cortada.
- CA-05 (RF-02, RF-07, RNF-02): Desktop, janela estreita e palco reduzido
  pelo chat nao geram overflow horizontal; grade rola verticalmente quando
  necessario, controles continuam acessiveis e VoiceBar nao muda.
- CA-06 (RF-08, RNF-03, RNF-04): Testes de componente e de previa local,
  suite web, build e verificacao de whitespace passam sem dependencias
  novas ou alteracoes de contratos.

## 10. Estrategia de testes

Automatizados:

- Exercitar componente com lista simulada, incluindo contagens e transicoes,
  camera/tela/avatares e preservacao dos elementos e streams.
- Reutilizar ferramentas Vue ja instaladas e testes da previa local;
  nao instalar ferramenta de browser apenas para esta entrega.
- `npm --prefix web test`, `npm run build`, `git diff --check`.

Visuais/manuais no navegador e Electron:

- Conferir um participante com camera, sem camera e com tela compartilhada.
- Conferir grade com 2, 3, 4 e 6 participantes e entradas/saidas.
- Conferir janela larga e estreita, chat aberto/fechado, rolagem vertical,
  nomes, indicadores e acesso aos controles.
- Para layout, cenarios simulados com dados descartaveis sao aceitaveis;
  identificar simulacao explicitamente. Nao confundir isso com teste
  de entrega real de midia entre peers.

Registrar plataforma, dimensoes, cenarios e resultado observado.
Testes de componente sem navegador nao comprovam geometria CSS; build
nao substitui validacao visual. Criterios visuais obrigatorios pendentes
impedem declarar a task concluida.

## 11. Riscos e decisoes em aberto

- Altura disponivel pequena e muitos participantes exigem rolagem; evitar
  reduzir tiles a ponto de ocultar nomes e midia.
- Estilos de avatar e indicador de fala precisam permanecer visiveis
  dentro dos novos limites dos tiles.
- A correcao anterior ainda possui pendencias manuais documentadas;
  nao encerra-las por inferencia nesta entrega.
- Nenhuma decisao bloqueante. Adotados: preencher a area interna do palco,
  contar todos os participantes e preservar tela compartilhada sem corte.

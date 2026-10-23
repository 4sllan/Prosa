# Correcao da permissao de microfone

- Status: aprovada
- Data: 2026-10-23
- Aprovacao: usuario autorizou a proxima fase com "continuar" apos a entrega
  da spec em revisao e o pedido de aprovacao para criar as tasks.
- Fase: planejamento de tasks; implementacao nao iniciada.

## Objetivo e contexto

Reconhecer a autorizacao concedida pelo usuario no macOS e iniciar a captura
de audio ao entrar em um canal, sem manter mensagens incorretas de permissao.
A interface deve distinguir consentimento, captura em andamento e microfone
efetivamente disponivel.

Evidencias do codigo atual:

- `web/src/rtc.js`: `joinVoice` encerra a chamada anterior, executa
  `getUserMedia({ audio: true })` e publica a entrada no canal. Nao representa
  autorizacao, inicializacao ou erro; nao protege tentativas concorrentes.
- `web/desktop/main.cjs` e `permissions.cjs`: a sessao permite `media`, mas
  nao coordena explicitamente o consentimento nativo com `systemPreferences`.
- `web/desktop/preload.cjs`: nao existe operacao para autorizar o microfone.
- `web/src/views/HomeView.vue`: os chamadores de `joinVoice` nao tratam falhas.
- `web/electron-builder.yml`: nao declara descricao de uso do microfone.
  `web/build/entitlements.plist`, usado na assinatura manual documentada,
  nao declara acesso a entrada de audio.

Essas lacunas sao observadas no fonte, nao uma comprovacao da causa exata no
pacote instalado. A mensagem relatada de "liberar o microfone" nao foi localizada
no fonte atual. A versao instalada e o pacote corrigido precisam ser conferidos
na validacao manual.

## Escopo e plataformas

- Prioridade: app Electron no macOS, em desenvolvimento e empacotado.
- Modo P2P atual; preservar o motor de voz compartilhado com o modo `server`,
  que permanece inativo na interface.
- Preservar captura via navegador e Electron em Windows/Linux, sem chamar
  APIs exclusivas do macOS nesses ambientes.
- Corrigir autorizacao, inicializacao, falhas, recuperacao explicita e
  apresentacao do estado local do microfone.
- Documentar o fluxo e suas limitacoes no README durante a implementacao.

Fora de escopo: camera, compartilhamento de tela, selecao de dispositivos,
reconexao automatica de voz, alteracoes de mesh/STUN/TURN, reativacao do modo
server, novas dependencias, assinatura Developer ID e notarizacao.

## Requisitos funcionais

- RF-01: no macOS/Electron, consultar a autorizacao nativa antes da captura.
  Solicitar consentimento somente em `not-determined`, como consequencia de
  uma tentativa explicita de entrar em voz. Aguardar a decisao antes de
  continuar; com acesso concedido, iniciar a captura na mesma tentativa,
  sem exigir segundo clique ou reinicio na primeira autorizacao.
- RF-02: estados nativos `denied` e `restricted` impedem a captura e produzem
  orientacao adequada. Nao repetir prompts quando o sistema ja negou acesso.
  `unknown` ou falha na consulta nao podem ser apresentados como autorizacao
  concedida nem como negativa confirmada.
- RF-03: considerar captura pronta apenas com uma faixa de audio `live`.
  Publicar entrada em voz e disponibilizar controles de chamada somente
  apos obter essa captura. Consentimento concedido sozinho nao significa
  que existe microfone utilizavel.
- RF-04: representar na interface solicitacao de autorizacao, inicializacao
  de captura e erro. Limpar erros anteriores ao iniciar nova tentativa e
  apos sucesso. Nao classificar toda falha de `getUserMedia` como negativa
  de permissao.
- RF-05: oferecer nova tentativa explicita apos falha. Para negativa no macOS,
  orientar Ajustes do Sistema > Privacidade e Seguranca > Microfone.
  Informar que pode ser necessario encerrar e reabrir o Prosa quando uma
  negativa anterior for alterada nos Ajustes. Nao prometer recuperacao
  imediata nem abrir ajustes automaticamente.
- RF-06: manter no maximo uma inicializacao de voz pendente. Cliques repetidos
  nao devem disparar novos prompts, capturas ou entradas em canais; bloquear
  novas entradas/trocas enquanto a tentativa atual estiver pendente.
  A saida/cancelamento deve invalidar a tentativa pendente. Se a captura
  resolver depois disso, parar suas faixas e nao entrar no canal.
- RF-07: em falha ou saida, liberar recursos da tentativa, encerrar faixas
  adquiridas e remover estados locais de conexao criados por ela. Se houve
  publicacao de entrada antes de uma falha posterior de inicializacao,
  executar a saida correspondente pelo contrato existente. Manter a
  confirmacao de troca entre canais; uma troca confirmada pode continuar
  encerrando a chamada anterior, sem rollback para ela.
- RF-08: se a faixa de audio encerrar inesperadamente durante uma chamada,
  nao continuar indicando microfone operacional. Informar a interrupcao e
  permitir recuperacao por saida e nova entrada explicitas, sem recaptura
  automatica. Mutar uma faixa nao equivale a encerramento ou revogacao.
- RF-09: tornar explicita a descricao de uso do microfone no pacote macOS e
  garantir o entitlement de entrada de audio no fluxo de assinatura adotado.
  Verificar o pacote final; nao assumir que o arquivo de configuracao
  comprova a assinatura efetiva.

## Requisitos nao funcionais e seguranca

- RNF-01: preservar `contextIsolation`, sandbox e ausencia de Node no renderer.
  O novo IPC aceita apenas a operacao fixa de microfone e valida que o emissor
  e o frame principal da janela Prosa e corresponde a URL confiavel do app.
- RNF-02: nao ampliar permissoes genericas, expor `ipcRenderer`, metodos
  arbitrarios de `systemPreferences`, chaves privadas ou caminhos locais.
- RNF-03: estado de permissao nativa nao deve ser armazenado como verdade
  persistente; reconsultar a cada tentativa. Nao gravar audio, identificadores
  de dispositivos, SDP, tokens ou dados pessoais nos novos diagnosticos.
- RNF-04: reutilizar os componentes e estilos atuais, com mensagem acessivel
  de progresso (`role="status"`) e erro (`role="alert"`), acao de nova tentativa
  acessivel por teclado e layout utilizavel em desktop e viewport estreita.
- RNF-05: nao adicionar dependencias; manter compatibilidade dos providers,
  protocolos e comportamento de mute, alto-falante, video e tela.

## Contratos afetados

### Electron IPC

Adicionar a ponte restrita `window.prosaDesktop.ensureMicrophoneAccess()`,
sem argumentos, pelo canal `media:ensure-microphone-access`.

Resposta serializavel:

```json
{ "status": "granted" }
```

Valores de `status`: `granted`, `denied`, `restricted`, `unknown` e
`not-applicable`. O ultimo indica plataforma sem esta etapa nativa, nao
autorizacao concedida; a captura continua sujeita a `getUserMedia`.

No macOS, `not-determined` e um estado intermediario: aguardar
`askForMediaAccess('microphone')` e retornar o resultado efetivo. Falhas da
consulta/solicitacao devem ser tratadas, sem retorno falso de sucesso.
Emissores nao confiaveis sao rejeitados antes de consultar ou solicitar acesso.
Chamadas concorrentes validas devem compartilhar a solicitacao nativa pendente.

No navegador, a ausencia da ponte e esperada e a autorizacao permanece a cargo
de `getUserMedia`. No macOS/Electron, ausencia ou falha da operacao esperada
deve produzir erro de inicializacao, nao contornar a etapa nativa silenciosamente.

### Motor de voz e interface

Manter `joinVoice(channelId, name)` e `leaveVoice()` como pontos de entrada.
Adicionar estado reativo transitorio para alvo da tentativa, fase da captura
(`idle`, `requesting`, `initializing`, `ready`, `error`) e erro normalizado.
`rtc.muted` continua indicando silenciamento, nao permissao.

Categorias de erro: acesso negado/restrito, dispositivo ausente
(`NotFoundError`), captura indisponivel (`NotReadableError`), falha de
autorizacao/captura nao confirmada e interrupcao da faixa. `NotAllowedError`
com permissao nativa concedida deve informar bloqueio de captura, sem afirmar
que o usuario negou acesso no macOS. Nao exibir detalhes internos brutos.
As falhas devem ser tratadas no fluxo, sem rejeicoes nao observadas pela UI.

A mensagem de progresso/erro deve estar visivel no contexto do canal alvo
mesmo antes de `rtc.channelId` existir. Controles de entrada ficam bloqueados
durante a tentativa; oferecer cancelamento local, sem alegar que ele fecha
o prompt nativo ja aberto. Apos sucesso, remover o erro e mostrar a chamada.
Uma faixa encerrada desabilita o controle de microfone e exibe orientacao
de sair e entrar novamente, sem afirmar que houve revogacao do consentimento.

### API, WS, providers e eventos P2P

Sem alteracoes de payload, versao, endpoint ou autorizacao remota.
Reutilizar `events.joinVoice`, `leaveVoice`, `updateVoice`, `signal` e
`misc.voiceState`. A correcao e local; nao muda verificacoes de acesso do backend,
assinaturas, autoridade ou convergencia P2P.

## Estado, persistencia e migracoes

Somente estado em memoria no processo main e no `rtc` reativo. Invalidar
resultados de tentativas canceladas e remover listeners ao liberar faixas.
Nao criar tabelas, migracoes, eventos persistentes nem preferencias.
A autorizacao continua sob controle do macOS/navegador. Nao alterar identidades,
perfis Electron, bancos reais nem o historico TCC do usuario.

## Falhas, recuperacao e limites

- Sem dispositivo ou captura bloqueada: erro especifico, recursos liberados
  e nova tentativa explicita, sem loop de captura/prompts.
- Sem resposta ao prompt: permanecer em espera com cancelamento local;
  nao usar timeout para inferir negativa do usuario.
- Resultado tardio apos cancelamento: ignorar para conexao e parar faixas
  eventualmente adquiridas. O consentimento do sistema pode ter mudado;
  reconsultar na proxima tentativa.
- Offline/sinalizacao: manter contratos existentes. Captura local pronta
  nao comprova conexao ou transmissao para outros participantes.
- Reconexao automatica e sincronizacao persistente: nao se aplicam a esta
  correcao; nao adicionar filas ou novos eventos.

## Criterios de aceite

| ID | Resultado verificavel | Requisitos |
| --- | --- | --- |
| CA-01 | No macOS sem decisao previa, clicar em Permitir leva a captura e entrada na mesma tentativa; progresso desaparece e nao resta erro de permissao. | RF-01, RF-03, RF-04 |
| CA-02 | Com acesso ja concedido, entrar novamente captura audio sem novo prompt; sem faixa de audio live nao ha entrada anunciada. | RF-01, RF-03 |
| CA-03 | Negativa/restricao nao publica entrada e informa orientacao correta; nova tentativa nao provoca repeticao indevida de prompt. | RF-02, RF-05 |
| CA-04 | Apos alterar negativa nos Ajustes, nova tentativa reconsulta o sistema; se necessario, orienta reinicio sem alegar microfone ativo. | RF-04, RF-05, RNF-03 |
| CA-05 | Dispositivo ausente, ocupado/falha de leitura e bloqueio de captura com consentimento concedido nao sao todos rotulados como permissao negada. | RF-03, RF-04 |
| CA-06 | Cliques concorrentes geram uma tentativa; cancelar e resolver tardiamente nao conecta nem deixa faixas abertas. Falha posterior a entrada desfaz o estado criado. | RF-06, RF-07 |
| CA-07 | Encerramento inesperado da faixa atualiza a UI; mute nao gera erro de permissao. Sair libera faixas/listeners e permite nova entrada. | RF-07, RF-08 |
| CA-08 | IPC recusa frame/origem indevidos; navegador e Electron fora do macOS mantem captura sem APIs nativas exclusivas. | RNF-01, RNF-02, RNF-05 |
| CA-09 | Pacote macOS contem descricao de uso e entitlement efetivo de audio; fluxo de consentimento e captura e validado no pacote, nao apenas no Vite. | RF-09 |
| CA-10 | Mensagens e acoes sao acessiveis em desktop/viewport estreita; testes existentes de voz continuam passando sem mudancas de protocolo. | RF-04, RNF-04, RNF-05 |

## Estrategia de validacao

Automatizada, com dados descartaveis e mocks sem microfone/rede reais:

- Testar estados nativos, espera pela decisao, falha de API, deduplicacao e
  validacao do emissor IPC.
- Testar ordenacao autorizacao/captura/entrada, erros, cancelamento, resultados
  tardios, limpeza e encerramento de faixa no motor real com dependencias simuladas.
- Testar renderizacao dos estados e acoes no componente real, reaproveitando
  o padrao Vue dos testes existentes.
- Executar `npm --prefix web test`, `npm run build` e `git diff --check`.
  Conferir configuracao/plists, alem de verificar pacote e assinatura efetivos.
  Suite do servidor nao e obrigatoria sem alteracoes nele.

Manual, com permissao do usuario para iniciar app e usar microfone:

- Registrar versao/caminho do pacote em teste e distinguir de Electron dev.
- Validar CA-01 a CA-05 no app macOS empacotado, incluindo negativa alterada
  nos Ajustes; nao resetar TCC ou apagar perfil para preparar cenarios.
  Sem ambiente com consentimento ainda nao decidido, CA-01 fica pendente.
- Validar cliques repetidos, cancelamento, saida/nova entrada, interrupcao da
  captura, mute e estados visuais/acessibilidade em largura reduzida.
- Validar navegador em contexto seguro e compatibilidade fora do macOS
  quando esses ambientes estiverem disponiveis; registrar lacunas.

Mocks e build Vue nao comprovam permissao nativa nem conectividade WebRTC.
Registrar resultados automatizados e manuais separadamente; aceite manual
obrigatorio pendente impede declarar a correcao integralmente validada.

## Riscos e decisoes em aberto

- A causa exata no artefato relatado ainda nao foi reproduzida; verificar se
  corresponde ao fonte antes de atribuir o defeito exclusivamente ao fluxo.
- Assinatura ad-hoc, identidade/caminho do app e comportamento do TCC podem
  afetar testes; nao modificar a identidade nem substituir instalacoes reais
  silenciosamente para tentar contornar o problema.
- O Electron documenta possivel necessidade de reinicio apos uma negativa
  alterada nos Ajustes; a correcao nao pode eliminar essa restricao do sistema.
- Nenhuma decisao bloqueante para revisao. Nomes internos do estado podem ser
  ajustados na implementacao sem alterar os comportamentos e contratos descritos.

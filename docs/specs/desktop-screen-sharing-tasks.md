# Tasks - Compartilhamento de tela no app

- Spec: `docs/specs/desktop-screen-sharing.md` (aprovada).
- Data: 2026-10-23.
- Status geral: implementacao concluida; compartilhamento real confirmado pelo
  usuario no macOS, T4 aguardando os demais cenarios manuais.
- Aprovacao da spec: usuario respondeu "continuar" apos sua entrega e o
  pedido de aprovacao para criar as tasks.
- Aprovacao do plano e autorizacao de T1: usuario respondeu "continuar"
  apos a entrega das tasks e o pedido explicito para executar T1.
- Autorizacao de T2: usuario respondeu "continuar" apos a conclusao de T1
  e o pedido explicito para executar T2.
- Autorizacao de T3: usuario respondeu "continuar" apos a conclusao de T2
  e o pedido explicito para executar T3.
- Autorizacao de T4: usuario respondeu "continuar" apos a conclusao de T3
  e o pedido explicito para executar T4.
- Execucao: T1 -> T2 -> T3 -> T4, uma task por autorizacao explicita.
- Preservar implementacoes existentes de microfone, previa local e layout.
- Nao alterar providers, renegociacao WebRTC, dependencias ou dados reais.

## Contratos de implementacao

Detalhamento do contrato aprovado, sem alterar seu escopo:

- Modulo desktop proposto: `web/desktop/screen-sharing.cjs`, com dependencias
  injetaveis para testar sem iniciar Electron ou acessar dispositivos reais.
- Namespace proposto na ponte: `prosaDesktop.screenSharing`.
- `onRequest(listener)` recebe o evento `media:screen-request` com
  `{ requestId, sources }`, conforme a spec, e retorna funcao de unsubscribe.
- `respond({ requestId, sourceId })` invoca `media:screen-response`;
  `sourceId: null` cancela. Uma resposta nao pode selecionar fonte de outra
  tentativa, janela, frame ou navegacao.
- `cancel()` invoca `media:screen-cancel`, sem argumentos, e cancela somente
  a tentativa pendente pertencente ao frame principal remetente. Deve cobrir
  tambem a enumeracao em andamento, antes de a lista chegar ao renderer.
- `onResult(listener)` recebe `media:screen-result` com `{ requestId, status,
  code }` e retorna unsubscribe. Status: `selected`, `cancelled` ou `error`.
  Codigos seguros previstos: `no-sources`, `source-unavailable`, `timeout`,
  `permission-denied`, `permission-restricted` e `capture-failed`.
- Eventos de resultado servem ao fechamento do seletor e a erros conhecidos
  pelo main; `selected` nao significa captura pronta. Somente uma trilha viva
  retornada por `getDisplayMedia` confirma sucesso no RTC.
- Registrar listeners antes da chamada de captura, sem aguardar operacao
  assincrona antes de `getDisplayMedia`. Limpar listeners ao resolver/invalidar
  a tentativa; ignorar eventos e respostas obsoletos.
- `getDisplayMedia` permanece a porta de entrada em web e desktop; a ponte
  nao oferece captura arbitraria nem expoe objetos Electron ou IPC generico.

## T1 - Integrar selecao segura de fontes no Electron

- Status: concluida.
- Requisitos/aceite: RF-01, RF-03 a RF-06, RF-08, RNF-01, RNF-02, RNF-04;
  parte automatizada de CA-02, CA-03, CA-05 e CA-06.
- Dependencias: nenhuma.
- Escopo e arquivos provaveis: `web/desktop/screen-sharing.cjs`,
  `web/desktop/main.cjs`, `web/desktop/preload.cjs`,
  `web/desktop/permissions.cjs` somente se necessario reutilizar validacao;
  `web/test/desktop-screen-sharing.test.js`.
- Implementacao: registrar handler e IPC antes de carregar a pagina; validar
  WebContents registrado, frame principal, URL confiavel, gesto e pedido de
  video. Enumerar telas/janelas no main e expor dados de apresentacao com
  identificadores opacos; conservar objetos reais somente no main.
- Implementacao: respeitar consentimento do sistema, sem API de solicitacao
  de microfone/camera para tela. Consultar status nativo apenas onde aplicavel;
  nao classificar erros desconhecidos como negativa confirmada.
- Implementacao: uma tentativa por janela, timeout de 60 segundos desde a
  solicitacao e callbacks unicos. Revalidar frame/URL/fonte na resposta.
  Resolver com fonte escolhida ou negacao, nunca com a primeira fonte por
  padrao; nao conceder audio do sistema.
- Implementacao: limpar listas, miniaturas, timers e listeners da requisicao
  em resposta, erro, cancelamento, navegacao ou destruicao. Enumeracao tardia
  nao pode reabrir tentativa encerrada. Encapsular listeners no preload sem
  expor o objeto de evento IPC.
- Testes e comandos de validacao: testes com sessao, capturer, frames, IPC,
  status nativo e timers simulados; `node --test
  web/test/desktop-screen-sharing.test.js`; `npm --prefix web test`;
  `git diff --check`.
- Criterio de conclusao: handler/ponte testados para sucesso, cancelamento,
  sem fontes, enumeracao rejeitada, fonte obsoleta, timeout, concorrencia,
  navegacao/destruicao durante enumeracao/selecao, payload invalido,
  subframe/origem indevida, replay e callback unico. Sem app ou dados reais.
- Evidencias (2026-10-23): criado `web/desktop/screen-sharing.cjs`; integrado
  ao `main.cjs` antes do carregamento da pagina, uma vez por sessao; ponte
  tipada adicionada ao `preload.cjs`. Nenhum acesso Node foi exposto ao renderer.
- Evidencias: fontes e requests usam UUIDs opacos; lista limitada a 128 fontes
  e nomes a 512 caracteres, com miniaturas solicitadas em 320x180. Selecao
  reenumera fontes para detectar janelas fechadas e revalida frame/permissao.
  Timeout de 60 segundos e saida cancelam sem conceder captura.
- Evidencias: criado `web/test/desktop-screen-sharing.test.js` e ajustado o
  teste de integracao do main em `desktop-microphone.test.js` para a nova
  dependencia e a verificacao de registro do handler antes de carregar a pagina.
- Validacoes: `node --test web/test/desktop-screen-sharing.test.js` passou
  (51/51); `npm --prefix web test` passou (445/445), incluindo microfone,
  permissoes e previa existentes. Node v24.18.1.
- Validacoes: `node --check` em main, preload e novo modulo passou;
  `git diff --check` e verificacao de whitespace dos arquivos novos passaram.
  A suite emite o aviso existente de package sem `type: module`; sem falhas.
- Criterios atendidos: todos os criterios isolados de T1, incluindo cancelamento
  durante enumeracao/revalidacao, resultado tardio, callback unico, isolamento
  por janela, payload/origem/frame invalidos, replay e limpeza de recursos.
- Limitacoes: sem iniciar app, acessar dispositivos ou dados reais. Esta task
  nao entrega a UI nem comprova abertura/captura no pacote; essas validacoes
  permanecem em T3/T4. Build web nao executado nesta task exclusiva de desktop.

## T2 - Controlar captura, falhas e encerramento no RTC

- Status: concluida.
- Requisitos/aceite: RF-03 a RF-09, RNF-02, RNF-04; parte automatizada de
  CA-02 a CA-05 e CA-07.
- Dependencias: T1 concluida.
- Escopo e arquivos provaveis: `web/src/rtc.js`,
  `web/test/rtc-screen-sharing.test.js`; testes existentes de RTC se necessario.
- Implementacao: estado reativo transitorio separado de `rtc.screen` para
  fase, selecao e erro; uma tentativa identificada pela sessao local da chamada.
  Exportar operacoes de selecao/cancelamento para a UI, sem acesso Node.
- Implementacao: no clique, registrar listeners desktop quando disponiveis e
  chamar imediatamente `getDisplayMedia({ video: true })`. Falta de ponte
  necessaria no desktop deve produzir erro recuperavel, sem capturar fonte
  automatica; navegador nao depende de ponte.
- Implementacao: marcar captura ativa somente com trilha de video viva; ligar
  previa, remetentes e publicacao existentes. Tratar falha parcial liberando
  trilhas/remetentes adquiridos sem interromper camera/audio ou esconder erro.
- Implementacao: separar parada idempotente de alternancia. Invalidar pendencias
  na saida/troca, parar streams tardios e remover listeners; um `ended` antigo
  nao pode parar nova captura ou reabrir o seletor.
- Implementacao: cancelamento conhecido e silencioso; negativa confirmada recebe
  orientacao macOS; negativa/cancelamento ambiguos da web nao devem gerar
  diagnostico falso. Permitir nova tentativa explicita, limpar erros antigos.
- Testes e comandos de validacao: motor real com servicos/dispositivos/ponte
  simulados; `node --test web/test/rtc-screen-sharing.test.js`;
  `npm --prefix web test`; `npm run build`; `git diff --check`.
- Criterio de conclusao: testes de sucesso, cancelamento, rejeicao, trilha
  ausente/encerrada, cliques repetidos, fonte/resultados obsoletos, saida antes
  da lista e durante captura, parada por botao/sistema, sinalizacao falhando,
  preservacao de camera/audio e fluxo web sem IPC. Sem publicacao indevida.
- Evidencias (2026-10-23): alterado somente `web/src/rtc.js` na implementacao;
  criado `web/test/rtc-screen-sharing.test.js`. Preservados handler/ponte de T1,
  captura de microfone, camera, providers e sinalizacao existente.
- Evidencias: estado `rtc.screenSharing` tem `{ phase, requestId, sources,
  error }`. Fases: `idle`, `initializing`, `selecting`, `capturing`, `active`
  e `error`. IDs/fontes ficam visiveis somente durante `selecting`; a captura
  ativa continua indicada por `rtc.screen` e `rtc.screenStream`.
- Evidencias: exportadas `selectScreenSource(requestId, sourceId)`,
  `cancelScreen()` e `stopScreen()`. `toggleScreen()` inicia/para; repeticoes
  durante a tentativa sao ignoradas. Listeners desktop sao registrados antes
  da chamada sincrona de `getDisplayMedia`, preservando o gesto do clique.
- Evidencias: tentativas sao vinculadas a sessao de voz, nao apenas ao ID do
  canal. Saida/troca invalida pendencias; streams tardios sao parados e eventos
  `ended`/respostas/sinalizacao obsoletos nao afetam nova captura ou chamada.
- Evidencias: cancelamento desktop confirmado e silencioso; `NotAllowedError`
  ambiguo vira `capture-blocked`, sem diagnostico de negativa macOS.
  `permission-denied`/`permission-restricted` sao conservados apenas a partir
  do resultado nativo macOS. Erros desconhecidos nao expoem detalhes brutos.
- Evidencias: erro de captura/adicao parcial/sinalizacao libera a tela sem
  parar audio/camera; a parada remove listeners/remetentes e independe do
  sucesso da publicacao. Uma lista limitada de IDs aposentados ignora replays
  sem conservar nomes ou miniaturas.
- Recuperacao para T3: erros adicionais locais incluem `desktop-unavailable`,
  `capture-unavailable`, `capture-unreadable`, `capture-blocked`,
  `capture-pending` e `signaling-failed`, alem dos codigos desktop existentes.
  O feedback visual e a orientacao macOS serao implementados em T3.
- Limitacao da API: `getDisplayMedia` nao e abortavel. A invalidacao limpa
  estado/listeners imediatamente e solicita cancelamento desktop; nova captura
  e bloqueada com `capture-pending` ate a captura antiga resolver/rejeitar e o
  IPC de cancelamento responder, evitando que um cancelamento atrasado alcance
  a nova tentativa. Na web, pode ser necessario fechar o seletor do navegador.
- Validacoes: `node --test web/test/rtc-screen-sharing.test.js` passou (60/60);
  `npm --prefix web test` passou (505/505); `npm run build` passou;
  `node --check web/src/rtc.js`, `git diff --check` e whitespace dos novos
  arquivos passaram. Node v24.18.1. Sem novas dependencias.
- Avisos nao bloqueantes: package web sem `type: module` nos testes e bundle
  Vite maior que 500 kB. Nao houve falhas na execucao final.
- Criterios atendidos: todos os criterios isolados de T2; os testes incluem
  o motor RTC real com o handler desktop real de T1, usando IPC, fontes,
  permissoes, dispositivos e timers simulados, sem iniciar o app.
- Limitacoes: UI/seletor ainda dependem de T3; nao houve captura fisica ou
  verificacao no pacote. Validacao manual permanece em T4; build nao a substitui.

## T3 - Exibir seletor e feedback acessiveis nos controles de voz

- Status: concluida.
- Requisitos/aceite: RF-01 a RF-09, RNF-03; parte automatizada de CA-01,
  CA-02, CA-03, CA-04 e CA-07.
- Dependencias: T2 concluida.
- Escopo e arquivos provaveis: novo `web/src/components/ScreenSharePicker.vue`,
  `web/src/components/VoiceStage.vue`, `web/src/components/VoiceBar.vue`,
  `web/src/views/HomeView.vue`, `web/src/style.css`,
  `web/test/screen-sharing-ui.test.js` e testes de UI/previa afetados.
- Implementacao: montar uma unica instancia do seletor no ancestral comum dos
  controles de voz; lista de fontes com nomes/miniaturas, escolha explicita e
  cancelamento. Nao duplicar seletor/listeners quando ambos os controles existirem.
- Implementacao: estado pendente e erro compartilhados nos dois controles;
  impedir nova tentativa enquanto a atual aguarda. Falhas nao removem a chamada
  nem afetam controles de audio/camera; repetir usa o mesmo fluxo do clique.
- Implementacao: dialogo rotulado, navegacao por teclado, foco contido,
  Escape, foco inicial e restauracao ao controle de origem quando ainda existir;
  tratar saida da chamada com o dialogo aberto sem foco em elemento removido.
- Implementacao: preservar design, responsividade e previa tela/camera existentes.
  Mostrar orientacao macOS somente com evidencia adequada e feedback neutro
  para ambiguidade do navegador. Nao renderizar nomes das fontes como HTML.
- Testes e comandos de validacao: componentes montados com ponte/RTC simulados;
  `node --test web/test/screen-sharing-ui.test.js`;
  `npm --prefix web test`; `npm run build`; `git diff --check`.
- Criterio de conclusao: testes verificam abertura unica, escolha, cancelar,
  Escape, foco, disabled/loading, erros e recuperacao nos dois controles;
  regressao da prioridade da tela e restauracao da camera passa. Verificacao
  real de dispositivos/pacote permanece obrigatoria em T4.
- Evidencias (2026-10-23): criado `web/src/components/ScreenSharePicker.vue`,
  montado uma unica vez em `HomeView.vue`. Usa `rtc.screenSharing` e as
  operacoes de T2, sem listeners IPC adicionais nem alteracoes no motor RTC.
- Evidencias: seletor proprio em `<dialog>` HTML com `showModal`, rotulos
  acessiveis, nomes/miniaturas, botoes de escolha explicita e Cancelar. Nao
  depende do seletor experimental do sistema do Electron. O foco inicial fica
  em Cancelar; Tab/Shift+Tab circulam nos controles, Escape e cancel nativo
  cancelam a tentativa.
- Evidencias: origem do clique e conservada antes de desabilitar o controle;
  foco retorna apos cancelamento, erro ou captura pronta, somente se o elemento
  continuar conectado e habilitado. Saida/unmount fecha o dialogo, cancela
  pendencias e remove o listener de clique.
- Evidencias: VoiceStage e VoiceBar compartilham loading/disabled,
  `aria-busy`, `aria-pressed` e rotulo de inicio/parada. Camera/audio continuam
  habilitados; a previa existente nao foi alterada.
- Evidencias: feedback acessivel de progresso/erro permite cancelar,
  tentar novamente ou dispensar. Orientacao macOS depende de negativa/restricao
  confirmada; ambiguidade da web recebe texto neutro. O navegador continua
  usando seu seletor, com explicacao da limitacao de cancelamento.
- Evidencias: nomes sao interpolados como texto, sem HTML; somente miniaturas
  locais PNG em data URL sao exibidas, impedindo requisicoes de imagem externas.
  Layout usa variaveis visuais existentes, grade responsiva, lista com rolagem,
  acoes fora da lista e dialogo limitado ao viewport. `style.css` adiciona
  quebra de linha e foco visivel aos controles da VoiceBar.
- Evidencias: criado `web/test/screen-sharing-ui.test.js`; fixtures de
  `local-camera-preview.test.js` e `voice-ui.test.js` atualizadas para o novo
  estado/componente, preservando suas verificacoes anteriores.
- Validacoes: `node --test web/test/screen-sharing-ui.test.js` passou (34/34);
  `npm --prefix web test` passou (539/539); `npm run build` passou;
  `git diff --check` e verificacao de whitespace dos arquivos novos passaram.
  Node v24.18.1; sem novas dependencias.
- Avisos nao bloqueantes: package web sem `type: module` nos testes e bundle
  Vite maior que 500 kB, como nas tasks anteriores.
- Criterios atendidos: criterios isolados de T3, incluindo abertura unica na
  Home e em ancestral comum dos dois controles, escolha, cancelamento, Escape,
  foco, unmount, loading, erros/recuperacao, previa tela/camera e fluxo web.
- Limitacoes: testes montam componentes reais com DOM/modal e RTC simulados.
  Nao houve verificacao visual, foco nativo, captura fisica, permissao nativa
  ou execucao do app empacotado. Essas verificacoes, inclusive janela minima
  e layout mobile, permanecem obrigatorias em T4; build nao as substitui.

## T4 - Documentar e validar o fluxo integrado no app e na web

- Status: aguardando validacao.
- Requisitos/aceite: RF-01 a RF-09, RNF-01 a RNF-04; CA-01 a CA-08.
- Dependencias: T3 concluida.
- Escopo e arquivos provaveis: `README.md`, este plano; correcoes somente de
  defeitos do escopo aprovado, acompanhadas de regressao.
- Implementacao: documentar selecao, cancelamento, permissoes e limites de
  plataforma. Distinguir captura/previa local de transmissao remota, sem
  anunciar a correcao da renegociacao WebRTC.
- Testes e comandos de validacao: `npm --prefix web test`, `npm run build`,
  `git diff --check`; conferir diff final e correspondencia com a spec.
- Validacao manual: macOS Electron dev e app empacotado com identidade/versao
  registradas; escolher tela/janela, cancelar, repetir, parar pelo sistema,
  negar acesso, reautorizar/reabrir se necessario, sair/trocar de chamada
  durante selecao e conferir camera/audio preservados.
- Validacao manual: navegador sem ponte; iniciar/parar/cancelar, verificar foco,
  teclado, janela minima e layout responsivo. Registrar disponibilidade real
  das APIs e restricoes observadas; nao declarar Windows/Linux validados sem teste.
- Seguranca operacional: nao iniciar backend, resetar consentimento, apagar
  perfis/dados, instalar dependencias ou publicar artefatos para validar.
  Builds que precisem de rede, alteracoes de instalacao ou outras permissoes
  adicionais exigem autorizacao especifica. Se precisar criar perfil de teste,
  usar dados descartaveis isolados, nunca sobrescrever o perfil existente.
- Criterio de conclusao: registrar resultados por criterio, comandos e limitacoes.
  CA-01 e negativa nativa de CA-03 exigem verificacao no pacote. Se faltar
  acesso a essa validacao, manter T4/entrega como `aguardando validacao`,
  sem confundir mocks/build com captura fisica.
- Evidencias (2026-10-23): README atualizado com selecao explicita, teclado,
  estados/recuperacao, limite de cancelamento, permissao macOS, privacidade,
  limitacoes de plataforma e separacao entre previa local e entrega remota.
- Validacoes automatizadas: `npm --prefix web test` passou (539/539);
  `npm run build` passou; `git diff --check` e whitespace dos arquivos novos
  passaram. Mantidos os avisos nao bloqueantes de package sem `type: module`
  e bundle Vite maior que 500 kB. Nao houve mudanca de implementacao em T4.
- Ambiente observado: Node v24.18.1, macOS 26.3.1 / Darwin 25.3.0, arm64;
  Electron local 33.4.11, Chromium 130.0.6723.191; app 0.3.0.
- Validacao de UI em runtime: compilados os componentes reais VoiceStage,
  VoiceBar e ScreenSharePicker com CSS/fontes locais em fixture temporaria.
  RTC/fontes eram ficticios; rede e permissoes de dispositivos foram negadas.
  Electron usou perfil novo em `/tmp/prosa-screen-validation.YQWxSK/profile`,
  sem iniciar bootstrap, providers, identidade ou bancos do Prosa.
- Resultado em DOM/renderer reais: em 1280x800 (escuro), 800x600 (claro) e
  390x844 (escuro), o dialogo ficou dentro do viewport, com lista rolavel e
  Cancelar visivel. Passaram foco inicial em Cancelar, Tab/Shift+Tab,
  cancelamento por Escape, escolha por Enter e retorno ao controle de origem.
  Capturas da propria pagina ficticia foram inspecionadas visualmente; nao
  houve captura da area de trabalho. Viewport mobile nao equivale a dispositivo.
- Evidencias temporarias: fixture e imagens em
  `/tmp/prosa-screen-validation.YQWxSK/`, incluindo
  `picker-1280-dark.png`, `picker-800-light.png` e `picker-390-dark.png`.
  Arquivos temporarios podem ser removidos pelo sistema; resultados estao
  registrados aqui. A fixture nao testa permissao nem captura fisica.
- Empacotamento offline: gerado pacote arm64 separado com electron-builder
  25.1.8, Electron local via `electronDist`, `npmRebuild=false`, `--dir`,
  `--publish never` e rede negada por sandbox-exec. Nenhum download/instalacao
  de dependencia ou sobrescrita de `release/` foi necessario.
- Pacote de teste:
  `/tmp/prosa-screen-validation.YQWxSK/package/mac-arm64/Prosa.app`.
  CFBundleIdentifier `com.prosa.app`, versao `0.3.0`, executavel arm64.
  Comparacao byte a byte do ASAR confirmou main, preload, handler, permissoes,
  index e bundles JS/CSS iguais aos fontes/build atuais; sem `.env` ou `data/`.
- Assinatura: aplicado codesign ad-hoc somente ao pacote novo, com
  `web/build/entitlements.plist`. `codesign --verify --deep --strict --verbose=2`
  passou para o app e helpers. Isso nao e assinatura Developer ID, notarizacao
  ou prova de consentimento de captura.
- Seguranca na verificacao inicial: pacote nao instalado nem iniciado naquele
  momento; perfil real, permissoes TCC, bancos, identidades e artefatos anteriores
  de `release/` nao foram alterados pela fixture ou pelo empacotamento.
  O pacote preserva a identidade normal do app e usa o perfil normal quando
  aberto, ao contrario da fixture isolada descrita acima.
- Validacao posterior pelo usuario: apos pedidos explicitos para abrir o app,
  o executavel do pacote foi iniciado com `env -u ELECTRON_RUN_AS_NODE` para
  remover o modo Node herdado do ambiente. O processo permaneceu em execucao
  e o usuario confirmou a abertura com "sim funcinou".
- Captura real: em seguida, o usuario confirmou "funcionou o compartilhamento
  de tela". Isso valida o fluxo principal relatado no pacote de teste macOS,
  sem atribuir ao relato testes de negativa de permissao, ambas as variantes
  tela/janela, parada pelo sistema ou recepcao remota que nao foram descritos.
  Nao houve instalacao, sobrescrita de `release/`, limpeza de perfil ou reset
  de permissoes; a abertura autorizada passou a usar o perfil normal do app.

### Cobertura dos criterios

| Criterio | Resultado registrado |
| --- | --- |
| CA-01 | Fluxo principal real confirmado pelo usuario no pacote macOS; variantes tela/janela e detalhes da previa nao discriminados no relato. |
| CA-02 | Automacao e cancelamento/teclado em DOM real passaram; repetir no pacote. |
| CA-03 | Falhas simuladas passaram; negativa/restricao nativa real pendente. |
| CA-04 | Limpeza e camera/audio cobertos por testes; parada pelo sistema real pendente. |
| CA-05 | Invalidacao e resultados tardios cobertos por testes; chamada real pendente. |
| CA-06 | Atendido por testes desktop/IPC: origem/frame, payload, fonte, replay e callback unico. |
| CA-07 | Fluxo web sem ponte coberto por testes; seletor/captura no navegador real pendentes. |
| CA-08 | Atendido: suites, build, empacotamento offline e documentacao sem novas dependencias. |

### Roteiro manual e pendencias

1. Registrar qual pacote foi aberto (caminho, versao/arquitetura e assinatura),
   sistema e contexto de permissao. Usar pacote com o build atual, nao o DMG
   anterior que permaneceu em `release/`. Nao resetar TCC, apagar perfis ou
   sobrescrever instalacoes para executar o roteiro.
2. Fluxo principal confirmado pelo usuario no pacote. Ainda detalhar no app
   dev e no pacote: clicar em Tela, conferir seletor unico,
   nomes/miniaturas, Cancelar/Escape e nova tentativa; escolher tela e janela
   disponiveis e confirmar a previa correspondente.
3. Com camera/audio ativos, iniciar/parar tela pelo botao e pelo controle do
   sistema. Conferir retorno da previa da camera e continuidade do audio.
4. Sair/trocar de canal durante selecao e enquanto a captura aguarda retorno:
   nenhuma tela deve ser ativada depois, nem alterar uma nova chamada.
5. Em ambiente autorizado, verificar negativa/restricao nativa real e a
   orientacao correspondente; se o usuario alterar a permissao nos Ajustes,
   reabrir o app quando necessario e repetir. Nao alterar consentimento
   automaticamente nem registrar uma negativa simulada como real.
6. No navegador em HTTPS/localhost, sem ponte Electron, repetir iniciar,
   cancelar e parar; conferir foco/teclado e selecao propria do navegador.
   Revisar janela minima e mobile na UI completa, nao apenas na fixture.

- Pendencia bloqueante: negativa/restricao nativa real de CA-03 ainda nao
  comprovada; variantes e demais cenarios do roteiro nao foram detalhados.
  Nao foi observado nem confirmado o comportamento de um prompt negado.
  Windows/Linux e transmissao remota tambem nao foram validados; a correcao
  de renegociacao/entrega remota continua fora do escopo.
- Encerramento desta execucao: documentacao e verificacoes locais prontas,
  T4/entrega aguardando evidencias manuais. Nao ha proxima task a iniciar;
  falta concluir o roteiro autorizado, sem inventar aprovacao ou resultado.

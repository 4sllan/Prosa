# Tasks - Correcao da permissao de microfone

- Spec: `docs/specs/microphone-permission.md` (aprovada).
- Status geral: fluxo principal confirmado pelo usuario; T1 a T3 concluidas,
  T4 aguarda os demais cenarios de validacao manual.
- Aprovacao da spec: usuario respondeu "continuar" apos a entrega da spec
  e o pedido de aprovacao para criar as tasks.
- Aprovacao do plano e autorizacao de T1: usuario respondeu "continuar"
  apos a entrega do plano e o pedido de aprovacao/autorizacao de T1.
- Ordem de execucao: T1 -> T2 -> T3 -> T4, uma task por autorizacao.
- Limite: autorizacao/captura local e UI; sem mudancas de protocolo,
  backend, persistencia, camera, tela ou infraestrutura de conectividade.

## Regras de validacao

- Reler spec, task e diff antes de cada execucao; preservar alteracoes alheias.
- Confirmar Node.js 24 e dependencias locais; nao instalar pacotes ou acessar
  rede sem autorizacao adicional.
- Incluir testes de regressao junto de cada mudanca, com comportamento real
  sob dependencias simuladas, nao somente verificacoes textuais do fonte.
- Usar dados descartaveis e isolados; testes nao devem abrir dispositivos,
  rede, bancos reais, identidades ou perfis Electron do usuario.
- Em cada task, registrar arquivos, comandos, resultados, criterios atendidos
  e pendencias. Revisar diff, whitespace, segredos e arquivos gerados.
- T1 a T3 sao incrementos com aceite automatizado do proprio escopo.
  A validacao nativa/visual integrada obrigatoria fica em T4. A conclusao
  de um incremento nao significa que o defeito no app instalado foi validado.
- Qualquer criterio obrigatorio da task sem evidencia deixa seu status
  como `aguardando validacao` ou `bloqueada`, nunca `concluida`.
- Nao fazer commit, publicar pacote, substituir instalacoes ou iniciar
  a task seguinte sem autorizacao especifica.

## T1 - Autorizar microfone por uma ponte Electron restrita

- Status: concluida
- Requisitos/aceite: RF-01, RF-02, RNF-01 a RNF-03 e RNF-05;
  parcela nativa automatizada de CA-01 a CA-04 e CA-08.
- Dependencias: nenhuma.
- Escopo e arquivos provaveis:
  - `web/desktop/main.cjs`, `web/desktop/preload.cjs`.
  - Modulo restrito de microfone em `web/desktop/`, se necessario para teste.
  - `web/desktop/permissions.cjs`, somente se reutilizar validacao de URL.
  - Testes de microfone em `web/test/` e este plano.
- Implementacao:
  - Expor apenas `ensureMicrophoneAccess()`, sem argumentos, pelo canal
    `media:ensure-microphone-access`, conforme a spec.
  - Validar janela Prosa, frame principal e URL confiavel antes de qualquer
    acesso a `systemPreferences`; rejeitar emissores invalidos.
  - No macOS consultar estado, solicitar somente em `not-determined`,
    aguardar a decisao e retornar status efetivo serializavel.
  - Compartilhar solicitacao nativa pendente entre chamadas validas e
    reconsultar em tentativas posteriores, sem cache persistente.
  - Tratar falhas sem conceder acesso implicitamente. Fora do macOS,
    retornar `not-applicable` sem invocar APIs nativas exclusivas.
  - Preservar politicas existentes e isolamento main/renderer; nao modificar
    outros canais IPC ou permissoes de camera/tela.
- Testes e comandos de validacao:
  - Testar granted/denied/restricted/unknown, espera em not-determined,
    resultado de aceite/negativa, excecao/rejeicao e consulta posterior.
  - Testar deduplicacao concorrente e liberacao da pendencia apos falha.
  - Testar frame secundario, outra janela, URL ausente/invalida, outro arquivo
    local/origem dev e emissor destruido; nenhum deve solicitar acesso.
  - Testar plataforma nao macOS sem chamadas a APIs exclusivas.
  - Executar teste direcionado com `node --test` para os arquivos adicionados,
    `node --test web/test/desktop-permissions.test.js`,
    `npm --prefix web test` e `git diff --check`.
- Criterio de conclusao:
  - Ponte e handler integrados e testes passando; contrato e fronteira
    de seguranca da spec preservados. Captura real ainda nao validada,
    explicitamente reservada a T4.
- Evidencias:
  - Ambiente: Node.js v24.18.1 e dependencias locais; sem instalacao,
    acesso a rede, inicio do aplicativo ou captura real de audio.
  - `web/desktop/microphone.cjs`: handler com validacao de emissor,
    operacao fixa de microfone, consulta nativa e deduplicacao em memoria.
    Consentimento pendente e aguardado; falhas sao sanitizadas e liberam
    a pendencia para nova tentativa. Nao ha cache persistente.
  - `web/desktop/main.cjs`: registra o canal e mantem WeakSet dos webContents
    das janelas criadas pelo Prosa. O handler exige frame principal ativo
    com URL confiavel e emissor nao destruido.
  - `web/desktop/preload.cjs`: expoe `ensureMicrophoneAccess()` sem encaminhar
    argumentos recebidos no JavaScript ao IPC.
  - `web/desktop/permissions.cjs`: extrai verificacao de URL ja existente
    para reutilizacao; politica de clipboard e demais permissoes preservada.
  - `web/test/desktop-microphone.test.js`: 32 testes de estados existentes,
    espera pelo consentimento, concorrencia, nova consulta, erros/retry,
    validacao de janela/frame/URL, argumentos e Windows/Linux simulados.
    Testa tambem o preload real e registro do handler no main real em VM,
    substituindo Electron, identidade e storage por mocks sem efeitos reais.
  - `node --test web/test/desktop-microphone.test.js
    web/test/desktop-permissions.test.js`: 42/42 passaram; sem skips.
  - `npm --prefix web test`: 331/331 passaram; sem falhas ou skips.
    Aviso MODULE_TYPELESS_PACKAGE_JSON tambem ocorre nos testes existentes;
    nenhuma mudanca de tipo de modulo fora do escopo.
  - `git diff --check`: passou. Arquivos novos revisados separadamente
    quanto a whitespace, segredos e escopo. APIs de frame conferidas
    nas definicoes do Electron instalado.
  - Criterio de T1 atendido: ponte integrada e fronteira IPC coberta por
    testes automatizados; parcelas nativas simuladas de CA-01 a CA-04
    e CA-08 verificadas. O motor RTC ainda nao consome a ponte (T2).
  - Limites: nao foram observados prompt macOS, captura ou pacote real.
    Aceites integrados/visuais permanecem para T4; a correcao completa
    ainda nao e declarada validada.

## T2 - Inicializar e liberar captura de voz com estado consistente

- Status: concluida
- Autorizacao: usuario respondeu "continuar" apos a conclusao de T1 e o
  pedido de autorizacao para executar T2.
- Requisitos/aceite: RF-01 a RF-08, RNF-03 e RNF-05;
  parcela do motor de CA-01 a CA-08.
- Dependencias: T1 concluida.
- Escopo e arquivos provaveis:
  - `web/src/rtc.js`.
  - Modulo auxiliar de captura em `web/src/`, somente se necessario.
  - Testes do motor/captura em `web/test/` e este plano.
- Implementacao:
  - Coordenar ponte nativa e `getUserMedia` e expor fase, alvo e erro reativos
    conforme a spec, sem mudar a assinatura dos pontos de entrada existentes.
  - No navegador manter getUserMedia; em Electron macOS tratar ponte ausente
    ou falha como erro, sem contornar silenciosamente a autorizacao.
  - Exigir audio live antes de publicar entrada; normalizar os erros sem
    confundir consentimento concedido com captura bloqueada.
  - Serializar tentativas; impedir entrada/troca concorrente e invalidar
    continuacoes apos saida/cancelamento, inclusive captura resolvida tarde.
  - Desfazer estado e entrada publicados se uma etapa posterior falhar;
    liberar faixas e recursos sem afetar uma tentativa posterior.
  - Detectar encerramento inesperado da faixa e atualizar estado sem
    recaptura automatica; preservar mute e demais controles.
  - Remover listeners ao liberar recursos. Manter contratos de providers,
    eventos de voz e confirmacao externa de troca.
- Testes e comandos de validacao:
  - Executar o motor sob mocks de mediaDevices, ponte, faixa, providers e
    timers, sem inicializar provider real, hub, store persistente ou rede.
  - Cobrir ordenacao autorizacao/captura/entrada e limpeza de erros no sucesso.
  - Cobrir negativa/restricao/unknown, ponte ausente/falha, ausencia de API
    de captura, NotAllowedError, NotFoundError e NotReadableError.
  - Cobrir stream sem audio ou com audio encerrado, chamadas concorrentes,
    cancelamento durante autorizacao/captura e resolucao/rejeicao tardias.
  - Cobrir falha apos entrada e durante consulta de membros, limpeza,
    saida/nova entrada e troca confirmada sem rollback da chamada anterior.
  - Cobrir track ended, mute sem erro e remocao de listeners/timers.
  - Executar testes direcionados com `node --test`, `npm --prefix web test`,
    `npm run build` e `git diff --check`.
- Criterio de conclusao:
  - Fluxo e estado consistentes nos cenarios simulados; sem faixas residuais,
    entrada anunciada antes da captura ou rejeicoes nao tratadas.
  - Testes/build passando; limites da simulacao registrados.
- Evidencias:
  - Ambiente: Node.js v24.18.1, dependencias locais. Sem instalar pacotes,
    iniciar app, abrir microfone, usar perfis reais ou acessar rede.
  - Arquivos desta task: `web/src/rtc.js`,
    `web/test/rtc-microphone.test.js` e este plano. Alteracoes de T1
    preservadas; nenhum componente, provider ou protocolo alterado.
  - Motor expoe `rtc.microphone` com `phase`, `target: { id, name }` e
    `error: { code }`, sem armazenar detalhes brutos dos erros.
    Codigos: authorization-failed, permission-denied, permission-restricted,
    permission-blocked, capture-unavailable, capture-failed, device-not-found,
    device-unreadable, voice-join-failed e track-ended.
  - macOS/Electron aguarda a ponte e exige granted; no navegador e Electron
    Windows/Linux segue por getUserMedia sem APIs nativas exclusivas.
    Audio live e exigido antes de publicar entrada; captura e consentimento
    permanecem conceitos distintos.
  - Identificador por tentativa bloqueia concorrencia e invalida continuacoes
    apos saida. Streams tardios de getUserMedia sao parados sem tocar na
    nova sessao. Erros de captura/entrada/consulta de membros sao tratados.
  - Saida limpa estado e recursos localmente antes de aguardar sinalizacao.
    Falhas de sinalizacao de saida nao impedem limpeza local; respostas
    tardias nao limpam nem restauram uma sessao posterior.
  - Listener ended distingue interrupcao de mute, atualiza erro sem
    recaptura e e removido na limpeza. toggleMute ignora fases sem captura
    pronta. Controles/mensagens visuais e acoes de retry/cancel ficam em T3.
  - Regressao antes da mudanca:
    `node --test --test-name-pattern='waits for native permission'
    web/test/rtc-microphone.test.js` falhou: zero consultas nativas quando
    uma era esperada. O mesmo cenario passa com o fluxo corrigido.
  - `node --test web/test/rtc-microphone.test.js`: 40/40 passaram.
    Motor real carregado com Vue reactive real e dependencias/timers
    simulados, sem inicializar P2P, dispositivos ou persistencia.
  - Cobertura inclui negativa/restricao/unknown, ponte ausente/falha,
    erros de captura, audio ausente/encerrado, nova tentativa,
    concorrencia, cancelamento, respostas tardias, rollback apos entrada,
    interrupcao, mute, limpeza de listeners/timers/peers/faixas e troca
    confirmada sem restaurar a chamada antiga.
  - `npm --prefix web test`: 371/371 passaram, sem falhas ou skips.
    Aviso preexistente MODULE_TYPELESS_PACKAGE_JSON mantido fora do escopo.
  - `npm run build`: passou, Vite v6.4.4, 1839 modulos, 1.98 s.
    Aviso de chunk acima de 500 kB; sem alteracao de bundle splitting.
  - `git diff --check`: passou; teste novo revisado separadamente quanto
    a whitespace e escopo. Build gerou apenas saida ignorada em web/dist.
  - Criterios de T2 atendidos por simulacao: parcelas do motor de CA-01
    a CA-08. Nao comprova prompt nativo, captura real, compatibilidade
    fisica Windows/Linux ou transmissao para outro participante.
    UI permanece para T3 e validacao manual/pacote obrigatoria para T4.

## T3 - Mostrar progresso, erros e recuperacao na interface de voz

- Status: concluida
- Autorizacao: usuario respondeu "continuar" apos a conclusao de T2 e o
  pedido de autorizacao para executar T3.
- Requisitos/aceite: RF-03 a RF-08, RNF-04 e RNF-05;
  parcela de UI automatizada de CA-01, CA-03 a CA-07 e CA-10.
- Dependencias: T2 concluida.
- Escopo e arquivos provaveis:
  - `web/src/views/HomeView.vue`.
  - `web/src/components/VoiceStage.vue` e `VoiceBar.vue`.
  - Componente de feedback reutilizavel, se necessario, e estilos locais
    ou `web/src/style.css`, apenas para os novos estados.
  - Testes Vue em `web/test/` e este plano.
- Implementacao:
  - Mostrar feedback no canal alvo mesmo sem conexao ativa; usar mensagens
    de progresso acessiveis e erros acionaveis em portugues.
  - Bloquear novas entradas/trocas enquanto pendente sem impedir navegacao
    de texto; oferecer cancelamento local sem prometer fechar o prompt nativo.
  - Oferecer nova tentativa apos falha e orientar Ajustes/reinicio quando
    pertinente, sem apresentar toda falha como negativa.
  - Preservar a confirmacao de troca; tratar falhas dos chamadores de voz.
  - Em faixa encerrada, desabilitar microfone nos controles aplicaveis e
    orientar saida/nova entrada; manter saida acessivel.
  - Preservar estilos, layout e comportamento dos controles nao afetados.
- Testes e comandos de validacao:
  - Montar componentes reais com Vue e dependencias simuladas, reutilizando
    o padrao de `web/test/local-camera-preview.test.js`.
  - Cobrir feedback antes de channelId, progresso, negativa, erro de captura,
    sucesso sem erro residual, retry, cancelamento e bloqueio de concorrencia.
  - Cobrir confirmacao de troca e faixa encerrada sem confundir com mute;
    conferir roles, labels e estado disabled dos controles.
  - Executar testes direcionados, `npm --prefix web test`, `npm run build`
    e `git diff --check`.
- Criterio de conclusao:
  - Estados e acoes cobertos por testes comportamentais passando, com
    regressao de previa local e controles preservada.
  - Inspecao visual/teclado/responsividade real permanece para T4.
- Evidencias:
  - Ambiente: Node.js v24.18.1, ferramentas Vue e dependencias ja locais;
    sem instalar pacotes, iniciar aplicativo ou acessar dispositivos/rede.
  - `web/src/components/MicrophoneStatus.vue`: componente de feedback com
    roles status/alert, nome do alvo, erros especificos sem detalhes brutos,
    orientacao macOS para negativa/restricao e possivel reinicio.
    Oferece cancelamento local, nova tentativa ou saida se ainda conectado.
  - `web/src/views/HomeView.vue`: feedback no main, fora do palco que pode
    ficar oculto pelo chat em largura estreita. Retry reutiliza o fluxo de
    entrada existente; guards impedem novas entradas/confirmacoes pendentes
    sem bloquear a navegacao de texto. Modal de troca preservado.
  - `VoiceStage.vue`, `VoiceBar.vue` e userbar: microfone desabilitado e sem
    aparencia ativa quando captura nao esta pronta. Controles de chamada
    nao aparecem durante inicializacao; saida e demais controles continuam
    disponiveis apos interrupcao da faixa. Previa local nao foi refatorada.
  - Estilos locais e uma regra em `web/src/style.css`: estados disabled,
    feedback com cores/variaveis existentes, quebra de texto, acoes com wrap,
    foco visivel e altura minima de 44px. Sem mudancas no layout base.
  - `web/test/voice-ui.test.js`: 21 testes compilam e montam os componentes
    reais MicrophoneStatus, HomeView, VoiceStage e VoiceBar em renderer Vue.
    Services/RTC/dispositivos ficam simulados; nao inicializa P2P ou storage.
    Cobre mensagens, roles/labels, cancel/retry/saida, sucesso sem erro
    residual, bloqueio de concorrencia, confirmacao/cancelamento de troca,
    preservacao do chat e desabilitacao correta do microfone.
  - `web/test/local-camera-preview.test.js`: fixture atualizada com estado
    de captura ready; os 12 testes existentes de previa/layout preservados.
  - `node --test web/test/voice-ui.test.js
    web/test/local-camera-preview.test.js`: 33/33 passaram, sem skips.
  - `npm --prefix web test`: 392/392 passaram, sem falhas ou skips.
    Aviso preexistente MODULE_TYPELESS_PACKAGE_JSON mantido fora do escopo.
  - `npm run build`: passou, Vite v6.4.4, 1841 modulos, 1.68 s.
    Aviso nao bloqueante de chunk acima de 500 kB; sem bundle splitting.
  - `git diff --check`: passou; arquivos novos revisados separadamente
    quanto a whitespace, segredos e escopo. Nenhuma dependencia/protocolo
    alterado; T1/T2 preservadas e saida de build apenas em web/dist ignorado.
  - Criterio automatizado de T3 atendido: parcelas de UI de CA-01,
    CA-03 a CA-07 e CA-10 cobertas por testes comportamentais.
  - Limites: renderer de teste nao comprova layout no browser, foco/teclado
    real, anuncio por leitor de tela, prompt macOS ou captura fisica.
    Esses aceites integrados/visuais permanecem em T4, ainda nao iniciada.

## T4 - Configurar pacote macOS e validar o fluxo integrado

- Status: aguardando validacao
- Autorizacao: usuario respondeu "continuar" apos a conclusao de T3 e o
  pedido de autorizacao para executar T4. Uso real do microfone, inicio do app
  com perfil e acesso a rede continuam sujeitos a autorizacao especifica.
- Autorizacao adicional recebida: usuario respondeu "continuar" apos o pedido
  explicito para abrir o pacote temporario com perfil local, microfone e
  conexoes de rede configuradas, incluindo possivel sincronizacao/presenca.
- Encerramento normal autorizado com "ok" apos o pedido para solicitar quit
  do Prosa instalado antes de abrir o pacote corrigido, sem forcar saida.
- Requisitos/aceite: RF-09; validacao integrada de RF-01 a RF-08,
  RNF-01 a RNF-05 e CA-01 a CA-10.
- Dependencias: T1, T2 e T3 concluidas.
- Escopo e arquivos provaveis:
  - `web/electron-builder.yml`, `web/build/entitlements.plist`.
  - Testes de configuracao do pacote em `web/test/`, se pertinentes.
  - `README.md` e este plano, incluindo evidencias e pendencias.
- Implementacao:
  - Declarar descricao de uso e entitlement de entrada de audio conforme
    o fluxo real de build/assinatura, sem remover permissoes preexistentes.
  - Verificar tratamento dos processos auxiliares no empacotamento, sem
    expandir permissoes ou alterar a identidade do aplicativo.
  - Documentar uso, erros, nova tentativa e eventual necessidade de reinicio.
  - Preparar pacote local em destino descartavel, sem sobrescrever release
    existente ou instalacao do usuario. Confirmar comando/destino antes de
    executar; pedir autorizacao se houver rede, uso de perfil ou dispositivo.
- Testes e comandos de validacao:
  - Testar configuracao/entitlements com ferramentas locais, sem tomar
    verificacao textual como prova do pacote assinado.
  - Executar `plutil -lint web/build/entitlements.plist`,
    `npm --prefix web test`, `npm run build` e `git diff --check`.
  - Empacotar com electron-builder local para a arquitetura disponivel,
    output isolado e sem publicacao; rede exige autorizacao separada.
    Registrar o comando efetivo e qualquer etapa de assinatura necessaria.
  - Conferir Info.plist e assinatura/entitlements efetivos do pacote gerado
    com `plutil` e `codesign`, registrando caminho e versao, sem confundir
    pacote corrigido com a instalacao que apresentou o problema.
  - Com autorizacao para iniciar app/microfone, validar primeira decisao
    Permitir, acesso ja concedido, negativa, mudanca nos Ajustes e tentativa
    posterior. Nao resetar TCC nem apagar perfil para preparar cenarios.
  - Validar dispositivo ausente/falha de captura quando reproduzivel,
    concorrencia, cancelamento, saida/nova entrada, interrupcao da faixa,
    mute, previa local e preservacao dos controles existentes.
  - Conferir mensagens, teclado e largura estreita no app; conferir navegador
    em contexto seguro e Electron dev. Registrar disponibilidade ou lacunas
    dos testes de compatibilidade Windows/Linux.
- Criterio de conclusao:
  - CA-01 a CA-10 atendidos com evidencias automatizadas e manuais separadas,
    metadados/assinatura conferidos e README coerente com o comportamento.
  - Se faltar ambiente com consentimento inicial, pacote testavel ou qualquer
    aceite manual obrigatorio, manter T4/plano em `aguardando validacao`,
    descrevendo precisamente os cenarios faltantes.
  - Nao afirmar conectividade WebRTC universal ou transmissao real com base
    em mocks/captura local, nem publicar/substituir instalacoes para validar.
- Evidencias:
  - Ambiente: Node.js v24.18.1, macOS Darwin 25.3.0, arm64; ferramentas e
    dependencias locais existentes. A etapa de empacotamento nao iniciou app
    nem acessou dispositivo/perfil. A sessao manual autorizada esta descrita
    a seguir; nenhuma permissao TCC foi resetada.
  - `web/electron-builder.yml`: NSMicrophoneUsageDescription explicita,
    entitlements e entitlementsInherit apontando para o plist existente.
    Identidade com.prosa.app e politica identity:null preservadas.
  - `web/build/entitlements.plist`: adicionado somente
    com.apple.security.device.audio-input=true; quatro permissoes existentes
    preservadas. Nenhuma permissao nova de camera/tela ou sandbox adicionada.
  - Inspecao do builder local confirmou que identity:null pula assinatura.
    Seu getOptionsForFile distingue entitlements principais e herdados;
    ambos agora usam a configuracao explicita. A assinatura manual ad-hoc
    documentada permanece necessaria no fluxo atual.
  - `README.md`: documentados assinatura/verificacao, helpers, fluxo de
    consentimento, cancelamento, erros, retry, interrupcao e limites de teste.
  - `web/test/desktop-package.test.js`: dois testes parseiam YAML/plist com
    ferramentas ja presentes via electron-builder; nao assinam nem abrem app.
    Conferem descricao de uso, identidade e entitlements principais/herdados.
  - `node --test web/test/desktop-package.test.js`: 2/2 passaram.
  - `plutil -lint web/build/entitlements.plist`: OK.
  - `npm --prefix web test`: 394/394 passaram, sem falhas ou skips.
    Aviso preexistente MODULE_TYPELESS_PACKAGE_JSON mantido fora do escopo.
  - `npm run build`: passou, Vite v6.4.4, 1841 modulos, 1.82 s.
    Aviso de chunk acima de 500 kB; sem bundle splitting fora do escopo.
  - Destino isolado criado com `mktemp -d /tmp/prosa-microphone-XXXXXX`:
    `/tmp/prosa-microphone-dDCCtw`. Nao sobrescreveu release/ ou instalacoes.
  - Empacotamento executado com rede bloqueada pelo sandbox-exec:

    ```bash
    sandbox-exec -p '(version 1) (allow default) (deny network*)' \
      /Users/aslan.gama/Projetos/prosa/web/node_modules/.bin/electron-builder \
      --projectDir /Users/aslan.gama/Projetos/prosa/web \
      --mac --dir --arm64 --publish never \
      --config.directories.output=/tmp/prosa-microphone-dDCCtw \
      --config.electronDist=/Users/aslan.gama/Projetos/prosa/web/node_modules/electron/dist \
      --config.npmRebuild=false
    ```

  - Resultado: electron-builder 25.1.8 usando Electron 33.4.11 instalado,
    sem reconstruir dependencias, baixar runtime ou publicar.
    Pacote: `/tmp/prosa-microphone-dDCCtw/mac-arm64/Prosa.app`, versao 0.3.0.
    Gerado .app de teste; nao foi gerado DMG nem build universal.
  - Assinatura aplicada somente ao artefato recem-gerado, tambem com rede
    bloqueada pelo sandbox-exec:

    ```bash
    codesign --deep --force --sign - \
      --entitlements /Users/aslan.gama/Projetos/prosa/web/build/entitlements.plist \
      /tmp/prosa-microphone-dDCCtw/mac-arm64/Prosa.app
    ```

  - `codesign --verify --deep --strict --verbose=2` no pacote: valid on disk,
    satisfies its Designated Requirement. Assinatura ad-hoc local; nao
    representa Developer ID, notarizacao ou aprovacao de Gatekeeper externo.
  - Info.plist efetivo conferido com plutil: com.prosa.app, versao 0.3.0,
    descricao "O Prosa usa o microfone para transmitir sua voz nas chamadas."
  - Entitlements efetivos extraidos por codesign e parseados com plistlib:
    identicos ao plist configurado no app principal e nos quatro helpers
    (GPU, Plugin, Renderer e Helper). audio-input=true em todos.
    Executaveis conferidos com lipo: todos arm64.
  - app.asar inspecionado sem executar: quatro arquivos desktop do fluxo,
    index.html e JS/CSS gerados (sete arquivos) identicos byte a byte ao
    fonte/build atual. Versao/main corretos; nenhum arquivo .env no arquivo.
  - `git diff --check`: passou. Arquivos novos revisados separadamente;
    nenhuma dependencia/protocolo alterado, mudancas de T1-T3 preservadas.
  - Sessao manual iniciada apos autorizacao especifica: solicitado quit
    normal do Prosa instalado via AppleScript. Verificacao de processos
    confirmou ausencia de instancias antes de abrir o pacote temporario.
    Nao foi usado kill ou encerramento forcado.
  - `open -a /tmp/prosa-microphone-dDCCtw/mac-arm64/Prosa.app` executado.
    Processo confirmado no caminho canonico
    `/private/tmp/prosa-microphone-dDCCtw/mac-arm64/Prosa.app/Contents/MacOS/Prosa`
    (PID 88869), distinguindo o pacote da instalacao anterior.
  - Observado somente o lancamento do processo; isso nao comprova tela
    carregada, prompt, consentimento ou captura. Aguardando o usuario entrar
    em canal e informar o resultado real. Nao foram lidos mensagens, conteudo
    do perfil, trafego ou logs sensiveis.
  - Usuario informou que o aplicativo nao abriu. Nova verificacao confirmou
    que o processo anterior havia encerrado; codesign --verify permaneceu
    valido. Nao foi encontrado relatorio Prosa*.ips no diretorio de
    DiagnosticReports consultado.
  - A variavel ELECTRON_RUN_AS_NODE estava definida no ambiente do terminal.
    Repetido somente o lancamento com
    `env -u ELECTRON_RUN_AS_NODE open -a /tmp/prosa-microphone-dDCCtw/mac-arm64/Prosa.app`,
    sem modificar ambiente global, fonte ou perfil manualmente.
    Apos quatro segundos, processo principal (PID 89009) e helpers GPU,
    utilitario e Renderer permaneciam ativos no caminho do pacote corrigido.
    O contraste e compativel com interferencia da variavel no primeiro
    lancamento.
  - Confirmacao manual recebida do usuario apos esse relancamento:
    a mensagem de permissao apareceu, ele confirmou o microfone e relatou
    funcionamento normal. Isso valida por relato o fluxo principal de
    consentimento e uso do microfone no pacote macOS em teste.
    O agente nao clicou no prompt nem capturou audio ou conteudo da chamada.
  - Nao houve relato de erro residual ou necessidade de nova tentativa
    nesse cenario. Nao extrapolar a confirmacao para negativa/restricao,
    cancelamento, interrupcao, outros dispositivos,
    responsividade ou conectividade com outro participante.
  - Em seguida, usuario confirmou "funcinou" apos o roteiro de sair da
    chamada sem fechar o Prosa e entrar novamente no mesmo canal, verificando
    captura normal e ausencia de novo pedido de permissao. CA-02 atendido
    por relato no mesmo pacote macOS; sem capturar audio pelo agente.
  - Iniciado roteiro manual de negativa: orientado usuario a sair da chamada,
    desativar acesso do Prosa nos Ajustes e tentar entrar novamente, sem
    resetar TCC. Usuario solicitou reabertura do app. Sem processo principal
    em execucao na verificacao, o mesmo pacote foi reaberto com
    ELECTRON_RUN_AS_NODE removida apenas desse lancamento (PID 89371).
  - Usuario confirmou o resultado do teste de negativa, reproduzindo a
    mensagem de acesso negado no macOS e a orientacao de Ajustes/reinicio,
    e informou que funcionou. Negativa real e apresentacao correta validadas
    por relato no pacote em teste; restricao por politica nao foi exercitada.
  - No roteiro de recuperacao, usuario foi orientado a reativar a permissao
    nos Ajustes e solicitou nova reabertura. Sem instancia principal em
    execucao, o mesmo pacote foi aberto sem ELECTRON_RUN_AS_NODE
    (PID 89529). Usuario confirmou "sim funcinou" ao verificar que a captura
    voltou a funcionar e a mensagem de negativa desapareceu.
    CA-04 atendido por relato apos reativacao e reinicio, sem reset TCC.

### Pendencias para concluir T4

| Aceite | Evidencia disponivel | Pendente |
| --- | --- | --- |
| CA-01 | Fluxo apos mensagem e confirmacao do microfone funcionou normalmente, conforme usuario; cobertura automatizada mantida. | Sem pendencia para o fluxo relatado; estado TCC anterior nao foi inspecionado. |
| CA-02 | Saida e reentrada com microfone funcionando e sem novo prompt confirmadas pelo usuario; cobertura automatizada mantida. | Sem pendencia para o cenario relatado no pacote macOS. |
| CA-03 | Negativa real e orientacao de Ajustes/reinicio confirmadas pelo usuario; cobertura simulada de negativa/restricao mantida. | Restricao por politica quando ambiente permitir; nao foi criada artificialmente. |
| CA-04 | Recuperacao apos reativar permissao e reabrir o mesmo pacote confirmada pelo usuario, sem mensagem residual de negativa. | Sem pendencia para o cenario relatado no pacote macOS. |
| CA-05 | Categorias de erros cobertas. | Dispositivo ausente/falha fisica quando reproduzivel. |
| CA-06 | Concorrencia, cancelamento e resultados tardios cobertos. | Exercitar cliques/cancelamento no pacote real. |
| CA-07 | Interrupcao, mute e limpeza testados. | Interrupcao real e recuperacao por saida/nova entrada. |
| CA-08 | IPC validado; plataformas externas simuladas. | Browser seguro, Electron dev e compatibilidade fisica Windows/Linux quando disponivel. |
| CA-09 | Info.plist, assinatura e audio-input conferidos; consentimento e funcionamento confirmados pelo usuario no pacote. | Sem pendencia especifica deste criterio para o pacote arm64 testado. |
| CA-10 | Roles, labels, acoes e regressoes automatizadas passaram. | Layout desktop/estreito, teclado/foco e comportamento visual reais. |

- A primeira verificacao previa encontrou o aplicativo instalado
  `/Applications/Prosa.app/Contents/MacOS/Prosa` em execucao (PID 84080),
  alem dos seus helpers. O inicio foi adiado para evitar duas instancias.
  Apos autorizacao separada, esse bloqueio foi resolvido com quit normal e
  o pacote temporario foi aberto, conforme evidencias.
- Janela/consentimento, funcionamento normal, saida/reentrada sem novo
  prompt, negativa e recuperacao apos reativar/reabrir confirmados pelo
  usuario. T4 permanece aguardando os demais cenarios da tabela, sem
  inventar uma nova task ou declarar todo o plano concluido.
- Registrar resultados com caminho exato do pacote e cenario; versao 0.3.0
  sozinha nao distingue este build da instalacao anterior.
- Nao apagar perfis, alterar appId ou resetar TCC para fabricar cenarios
  adicionais de autorizacao.
- Pacote esta em diretorio temporario e pode ser removido pelo sistema.
  Nenhuma publicacao, instalacao, commit ou nova task foi realizada.

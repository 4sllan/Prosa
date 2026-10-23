# Correcao da abertura do compartilhamento de tela no app

- Status: aprovada
- Data: 2026-10-23
- Autorizacao desta fase: usuario respondeu "continuar" apos a analise e o
  pedido de autorizacao para criar a spec.
- Aprovacao: usuario respondeu "continuar" apos a entrega da spec em revisao
  e o pedido de aprovacao para criar as tasks.
- Fase: T1/T2/T3 concluidas; documentacao e verificacoes locais de T4 prontas.
  Usuario confirmou compartilhamento real no pacote macOS; T4 ainda aguarda
  os demais cenarios manuais, incluindo negativa de permissao e fluxo web.

## 1. Objetivo e contexto

Fazer o botao de compartilhar tela abrir uma selecao explicita de fonte no
app Electron, iniciar a captura escolhida e apresentar falhas recuperaveis,
preservando o comportamento do navegador.

Evidencias observadas no fonte atual:

- `web/src/components/VoiceStage.vue` e `VoiceBar.vue` chamam `toggleScreen`.
- `web/src/rtc.js` usa `getDisplayMedia({ video: true })`, sem tratamento
  local de erros, controle de tentativa pendente ou invalidacao na saida.
- `web/desktop/main.cjs` configura permissoes gerais, mas nao registra
  `setDisplayMediaRequestHandler` nem utiliza `desktopCapturer`.
- `web/desktop/permissions.cjs` ja permite `display-capture`. Essa permissao
  nao substitui a integracao de selecao de fontes do Electron.
- O Electron declarado e 33.4.11. A documentacao de tipos instalada oferece
  `setDisplayMediaRequestHandler`; o seletor nativo opcional e experimental
  e limitado a macOS 15+, portanto nao cobre sozinho as plataformas do app.
- O motor adiciona/remove trilhas sem renegociacao explicita. Essa lacuna
  e independente da abertura do seletor.

A ausencia de integracao desktop explica o sintoma por inspecao, mas nao
houve reproducao no pacote instalado. Permissoes do macOS e diferencas entre
o pacote e o fonte ainda precisam de validacao manual.

## 2. Escopo, modos e plataformas

Dentro do escopo:

- Integracao de `getDisplayMedia` com selecao de tela/janela no Electron.
- Estado transitorio, cancelamento, erros, limpeza e previa local.
- Feedback consistente em VoiceStage e VoiceBar, no estilo visual existente.
- Testes isolados e documentacao do comportamento e limites no README.

Prioridade de validacao real: Electron no macOS, incluindo o app empacotado.
Usar seletor proprio com fontes obtidas no main para nao depender da API
experimental do seletor nativo. Preservar Windows/Linux; a disponibilidade
de fontes nesses sistemas depende do Electron e do ambiente, como Wayland.
Nao declarar suporte validado sem executar a verificacao correspondente.

O modo P2P e o caminho ativo. O motor compartilhado com `server` deve
permanecer compativel, sem reativar esse modo nem alterar providers.
Na web, manter o seletor do navegador; nao exigir a ponte desktop.

Fora de escopo: audio do sistema, renegociacao WebRTC, correcao da entrega
remota de video, STUN/TURN, camera, microfone, novos modos de transporte,
novas dependencias, atualizacao do Electron, assinatura e notarizacao.
Nao substituir as alteracoes preexistentes de microfone ou previa local.

## 3. Requisitos

### Funcionais

- RF-01: ao clicar em compartilhar tela durante uma chamada ativa no app,
  abrir um seletor de telas/janelas disponiveis, sem escolher automaticamente
  a primeira fonte. A captura somente pode iniciar apos selecao explicita.
- RF-02: o seletor deve permitir escolher uma fonte, cancelar e fechar por
  Escape. Deve ter foco acessivel, nomes legiveis, miniaturas quando
  disponiveis e retorno do foco ao controle de origem ao fechar.
- RF-03: manter no maximo uma tentativa de captura pendente por chamada.
  Representar carregamento/selecao e impedir cliques concorrentes em ambos
  os controles. Nao marcar `rtc.screen` como ativo antes de obter uma trilha
  de video viva.
- RF-04: cancelar sem ativar compartilhamento nem apresentar erro alarmante
  quando o cancelamento for identificavel. Na web, nao afirmar que houve
  negativa de permissao quando a API nao distingue negativa e cancelamento.
- RF-05: falhas de enumeracao, ausencia de fontes, fonte indisponivel,
  permissao negada e falhas de captura devem encerrar o estado pendente e
  permitir nova tentativa explicita. Nao apresentar erros tecnicos brutos.
- RF-06: quando houver evidencia de negativa/restricao no macOS, orientar
  Ajustes do Sistema > Privacidade e Seguranca > Gravacao de Tela
  (ou Gravacao de Tela e Audio do Sistema, conforme a versao).
  Pode ser necessario encerrar e reabrir o app apos mudar a permissao.
  Nao abrir ajustes, resetar permissoes nem alterar consentimento automaticamente.
- RF-07: ao iniciar, reutilizar `rtc.screenStream`, `rtc.screen`, previa e
  atualizacao de estado de voz existentes. Ao parar pelo botao ou pelo
  sistema, liberar trilhas e remetentes da tela, restaurando a previa da
  camera se ativa. Nao interromper audio ou camera.
- RF-08: sair/trocar de chamada, navegar, destruir a janela ou expirar a
  selecao deve invalidar a tentativa pendente. Capturas que resolverem tarde
  devem ser paradas, sem alterar uma nova chamada. O encerramento deve ser
  idempotente e nao reabrir o seletor por um evento tardio de `ended`.
- RF-09: no navegador, continuar chamando `getDisplayMedia` como consequencia
  direta do clique, sem aguardar IPC ou enumeracao desktop antes da chamada.
  Preservar o seletor nativo do navegador e aplicar a mesma limpeza de estado.

### Nao funcionais

- RNF-01: preservar contextIsolation, sandbox, nodeIntegration desabilitado
  e webSecurity. `desktopCapturer` permanece exclusivo do main.
- RNF-02: nao persistir nem transmitir nomes, miniaturas ou identificadores
  das fontes. Nao registrar imagens, conteudo capturado, SDP ou erros brutos.
- RNF-03: manter o desenho existente, com feedback acessivel e seletor
  utilizavel no tamanho minimo da janela; preservar a interface web em
  desktop/mobile onde a API estiver disponivel.
- RNF-04: sem novos endpoints, bancos, dependencias ou alteracoes de protocolo.

## 4. Contratos e seguranca

### Main, preload e renderer

Registrar `setDisplayMediaRequestHandler` na sessao usada pelo app antes de
carregar a pagina. Autorizar somente requisicoes de video iniciadas por gesto
do usuario, provenientes do frame principal de um WebContents registrado e
da URL confiavel do app, reutilizando a validacao existente quando aplicavel.
Negar subframes, origens externas e frames destruidos/navegados.

O main enumera fontes e conserva os objetos reais de `desktopCapturer`.
O renderer recebe somente dados serializaveis para exibicao e uma referencia
opaca por tentativa. Nenhum renderer pode indicar um identificador arbitrario
para capturar fontes fora da lista da sua tentativa.

A ponte deve oferecer somente operacoes tipadas para receber a selecao
pendente, responder com uma fonte ou cancelamento e remover listeners.
Exemplo conceitual de selecao:

```json
{
  "requestId": "opaque-request",
  "sources": [
    { "id": "opaque-source", "name": "Tela 1", "thumbnail": "data:image/png;base64,..." }
  ]
}
```

Exemplos de resposta: `{ "requestId": "opaque-request", "sourceId":
"opaque-source" }` ou `{ "requestId": "opaque-request", "sourceId": null }`.
Os nomes concretos dos canais serao definidos no plano, mantendo esse contrato.
Validar tipos, tamanho dos argumentos, remetente, frame, URL, tentativa e
pertencimento da fonte no main, inclusive na resposta assincrona.

Limitar a uma requisicao pendente por janela, com prazo de selecao de 60
segundos. Resolver cada callback exatamente uma vez, inclusive em cancelamento,
erro, timeout, navegacao ou destruicao. Descartar listas e miniaturas ao
encerrar. Rejeitar respostas repetidas/obsoletas sem afetar uma nova tentativa.
Nao permitir audio do sistema nesta integracao.

### Demais contratos

Preservar `events.updateVoice(channelId, { screen: boolean })` e as APIs dos
providers. Nao publicar `screen: true` em cancelamento, erro ou captura tardia.
API HTTP, WS, eventos P2P e versionamento: sem alteracoes.
Autorizacao de comunidade/canal: sem mudanca; nao contornar a entrada em voz.

## 5. Estado e recuperacao

Adicionar somente estado local transitorio de tentativa, selecao e erro,
separado do booleano de captura ativa. Erros anteriores devem ser limpos ao
tentar novamente ou sair da chamada. Falha de sinalizacao nao pode impedir
a liberacao local de recursos.

Persistencia, schema e migracoes: nao se aplicam. Nenhuma alteracao de dados,
identidades, perfis, preferencias ou permissoes persistidas do sistema.
Offline e reconexao continuam regidos pelo fluxo de voz existente; nao criar
retomada automatica de captura ou restauracao de consentimento.

## 6. Criterios de aceite

- CA-01 (RF-01, RF-02): no app empacotado, o clique abre a selecao; escolher
  tela/janela disponivel inicia a previa correta. Nunca capturar sem escolha.
- CA-02 (RF-03, RF-04): cliques repetidos produzem uma unica tentativa;
  cancelar/Escape nao ativa compartilhamento e permite novo clique.
- CA-03 (RF-05, RF-06): falhas simuladas e negativa real no macOS produzem
  feedback adequado, sem confundir erro desconhecido com negativa confirmada.
- CA-04 (RF-07): parar pelo botao/sistema libera a tela, desativa o estado
  local e restaura camera ativa sem interromper o audio.
- CA-05 (RF-08): saida/troca de canal durante selecao ou captura pendente
  impede ativacao tardia; timeout/navegacao/destruicao encerram a requisicao.
- CA-06 (RNF-01, RNF-02): testes negam origem/frame indevido, payload invalido,
  fonte inexistente, tentativa obsoleta e replay; callbacks nao duplicam.
- CA-07 (RF-09, RNF-03): web mantem seu seletor e previa sem ponte Electron;
  feedback e controles continuam utilizaveis e acessiveis.
- CA-08 (RNF-04): suites pertinentes e build passam sem novas dependencias;
  README distingue abertura/captura local de entrega WebRTC remota.

## 7. Estrategia de validacao

Automatizada, com dados e dispositivos simulados:

- Handler desktop e ponte: fontes, selecao/cancelamento, falhas, seguranca,
  timeout, callbacks unicos, limpeza de listeners e destruicao/navegacao.
- RTC: sucesso, rejeicao, concorrencia, retorno tardio, saida, parada externa,
  preservacao de audio/camera e ausencia de publicacao indevida.
- UI: abertura, selecao por teclado, Escape, foco, loading, erros e estado
  compartilhado entre VoiceStage e VoiceBar; regressao da previa local.
- Comandos previstos: `npm --prefix web test`, `npm run build` e
  `git diff --check`. Testes do servidor somente se houver impacto inesperado.

Manual, a registrar durante execucao:

- macOS dev e pacote: selecionar tela/janela, cancelar, repetir, parar pelo
  sistema, negar acesso, reautorizar nos Ajustes e reabrir quando necessario.
- Sair/trocar de chamada durante selecao e confirmar ausencia de captura tardia.
- Navegador: manter seletor, cancelar e iniciar/parar com e sem camera ativa.
- Conferir foco, teclado, janela minima e layout web responsivo.
- Registrar versoes e resultados reais. Windows/Linux permanecem nao validados
  ate execucao correspondente; mocks/build nao comprovam captura fisica.

## 8. Riscos e decisoes

- Decisao proposta para aprovacao: seletor proprio com fontes enumeradas no
  main, evitando depender do seletor experimental de macOS 15+.
- A permissao nativa pode bloquear enumeracao/captura; nao prometer que um
  prompt aparecera em todas as versoes nem reutilizar a API de microfone para
  solicitar autorizacao de tela.
- Wayland pode delegar selecao ao portal do sistema e limitar a lista de fontes.
  Preservar essas restricoes sem prometer enumeracao universal.
- Entrega remota permanece fora deste escopo. Se a expectativa incluir corrigir
  a recepcao por outros participantes, revisar a spec antes de ampliar o trabalho.
- A validacao manual no pacote e obrigatoria para CA-01 e negativa nativa de
  CA-03; sua ausencia deve manter a entrega aguardando validacao.

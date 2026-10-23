# Previa local da camera na chamada

- Status: aprovada
- Data: 2026-10-22
- Aprovacao: usuario autorizou avancar para as tasks com "continuar"
  apos a entrega da spec.
- Fase: T1 implementada apos autorizacao; aguardando validacao manual.

## 1. Objetivo e contexto

Exibir a imagem da camera do proprio usuario no centro da chamada ao
ativar o botao "Camera", preservando o comportamento do compartilhamento
de tela e dos demais controles.

O botao em `web/src/components/VoiceStage.vue` chama `toggleVideo()` de
`web/src/rtc.js`, que captura a camera e adiciona sua trilha a
`rtc.localStream`. Entretanto, o `<video>` local usa `ref="localVideo"`
dentro de um `v-for`. O Vue trata essa referencia como uma colecao, enquanto
os watchers atuais atribuem `srcObject` como se ela fosse um elemento unico.
Isso explica por inspecao a captura funcionar sem alimentar o video local.
A reproducao com camera real ainda esta pendente.

## 2. Escopo

Dentro do escopo:

- Corrigir a vinculacao do stream ao elemento de video local do VoiceStage.
- Sincronizar a previa ao montar, remontar e trocar a fonte local.
- Preservar a prioridade existente da tela sobre a camera na previa.
- Cobrir a regressao com testes sem dispositivos ou dados reais.

Fora do escopo:

- Renegociacao WebRTC e entrega de camera/tela a outros participantes.
  A ausencia de renegociacao apos adicionar trilhas e uma lacuna separada
  identificada na analise; esta entrega nao a resolve.
- Alterar captura, permissoes de dispositivos ou tratamento global de
  erros de `getUserMedia`/`getDisplayMedia`.
- Alterar VoiceBar, layout, estilos, selecao de dispositivos ou adicionar
  novas dependencias.
- Refatorar providers, transporte, backend, IPC ou persistencia.

## 3. Requisitos

### Funcionais

- RF-01: Com o usuario no canal exibido e a camera ativa, o elemento
  `<video>` local deve receber `rtc.localStream` em seu `srcObject`,
  inclusive quando criado dentro da lista de participantes.
- RF-02: Com compartilhamento ativo, a previa deve usar
  `rtc.screenStream`, mesmo com a camera tambem ativa. Ao encerrar a tela,
  deve voltar a camera se ela continuar ativa; sem camera nem tela,
  deve voltar ao avatar.
- RF-03: Ao remontar o VoiceStage ou recriar o tile local com uma fonte
  ativa, a previa deve receber o stream atual sem exigir novo clique.
  Uma substituicao do stream selecionado tambem deve atualizar a previa.
- RF-04: A remocao do elemento ou desmontagem do componente nao deve
  causar erro nem manter uma referencia ativa a um elemento obsoleto.
  A vinculacao visual nao deve parar trilhas nem solicitar nova captura.
- RF-05: Preservar `autoplay`, `muted` e `playsinline` no video local,
  os estados do botao de camera e os controles existentes.

### Nao funcionais

- RNF-01: Mudanca minima no renderer, sem novas dependencias, endpoints,
  eventos ou alteracoes de protocolo.
- RNF-02: Preservar linguagem visual, responsividade e acessibilidade
  existentes; nao introduzir novos controles ou estilos.
- RNF-03: Os testes devem verificar a atribuicao ao elemento de video,
  nao apenas a existencia de texto ou atributos no codigo-fonte.

## 4. Modos, plataformas e UI/UX

- P2P: modo atualmente ativo; a previa usa o stream local sem depender
  de peer remoto, hub ou entrega de eventos.
- Server: preservar compatibilidade do componente compartilhado, sem
  reativar o modo nem alterar seu provider. Validacao real desse modo
  nao faz parte desta entrega.
- Plataformas: navegador com suporte a captura de midia e renderer
  Electron. Verificacao visual manual nas duas plataformas.
- UI: imagem no tile existente do proprio usuario, com audio local mudo;
  avatar quando camera e tela estiverem desligadas.

## 5. Contratos afetados

Somente a vinculacao interna entre estado RTC e elemento DOM do VoiceStage.
Reutilizar `rtc.localStream`, `rtc.screenStream`, `rtc.video` e `rtc.screen`.

API, erros de servico, WS, providers, eventos P2P e IPC: nao se aplica,
pois nao ha mudanca nesses contratos. Os eventos de estado de voz
existentes permanecem inalterados; nao ha payload novo nem versionamento.

## 6. Estado, persistencia e migracoes

Referencia ao elemento e stream selecionado sao transitorios no renderer.
Nao se aplica persistencia, schema, migracao ou alteracao de dados locais.
Nao modificar bancos, identidades, perfis Electron ou arquivos de usuarios.

## 7. Autenticacao, autorizacao, privacidade e recursos

Autenticacao e autorizacao: nao se aplica mudanca; manter o fluxo de
entrada no canal e as permissoes de captura existentes.

Nao solicitar captura adicional, gravar midia ou registrar conteudo de
streams, SDP ou dados de rede. Reutilizar os streams existentes, sem criar
novos timers, conexoes ou listeners globais. A limpeza da referencia DOM
nao deve interferir no ciclo de vida de trilhas controlado por `rtc.js`.

## 8. Falhas e recuperacao

- Elemento ou stream indisponivel: nao atribuir uma fonte invalida nem
  lancar erro; sincronizar quando elemento e fonte estiverem disponiveis.
- Camera desativada e reativada: vincular o stream ao elemento recriado.
- Tela encerrada: restaurar a fonte conforme RF-02.
- Remontagem: recuperar o stream atual conforme RF-03.
- Permissao negada/dispositivo ausente: preservar o fluxo atual, sem
  apresentar a vinculacao corrigida como solucao para falhas de captura.
- Offline, timeout, reconexao e conflitos: nao se aplica nova logica;
  a previa e local e nao depende de confirmacao remota.

## 9. Criterios de aceite

- CA-01 (RF-01, RF-05): Ao ativar a camera em um canal, a imagem local
  aparece no tile central, sem reproduzir o proprio audio.
- CA-02 (RF-01, RF-04): Desativar e reativar a camera restaura a imagem
  no elemento recriado, sem erro de referencia.
- CA-03 (RF-02): Com camera ativa, iniciar tela mostra a tela; encerrar
  tela restaura a camera. Sem nenhuma fonte ativa, aparece o avatar.
- CA-04 (RF-03, RF-04): Remontar o componente com midia ativa e substituir
  o stream selecionado atualizam o elemento correto; desmontar nao causa
  erro nem encerra trilhas por acao da vinculacao visual.
- CA-05 (RF-05, RNF-02): Layout, controles e atributos de reproducao
  permanecem preservados, inclusive em viewport estreito.
- CA-06 (RNF-01, RNF-03): Testes de regressao da vinculacao, suite web,
  build e verificacao de whitespace passam sem novas dependencias.

## 10. Estrategia de testes

Automatizados:

- Regressao de componente usando as ferramentas Vue ja instaladas e
  elementos/streams simulados, sem camera, microfone ou rede real.
  Exercitar a montagem em lista, troca de fontes, remount e desmontagem.
- `npm --prefix web test`.
- `npm run build`.
- `git diff --check`.

Manuais, com permissao e dispositivos do usuario:

- No navegador e no Electron, entrar em canal, ativar camera, verificar
  imagem local, desativar e reativar; conferir retorno ao avatar.
- Com camera ativa, iniciar e encerrar tela; repetir sem camera ativa.
- Sair da visualizacao e retornar com midia ativa; sair da chamada e
  conferir ausencia de previa residual.
- Conferir desktop e viewport estreito com palco visivel, respeitando
  a regra existente que oculta o palco quando o chat lateral esta aberto
  em telas pequenas.

Registrar resultados automatizados e manuais separadamente. Mocks e build
nao comprovam reproducao real nem conectividade WebRTC. Se verificacoes
manuais obrigatorias estiverem pendentes, a task fica aguardando validacao.

## 11. Riscos e decisoes em aberto

- O conserto da previa nao garante que outros participantes recebam video;
  renegociacao requer escopo e aprovacao separados.
- A referencia depende do ciclo de renderizacao do Vue; testes devem
  reproduzir o contexto de lista que originou o problema.
- Permissoes, dispositivos e politicas de reproducao podem afetar o teste
  real independentemente da atribuicao correta de `srcObject`.
- Nenhuma decisao bloqueante identificada. Escopo aprovado restrito a
  previa local descrita, sem incluir transmissao remota.

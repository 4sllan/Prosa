# Tasks - Previa local da camera na chamada

- Spec: `docs/specs/local-camera-preview.md` (aprovada).
- Status geral: aguardando validacao manual.
- Aprovacao: usuario aprovou o plano e autorizou T1 com "continuar"
  apos a entrega das tasks.
- Ordem de execucao: T1 (task unica).
- Limite: previa local; transmissao remota e renegociacao fora do escopo.

## T1 - Exibir e manter sincronizada a previa local no VoiceStage

- Status: aguardando validacao
- Requisitos/aceite: RF-01 a RF-05, RNF-01 a RNF-03; CA-01 a CA-06.
- Dependencias: nenhuma.
- Escopo e arquivos provaveis:
  - `web/src/components/VoiceStage.vue`.
  - `web/test/local-camera-preview.test.js` (novo).
  - Este plano, para registrar andamento, evidencias e pendencias.
- Implementacao:
  - Reler spec, plano, componente e diff atual antes de editar.
  - Substituir o tratamento da referencia local como elemento unico
    dentro do `v-for` por uma vinculacao que receba o elemento correto.
    Preferir referencia funcional, seguindo o padrao existente dos videos
    remotos, sem refatorar esse fluxo remoto.
  - Sincronizar `srcObject` na criacao do elemento e nas mudancas da fonte
    selecionada, incluindo substituicao do stream e remontagem.
  - Manter prioridade da tela ativa sobre a camera; ao encerrar tela,
    restaurar camera se ativa, ou avatar se ambas estiverem desligadas.
  - Tratar ausencia de elemento/fonte e limpar a referencia quando o
    elemento for removido, sem parar trilhas ou solicitar captura.
  - Preservar atributos de reproducao, estado acessivel dos botoes,
    controles, classes, layout e ciclo de captura existentes.
  - Adicionar testes de regressao comportamentais do componente usando
    Vue e ferramentas ja instaladas, com renderer de teste e
    elementos/streams simulados se necessario. Nao adicionar dependencias
    nem limitar a verificacao a buscas textuais no fonte.
  - Manter `rtc.js`, VoiceBar, providers, protocolos, backend, IPC,
    persistencia e estilos fora da alteracao.
- Testes e comandos de validacao:
  - Confirmar runtime (Node.js 24) e dependencias locais antes de executar.
    Nao instalar pacotes nem acessar rede para esta task sem autorizacao.
  - Teste direcionado: `node --test web/test/local-camera-preview.test.js`.
  - Verificar que o teste da montagem em lista detecta a falha original
    antes da correcao, sem reverter alteracoes alheias.
  - Cobrir atribuicao ao video local em lista com outro participante;
    camera desligada/ligada; tela com e sem camera; retorno a camera ou
    avatar; troca do stream selecionado; fonte inicialmente ausente;
    desmontagem e remontagem com midia ativa.
  - Verificar atributos locais `autoplay`, `muted` e `playsinline`,
    sem captura real, rede ou encerramento de trilhas pela vinculacao.
  - Executar `npm --prefix web test`, `npm run build` e
    `git diff --check`; revisar diff e arquivos gerados.
  - Manual no navegador e Electron, com permissao do usuario: entrar em
    canal, ligar/desligar/religar camera, alternar tela, sair e retornar
    a visualizacao, sair da chamada e conferir ausencia de previa residual.
    Conferir desktop e viewport estreito com palco visivel, preservando
    a regra existente de ocultacao pelo chat lateral.
  - Nao usar bancos, identidades ou perfis reais como dados de teste.
    Se uma sessao manual exigir esses dados, solicitar autorizacao
    especifica ou utilizar ambiente descartavel isolado.
- Criterio de conclusao:
  - CA-01 a CA-06 atendidos, com testes automatizados passando e roteiro
    manual registrado para navegador e Electron.
  - Sem mudanca de contratos, dependencias ou arquivos fora do escopo.
  - Evidencias automatizadas e manuais separadas; mocks/build nao provam
    exibicao com camera real nem conectividade com outro participante.
  - Se validacao manual obrigatoria nao puder ser feita, registrar
    `aguardando validacao`, com passos e criterios pendentes, e nao
    declarar a task ou o plano concluidos.
- Evidencias:
  - Ambiente: Node.js v24.18.1; dependencias locais existentes, sem
    instalacao de pacotes.
  - `VoiceStage.vue`: referencia funcional `setLocalVideo` recebe o
    elemento real dentro do `v-for`; fonte computada prioriza tela
    ativa e acompanha substituicoes do stream. Watcher pos-renderizacao
    sincroniza `srcObject`; remocao limpa a fonte do elemento antigo
    sem tocar nas trilhas.
  - `web/test/local-camera-preview.test.js`: compila o componente real
    com as ferramentas Vue instaladas e monta com renderer de teste.
    Apenas stores, controles RTC e icones sao substituidos; nao importa
    o motor RTC, nao captura dispositivos e nao abre conexoes reais.
  - Regressao antes da correcao: teste de ativacao em lista falhou na
    igualdade de `video.srcObject` com o stream da camera; observado
    `null` em vez do stream esperado.
  - `node --test web/test/local-camera-preview.test.js`: 7/7 passaram
    apos a correcao. Cobertura de camera off/on, tela com e sem camera,
    retorno a camera/avatar, troca e ausencia de fontes, remocao do
    membro local, desmontagem/remontagem, atributos de reproducao e
    estado `aria-pressed` da camera.
  - `npm --prefix web test`: 291/291 passaram, sem falhas ou skips.
    Node emite aviso de tipo de modulo nao declarado, tambem observado
    nos testes existentes; configuracao do pacote mantida inalterada.
  - `npm run build`: passou, Vite v6.4.4, 1839 modulos, 1.93 s.
    Aviso nao bloqueante de chunk maior que 500 kB; nenhuma alteracao
    de bundle splitting no escopo desta correcao.
  - `git diff --check`: passou. Arquivos novos tambem revisados quanto
    a whitespace. Diff restrito a componente, teste, spec e plano;
    sem novas dependencias, contratos, estilos ou arquivos gerados
    rastreados.
  - CA-06 atendido por testes/build/revisao. CA-01 a CA-04 possuem
    cobertura comportamental simulada; usuario confirmou "funcinou"
    apos a entrega, corroborando a correcao da previa local.
    CA-05 tem atributos/controles preservados e estilos inalterados por
    inspecao, sem validacao visual responsiva.
  - Validacao manual pelo usuario: funcionamento da correcao confirmado.
    Plataforma e cenarios exercitados nao informados; a confirmacao nao
    comprova todo o roteiro no navegador e no Electron, alternancia
    camera/tela, remontagem, saida da chamada ou viewport estreito.
    Esses detalhes permanecem pendentes para conclusao formal de T1.
    O agente nao iniciou sessao com dispositivos ou perfis do usuario.
    Transmissao remota permanece fora do escopo.

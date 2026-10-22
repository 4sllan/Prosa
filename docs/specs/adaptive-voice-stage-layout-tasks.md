# Tasks - Layout adaptativo dos participantes da chamada

- Spec: `docs/specs/adaptive-voice-stage-layout.md` (aprovada).
- Status geral: aguardando validacao integrada.
- Aprovacao: usuario aprovou o plano e autorizou T1 com "continuar"
  apos a entrega das tasks.
- Ordem de execucao: T1 (task unica).
- Limite: layout do VoiceStage, sem fullscreen nativo ou mudancas de RTC.

## T1 - Expandir participante unico e organizar varios em grade responsiva

- Status: aguardando validacao
- Requisitos/aceite: RF-01 a RF-08, RNF-01 a RNF-04; CA-01 a CA-06.
- Dependencias: nenhuma task pendente de implementacao. Preservar a
  correcao de previa local existente; suas pendencias manuais nao sao
  consideradas concluidas por esta entrega.
- Escopo e arquivos provaveis:
  - `web/src/components/VoiceStage.vue`.
  - `web/src/style.css`, apenas regras pertinentes ao VoiceStage.
  - `web/test/local-camera-preview.test.js`, ampliando a cobertura de
    componente existente sem remover os testes de previa.
  - Spec e plano desta entrega, para status e evidencias.
- Implementacao:
  - Reler spec, plano, componente, estilos e diff atual antes de editar;
    preservar as alteracoes anteriores de previa local.
  - Derivar o estado de participante unico da lista `members`, contando
    tambem quem esta sem camera/tela.
  - Substituir dimensoes fixas e flex do palco por CSS Grid: um unico
    tile preenche largura/altura disponiveis da area de midia; varios
    tiles usam celulas iguais, com colunas adaptadas a largura efetiva
    do palco e linhas adicionais conforme necessario.
  - Permitir uma coluna em espaco estreito, sem alterar o shell nem
    ocultar o cabecalho/controles. Manter altura legivel dos tiles e
    rolagem vertical interna quando o conteudo exceder a area disponivel.
  - Limitar midia ao tile e distinguir tela compartilhada de camera
    usando estado existente: tela em `contain`, camera em `cover`.
    Aplicar tanto a previa local quanto a apresentacao remota.
  - Manter avatar centralizado, nomes e indicadores legiveis, destaque
    de fala, estado vazio, atributos de reproducao e controles de audio.
  - Manter chaves dos participantes e vinculacao dos streams: a troca
    de disposicao nao deve reiniciar captura ou remontar videos existentes.
  - Restringir seletores ao VoiceStage, preservando VoiceBar e a regra
    existente de ocultacao do palco pelo chat em telas de ate 700 px.
  - Acrescentar testes comportamentais ao renderer Vue existente para
    contagem, transicoes, estado de compartilhamento e preservacao de
    elementos/streams; nao introduzir dependencias ou infraestrutura nova.
- Testes e comandos de validacao:
  - Confirmar Node.js 24 e dependencias locais; nao instalar pacotes ou
    acessar rede sem autorizacao.
  - `node --test web/test/local-camera-preview.test.js`.
  - Cobrir contagens 0, 1, 2, 3, 4 e 6, incluindo participante unico
    local/remoto e participantes sem video; transicoes
    0 -> 1 -> 2 -> 1 -> 0.
  - Verificar que entradas/saidas de outros participantes preservam
    elemento e `srcObject` do video local ja ativo; manter os testes
    existentes de alternancia camera/tela, streams e remontagem.
  - Verificar sinalizacao visual de tela compartilhada local/remota,
    estado vazio, avatares, nomes e atributos/controles preservados.
  - `npm --prefix web test`, `npm run build`, `git diff --check`;
    revisar diff completo, arquivos novos e gerados.
  - Validacao visual no navegador e Electron, com dados descartaveis:
    um participante com camera, avatar e tela; grade com 2, 3, 4 e 6;
    entradas/saidas; janela larga/estreita; chat aberto/fechado; rolagem,
    nomes, indicadores e acesso aos controles. Testar tambem palco
    reduzido pelo chat em janela acima de 700 px.
  - Registrar plataforma, dimensoes, cenarios e resultado. Cenarios
    simulados sao aceitaveis para geometria, identificados como tais,
    sem alegar entrega real de video entre peers.
  - Nao usar bancos, identidades, dispositivos ou perfis reais sem
    autorizacao especifica; preferir ambiente isolado e fontes simuladas.
- Criterio de conclusao:
  - CA-01 a CA-06 atendidos com testes/build passando e evidencias
    visuais no navegador e Electron; sem regressao da previa local.
  - Sem mudanca de contratos, dependencias, RTC ou layout fora do palco.
  - Renderer simulado nao comprova geometria CSS. Se validacao visual
    obrigatoria estiver pendente, registrar `aguardando validacao`,
    criterios pendentes e roteiro, sem declarar conclusao.
- Evidencias:
  - Ambiente: Node.js v24.18.1, dependencias locais, sem instalacao.
  - `VoiceStage.vue`: classe `is-single` derivada da contagem completa
    e variavel CSS de colunas desejadas pela raiz quadrada arredondada
    para cima. Classe `sharing-screen` usa RTC local ou estado remoto,
    sem alterar chaves, captura ou vinculacao de streams. Nome em span
    proprio permite truncar textos longos sem esconder os indicadores.
  - `style.css`: regras restritas ao palco usam Grid, tiles expansivos
    e celulas iguais. Colunas desejadas sao reduzidas automaticamente
    quando a largura nao comporta o minimo de 240 px; largura inferior
    usa uma coluna sem overflow horizontal. Linhas de varios membros
    possuem minimo de 180 px, com rolagem vertical interna. Participante
    unico usa uma linha flexivel sem esse minimo. Tela usa `contain`;
    camera preserva `cover`; controles/cabecalho nao encolhem.
  - Testes de componente ampliados no arquivo existente, mantendo os
    sete testes de previa e acrescentando cinco testes de layout.
    Cobrem contagens, transicoes, participante remoto unico, avatares,
    classes de compartilhamento, audio remoto e preservacao de elemento
    e stream local na entrada/saida de outro participante.
  - `node --test web/test/local-camera-preview.test.js`: 12/12 passaram.
  - `npm --prefix web test`: 296/296 passaram, sem falhas ou skips.
    Aviso de tipo de modulo nao declarado tambem ocorre nos testes
    existentes; configuracao de pacote mantida.
  - `npm run build`: passou, Vite v6.4.4, 1839 modulos, 1.69 s na ultima
    execucao. Aviso nao bloqueante de chunk acima de 500 kB permanece.
  - `git diff --check`: passou; arquivos novos tambem revisados quanto
    a whitespace. Diff revisado: componente, estilos, teste e documentos
    da entrega; alteracoes da previa anterior preservadas, sem novos
    contratos/dependencias ou arquivos gerados rastreados.
  - Geometria automatizada no Electron: 14 cenarios passaram com o
    componente real compilado, CSS atual e icones reais, em fixture
    temporaria isolada em `/tmp/prosa-layout-x606G4`. Stores/RTC sao
    simulados; imagem vem de canvas, sem camera, sinalizacao ou rede.
    Perfil Electron separado; requisicoes externas bloqueadas.
  - Dimensoes de conteudo verificadas: 1100x760 (1 local/remoto,
    camera/tela/avatar, 2/3/4/6 membros e 6 com chat); 800x600
    (4 com chat e tela); 360x640 (1 camera, 6 avatares, chat aberto
    ocultando palco conforme regra existente); vazio em 1100x760.
    Verificados tamanhos positivos/iguais dos tiles, preenchimento
    unico, colunas adaptadas, rolagem vertical em 360 px, ausencia
    de overflow horizontal, controles dentro do viewport e object-fit.
  - Inspecao visual das capturas Electron: participante unico com
    tela inteira sem corte; quatro cameras em grade 2x2 em 1100 px;
    avatares em coluna com rolagem e controles visiveis em 360 px.
    Resultado/retangulos em `results.json` e capturas `stage-*.png`
    na pasta temporaria; artefatos locais, nao adicionados ao projeto.
  - Limites: fixture monta apenas palco e chat simulado, nao shell
    completo, backend ou perfis reais. Os cenarios em 360 px exercitam
    CSS no renderer, nao mudam a largura minima da janela do app.
    Nao houve teste em navegador separado ou chamada com peers reais.
  - Validacao pelo usuario: confirmou "funcionou" apos a entrega do
    layout adaptativo, corroborando o funcionamento da alteracao.
    Plataforma, dimensoes e cenarios exercitados nao foram informados.
  - CA-06 atendido. CA-01 a CA-05 possuem cobertura de componente,
    geometria/inspecao simulada no Electron e confirmacao geral do
    usuario. Para conclusao formal, permanecem pendentes os detalhes
    do roteiro integrado no app e no navegador, incluindo chat lateral,
    entradas/saidas, indicadores e controles, sem inferir cobertura
    integral a partir da confirmacao geral.
    Pendencias do plano de previa local mantidas.

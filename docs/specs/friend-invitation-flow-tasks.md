# Tasks - Fluxo de convites de amizade

- Spec: [friend-invitation-flow.md](friend-invitation-flow.md), R2 aprovada.
- Status geral: plano R2 aprovado; T1, T2A, T2B, T2, T3, T4 e T5 concluidas.
- Aprovacao da spec R1: "continuar" do usuario em 2026-10-16, em resposta ao
  pedido de aprovacao para criar as tasks.
- Aprovacao do plano R1 e autorizacao de T1: "pode executar todos as taks" em
  2026-10-16. Conforme o contrato SDD, executar uma task e parar para o gate
  da proxima; nao houve pedido explicito de alteracao desse contrato.
- Aprovacao da spec R2: "continuar", apos apresentacao da revisao e pedido de
  aprovacao para revisar as tasks. Nao equivale a aprovacao deste plano R2.
- Aprovacao do plano R2 e autorizacao de T2A: "continuar", apos apresentacao
  do plano revisado e pedido explicito para executar T2A.
- Ordem revisada proposta: T1 (concluida) -> implementacao T2 (ja existente)
  -> T2A -> T2B -> revalidacao T2 -> T3 -> T4 -> T5.
- Cada task exige autorizacao propria; aprovar o plano nao autoriza todas.

## Impacto da revisao R2

Preservar integralmente o codigo, as aprovacoes historicas e as evidencias
da R1. A falha manual da T2 nao e convertida em sucesso por esta revisao.
T2A e T2B tratam fragilidades de validacao de links e UX expostas pelo teste;
por isso dependem da implementacao existente de T2, nao de sua conclusao.
Isso evita bloquear a correcao pela validacao que depende dela.

Reexecutar o roteiro da T2 com a UX de T2B e registrar o resultado na propria
T2, em passo de revalidacao autorizado separadamente. So depois iniciar T3.
T3 passa a incluir detalhes recolhidos e copia da chave; T4 preserva seu
escopo; T5 passa a consolidar tambem os criterios R2. Nao renumerar evidencias
historicas nem atribuir aprovacao retroativa as novas tasks.

## Regras de validacao

Executar comandos na raiz com Node.js 24 e dependencias locais verificadas.
Nao instalar pacotes, acessar rede externa ou usar dados reais para validar.
Usar identidades, contas e perfis descartaveis; testes do servidor devem
continuar definindo `DATA_DIR` e `UPLOAD_DIR` temporarios antes de importar
o app. A inicializacao manual tambem deve apontar para dados isolados.

Adicionar regressao junto da mudanca correspondente; T5 integra e documenta,
nao substitui a cobertura das tasks anteriores, incluindo T2A/T2B.
Testes existentes com mocks nao provam conectividade entre redes reais,
e build Vite nao valida Electron empacotado.

Quando algum criterio obrigatorio depender de teste manual nao realizado,
registrar `aguardando validacao`, nao `concluida`. Registrar erros preexistentes
separadamente e revisar diff, segredos e arquivos gerados em cada task.
Arquivos novos nao rastreados tambem precisam de revisao de whitespace:
`git diff --check` sozinho nao os inspeciona.

## T1 - Estados de amizade protegidos e contatos removidos ocultos

- Status: concluida
- Requisitos/aceite: RF-02, RF-03, RF-04, RF-07, RF-08; CA-02, CA-03,
  CA-06, CA-07 (regras de dominio/provider); RNF-01, RNF-03.
- Dependencias: nenhuma.
- Escopo e arquivos provaveis: `web/src/services/p2p/contacts.js`,
  `web/src/services/providers/p2p.js`, `web/test/p2p.test.js`.
- Implementacao:
  - Preservar `friend`, `blocked` e a direcao das pendencias ao receber
    pedidos repetidos ou cruzados; nao aceitar amizade implicitamente.
  - Restringir aceite local a `incoming` e aceite remoto a `outgoing`.
    Aceites atrasados nao devem restaurar contatos removidos ou bloqueados.
  - Preservar bloqueios ao receber remocao remota.
  - Filtrar `removed` e estados desconhecidos antes de projetar a lista.
    Preservar a possibilidade de pedido explicito para um contato removido.
  - Manter os contratos existentes e os dados nao relacionados intactos.
- Testes e comandos de validacao:
  - Adicionar testes de transicao para pedido inicial, aceite valido,
    duplicacao, cruzamento, aceite invalido/tardio, bloqueio, remocao e
    novo pedido explicito; usar chaves descartaveis e limpar estado de teste.
  - Testar `contacts.list()` do provider com estados validos, removidos e
    desconhecidos, incluindo releitura apos cancelamento.
  - Verificar que remocao emite `contact_remove` e nao apaga outros dados.
  - Executar `npm --prefix web test`, `npm run build` e
    `git diff --check`.
- Criterio de conclusao: regras de dominio e projecao cobertas por testes
  passando; nenhum contato removido aparece como recebido; nenhum estado
  protegido e rebaixado pelos controles testados. A UI sera integrada em T2/T4.
- Evidencias (2026-10-16):
  - Alterados `web/src/services/p2p/contacts.js` e
    `web/src/services/providers/p2p.js`; adicionado
    `web/test/p2p-contacts.test.js` para isolar os testes de contatos no
    runner existente, sem alterar dependencias ou scripts.
  - Regressao antes da correcao: `node --test web/test/p2p-contacts.test.js`
    executou 30 casos, com 17 falhas reproduzindo os defeitos.
  - Validacao final: `npm --prefix web test` passou 49/49 casos, incluindo
    31 novos casos de contatos/provider e os 18 existentes.
  - `npm run build`: passou (Vite 6.4.4, 63 modulos).
    `git diff --check`: passou. Runtime: Node.js v24.18.1.
  - Aviso de modulo `MODULE_TYPELESS_PACKAGE_JSON` tambem ocorre na suite
    preexistente; sem falhas. Nao alterado o package.json fora do escopo.
  - Estados protegidos, direcao de pendencia, aceite valido/invalido,
    cancelamento seguido de aceite tardio e filtragem apos releitura
    comprovados por testes. Remocao preserva outros contatos, eventos,
    projecoes, peers conhecidos e conexao do transporte mock.
  - Stores em memoria, chaves sinteticas e canal mock; nenhum perfil ou
    banco real acessado. Nenhuma migracao, novo IPC ou mudanca de protocolo.
  - Validacao manual de UI/Electron nao se aplica ao criterio desta task
    de dominio/provider; permanece obrigatoria nas tasks de integracao.
    Suite servidor nao executada: nenhum codigo servidor foi alterado.
  - Diff e arquivos novos revisados, sem segredos ou mudancas fora da T1.
    Build gerou somente `web/dist/`, ignorado pelo Git.

## T2 - Pareamento gera solicitacao somente pelo ofertante

- Status: concluida (revalidada com R2)
- Autorizacao: "continuar" em 2026-10-16, apos a conclusao de T1 e o pedido
  de autorizacao especifica para T2.
- Requisitos/aceite: RF-01, RF-02, RF-03; RNF-01, RNF-03, RNF-04;
  CA-01, CA-02, CA-03, CA-07, CA-08 (integracao de pareamento).
- Dependencias: T1.
- Revalidacao R2: apos T2A/T2B concluidas e autorizacao especifica, repetir o
  roteiro manual abaixo usando Criar convite, Copiar convite, Continuar e
  Copiar resposta. Nao exigir a UI antiga nem dispensar os criterios originais
  de amizade, bloqueios, remocao e ausencia de duplicacao. Nao implementar
  novos requisitos durante esse passo; corrigir apenas falhas do seu escopo.
- Autorizacao da revalidacao R2: "sim", em resposta ao pedido de revalidar
  T2 aproveitando as evidencias ja obtidas, sem iniciar T3.
- Escopo e arquivos provaveis: `web/src/components/PairingPanel.vue`,
  `web/src/services/p2p/node.js`, `web/src/services/p2p/contacts.js`,
  `web/src/stores.js` (somente se necessario), `web/test/p2p.test.js`.
  Pequeno modulo de integracao testavel em `web/src/services/p2p/` somente
  se necessario para exercitar a logica real sem dependencias novas.
- Implementacao:
  - Rastrear o papel local na sessao de pareamento, sem alterar links ou
    payload de handshake.
  - Apos handshake aceito e registro do canal, solicitar amizade somente
    pelo ofertante e somente se nao existir registro do contato.
  - Nao recriar automaticamente `removed`, reenviar pendencias existentes
    ou enviar pedido inverso pelo respondente.
  - Reutilizar notificacao/releitura de relacionamentos para atualizar o
    ofertante e o destinatario sem reload.
  - Distinguir conexao e solicitacao na UI; informar falha da solicitacao
    sem anunciar envio bem-sucedido nem esconder a conexao estabelecida.
  - Nao acumular novos listeners/timers; preservar verificacao de handshake
    e compatibilidade legada sem afirmar prova de posse no legado.
- Testes e comandos de validacao:
  - Exercitar a logica de producao para ofertante/respondente, handshake
    rejeitado, pareamento incompleto, repeticao, reconexao e estados existentes.
    Nao copiar a implementacao em um teste que so valide sua propria replica.
  - Verificar emissao de `contact_req`, notificacao da UI e falha de
    persistencia, sem depender de SDP ou perfis reais.
  - Executar `npm --prefix web test`, `npm run build` e
    `git diff --check`.
  - Em duas instancias descartaveis, concluir pareamento, conferir uma
    enviada em A e uma recebida em B e aceitar em B; conferir amizade em
    ambos sem reload. Repetir pareamento e testar bloqueio/remocao existentes.
- Criterio de conclusao: testes automatizados e roteiro manual especifico
  realizados com resultados registrados; papeis, listas e contador corretos,
  sem solicitacao inversa ou recriacao automatica.
- Evidencias (2026-10-16):
  - Extraida a integracao de handshake para
    `web/src/services/p2p/pairing-peer.js`, usada por
    `web/src/components/PairingPanel.vue` e testada diretamente, com o node,
    verificador Ed25519, contatos e provider reais; canal mock na suite.
  - O papel ofertante fica na sessao local; somente ele solicita amizade
    apos validar o hello e registrar o canal. Registro existente, inclusive
    `removed`, impede pedido automatico. A UI distingue rede e amizade.
  - Controles recebidos durante verificacao assincrona aguardam validacao
    em buffer limitado a 500 entradas; rejeicao descarta o buffer.
    O hello local precede controles mesmo com assinatura lenta. O listener
    temporario e removido apos attachment; sem novos listeners globais.
  - `web/src/services/p2p/transport.js`: `sendToPeer` agora devolve o resultado
    de `send`, sem mudar envelopes. `contacts.js` usa esse resultado para
    reportar falha de envio em canal online e marcar a tentativa como
    `removed`, permitindo nova tentativa explicita por chave. Enfileiramento
    offline existente nao e tratado como confirmacao de entrega nem como
    erro de envio em canal online.
  - Adicionado `web/test/p2p-pairing-peer.test.js`, com 19 casos para
    ofertante/respondente, estados existentes, handshake invalido/legado,
    repeticao concorrente, falhas de persistencia/envio/assinatura,
    notificacao da UI e ordenacao durante verificacao/assinatura lenta.
  - `npm --prefix web test`: 68/68 passaram. `npm run build`: passou
    (64 modulos). `git diff --check`: passou. Node.js v24.18.1.
    Mantido apenas o aviso preexistente `MODULE_TYPELESS_PACKAGE_JSON`.
  - Primeira rodada apontou uma assercao de teste dependente do tempo de
    WebCrypto; corrigida para aguardar a promessa idempotente do envio do
    hello, sem sleeps arbitrarios. Rodada final sem falhas.
  - Teste de runtime automatizado, nao manual: Chrome headless com dois
    contextos isolados, via CDP, usando UI Vue e WebRTC real no mesmo host.
    `prosa_ice=[]`, backend nao iniciado, sem STUN/TURN externos; resolucao
    externa bloqueada e perfis temporarios. Servidor Vite apenas em loopback.
  - Resultado do runtime: A com Enviadas=1/Recebidas=0, B com
    Recebidas=1/Enviadas=0; ambos com um peer conectado e sem erro.
    Clique em Aceitar em B resultou em Amigos=1 e pendencias=0 nos dois,
    sem reload. Re-pareamento preservou amizade, e depois estados
    `removed` em A e `blocked` em B, sem nova solicitacao automatica.
  - Tentativas iniciais de runtime terminaram em timeout com ICE `new`.
    A execucao local passou com flags de teste do Chrome para desabilitar
    ocultacao mDNS de IPs locais e politica WebRTC padrao; nenhuma alteracao
    de ICE ou rede foi feita no produto. O roteiro completo foi repetido e
    passou apos o ultimo ajuste de ordenacao de handshake.
  - Driver de runtime temporario: `/tmp/prosa-t2-smoke.mjs`; Chrome e Vite
    de teste encerrados. Sem dados reais, novo IPC, dependencia ou migracao.
    Diff e arquivos novos revisados; nenhum segredo ou arquivo gerado rastreado.
  - Pendente obrigatoria: executar o roteiro manual desta task no Electron
    atualizado com duas instancias/perfis descartaveis. Automacao no Chrome
    nao comprova Electron empacotado nem conectividade entre redes reais.
    T3 nao iniciada e nao elegivel ate a conclusao/validacao de T2.
  - Retorno manual do usuario: nas janelas Teste A/B, B gerou resposta, mas
    A exibiu erro de link invalido/incompleto e ambos permaneceram sem peers.
    T2 nao validada. As capturas nao permitem determinar a causa exata da
    alteracao/incompletude do link. Usuario pediu simplificacao da UX;
    proposta de revisao da spec/plano pendente antes de implementar.
  - Revalidacao R2 autorizada com "sim" e concluida apos T2A/T2B. As
    falhas anteriores permanecem como historico, nao como resultado atual.
    Nenhuma implementacao foi alterada durante esta revalidacao.
  - Rodada atual: `npm --prefix web test` passou 188/188;
    `npm run build` passou (Vite 6.4.4, 66 modulos, mesmo bundle da ultima
    validacao de T2B); `git diff --check` passou. Node.js v24.18.1.
    Aviso preexistente de modulo, sem falhas; nenhum pacote instalado.
  - Reutilizadas as confirmacoes manuais "foi" (fluxo B -> A -> B,
    copia/colagem nativa e aceite no Electron corrigido) e "funcionou"
    (teclado, erro recuperavel e alternativa Ver link no Electron e browser).
    Codigo correspondente nao mudou desde essas confirmacoes.
  - Reexecutado runtime automatizado no Electron real, perfis descartaveis,
    backend journal, UI de producao e WebRTC local: B gerou convite,
    A respondeu, B completou. B apresentou uma enviada e zero recebidas;
    A uma recebida e zero enviadas. Aceite em A produziu um amigo nos dois,
    sem reload. Novo pareamento preservou amizade sem novas pendencias.
  - No mesmo runtime automatizado, bloquear em A e remover em B preservou
    o bloqueio local de A. Re-parear manteve A bloqueado e B removido,
    ambos sem recebidas/enviadas/amigos e com peer online. A UI explicou
    os estados existentes; nenhuma amizade foi recriada automaticamente.
    Esses casos de protecao foram verificados por automacao, nao atribuidos
    ao teste manual do usuario.
  - Rastreabilidade: CA-01/CA-02 cobertos pelo fluxo manual confirmado e
    runtime repetido; CA-03 por re-pareamento e regressoes de duplicacao;
    CA-07 por estados protegidos no runtime e regressoes de aceite tardio
    e pedido explicito. Parte de CA-08 aplicavel a T2 coberta por regressoes
    de falha de envio/persistencia e ausencia de confirmacao falsa de entrega.
    Cancelamento offline de CA-08 permanece no escopo futuro de T4/T5.
  - Assinatura rejeitada, legado, papel ofertante/respondente, resultados
    tardios, cancelamento e listeners/timers permanecem cobertos nas suites.
    Sem novo contrato, versao, IPC, backend ou migracao.
  - Driver desta rodada: `/tmp/prosa-t2-final-revalidation.mjs`.
    Instancias ocultas desta rodada encerradas; nenhuma janela ou perfil
    usado pelo usuario foi alterado. Clipboard nao foi lido/escrito pelo
    driver; somente links dos perfis descartaveis foram transferidos.
  - Limites preservados: evidencia local nao comprova redes externas,
    TURN ou instalador distribuido. Falhas/estados protegidos combinam
    cobertura automatizada com o fluxo manual principal confirmado; nao
    declarar que o usuario testou manualmente todos os estados de contato.
  - T2 concluida pela consolidacao dos criterios e evidencias R2, sem
    dispensar os testes integrados posteriores de T5. Proxima task elegivel:
    T3, somente apos autorizacao especifica.

## T2A - Links validados antes de operar no WebRTC

- Status: concluida
- Requisitos/aceite: RF-11; RNF-01, RNF-03, RNF-04; CA-12.
- Dependencias: T1 concluida e implementacao de T2 existente. A validacao
  manual pendente de T2 nao bloqueia esta correcao, conforme a revisao R2.
- Escopo e arquivos provaveis: `web/src/services/p2p/pairing.js`,
  `web/test/p2p.test.js` e/ou novo arquivo `*.test.js` em `web/test/`.
- Implementacao:
  - Centralizar normalizacao e validacao no servico de pareamento.
  - Limitar entrada a 256 KiB em UTF-8 antes de normalizar/decodificar.
    Tolerar apenas espacos ASCII, tabs e quebras de linha no texto codificado,
    preservando exatamente o SDP decodificado.
  - Preservar links v1 gerados e os formatos codificados sem prefixo/com `#`.
    Validar formato, base64url, JSON objeto nao nulo, versao, tipo e SDP.
  - Rejeitar tipo incorreto em aceitar/completar antes de criar PC ou aplicar
    descricao remota. Tornar os erros utilizaveis pela acao unica de T2B,
    sem novo protocolo, endpoint, dependencia ou coleta de links reais.
- Testes e comandos de validacao:
  - Cobrir ida/volta do codec, SDP preservado, whitespace, formatos
    compativeis, limites de tamanho, vazio, truncado, base64/JSON invalidos,
    arrays/null, versao/tipo invalido e SDP ausente/vazio/nao string.
  - Verificar com mocks que entradas rejeitadas nao criam PC nem aplicam
    descricao remota. Cobrir tambem falha de WebRTC apos payload valido.
  - Manter as suites existentes, inclusive regressoes de contatos e handshake.
  - Executar `npm --prefix web test`, `npm run build` e
    `git diff --check`; revisar whitespace dos testes novos.
- Criterio de conclusao: CA-12 comprovado por regressao automatizada,
  suites/build passando e contratos v1 preservados. Nenhuma validacao de UI
  ou de conectividade real e atribuida aos testes de codec.
- Evidencias:
  - Alterado `web/src/services/p2p/pairing.js`: tamanho limitado antes da
    normalizacao, validacao centralizada, erros com `code` local e mensagens
    sem eco do payload. Sem novos erros HTTP/WS ou mudanca de versao.
  - `acceptPairingOffer` exige oferta valida antes de criar PC;
    `completePairing` exige resposta valida antes de aplicar SDP.
    Falhas nativas de WebRTC continuam distintas dos erros de entrada.
  - Codec passa a decodificar UTF-8 estritamente e preservar SDP; encoder
    elimina spread de array que excedia a pilha em links grandes, mantendo
    exatamente a codificacao base64url dos links v1.
  - Adicionado `web/test/p2p-pairing-codec.test.js`, com 69 casos novos.
    Ajustado apenas o fixture do teste de timeout em `web/test/p2p.test.js`
    para incluir `v: 1`, como os links realmente gerados pelo produto.
  - Regressoes antes da correcao: `node --test --test-name-pattern='^codec:'
    web/test/p2p-pairing-codec.test.js` executou 37 casos, 35 falharam.
    Incluiu reproducao de whitespace, UTF-8 e estouro da pilha no limite.
  - Uma rodada intermediaria falhou no harness novo porque `mock.property`
    exige propriedade global existente. Substituido por stub com restauracao
    explicita do descriptor de RTCPeerConnection; nenhum workaround no produto.
  - Validacao final: `npm --prefix web test` passou 137/137 (68 anteriores
    e 69 novos). `npm run build` passou, Vite 6.4.4, 64 modulos;
    `git diff --check` passou. Runtime: Node.js v24.18.1.
  - CA-12 coberto: ida/volta, SDP/UTF-8 intactos, formatos compativeis,
    padding opcional, colagem com whitespace, limite exato de 256 KiB e byte
    adicional rejeitado, campos/tipos/versoes invalidos, truncamento e
    garantia de nenhuma operacao WebRTC para entrada rejeitada.
  - Mantidas regressoes de contato/handshake e normalizacao actpass ja
    existente na aplicacao da resposta. Apenas aviso de modulo preexistente.
  - Diff e arquivos novos revisados, sem segredos ou dados reais. Testes com
    payloads sinteticos e mocks; sem rede, dependencia, migracao ou novo IPC.
    Build atualizou apenas `web/dist/`, ignorado pelo Git.
  - Validacao de UI/Electron nao exigida nesta task de codec; T2 continua
    nao validada. T2B nao iniciada; botoes e fluxo guiado ainda pendentes.

## T2B - Pareamento guiado com copia de convite e resposta

- Status: concluida
- Autorizacao: "continar", apos a conclusao de T2A e o pedido especifico
  para executar T2B.
- Requisitos/aceite: RF-09, RF-10, RF-13; RNF-01 a RNF-04;
  CA-10, CA-11, CA-13; preservar RF-01 a RF-04.
- Dependencias: T2A concluida e implementacao de T2 existente; nao depende
  da validacao manual de T2, que sera retomada apos esta correcao.
- Escopo e arquivos provaveis: `web/src/components/PairingPanel.vue`,
  `web/src/services/p2p/pairing.js`, `web/src/services/p2p/pairing-peer.js`,
  testes em `web/test/`. Pequeno modulo de estado/clipboard somente se
  necessario para testar a logica real, sem nova dependencia.
- Implementacao:
  - Substituir aceitar/completar por um campo "Cole o link recebido" e uma
    acao "Continuar", roteada pelo tipo validado em T2A, sem tentar ambos.
  - Exibir "Criar convite", "Copiar convite" ou "Copiar resposta" e a
    instrucao correspondente ao estado; retirar links enormes do fluxo
    principal e oferecer "Ver link" somente leitura com conteudo integral.
  - Tratar sucesso, rejeicao e API de clipboard ausente; nunca confirmar
    copia antecipada, regenerar link por falha de copia ou ler clipboard
    automaticamente. Preservar alternativa de copia manual.
  - Bloquear novas operacoes WebRTC concorrentes, mantendo copia e recomeco
    explicito disponiveis. Entrada invalida nao descarta a sessao valida.
  - Orientar resposta sem oferta local e convite durante oferta pendente
    conforme a tabela da spec; separar erro de entrada de falha de conexao.
  - Implementar recomeco/desmontagem sem resultados assincronos antigos
    alterarem a UI; limpar apenas PC/DC/handlers ainda nao anexados, inclusive
    quando a coleta ICE ou chegada do canal termina depois do descarte.
    Preservar contatos, peers anexados e a ordem/validacao de handshake de T2.
  - Manter detalhes tecnicos atuais acessiveis; recolhe-los e adicionar o
    botao de copiar chave sera escopo de T3, sem duplicar essa implementacao.
- Testes e comandos de validacao:
  - Testar roteamento oferta/resposta, estados e protecao contra operacoes
    duplicadas com a logica de producao, nao apenas strings do template.
  - Cobrir copia integral de convite/resposta, sucesso somente apos escrita,
    rejeicao, API ausente e alternativa manual sem perda da sessao.
  - Cobrir resposta sem oferta/reload, oferta concorrente, entrada invalida,
    recomeco em geracao/handshake, conclusao tardia, desmontagem e preservacao
    de peers anexados. Reexecutar os testes de assinatura e estados de amizade.
  - Executar `npm --prefix web test`, `npm run build` e
    `git diff --check`.
  - No Electron atualizado com perfis descartaveis, testar botoes de copia
    e colagem por mouse/teclado, feedback, estado pendente e erros recuperaveis.
    Conferir "Ver link" e tamanho de janela estreito; repetir no navegador.
    Registrar observacoes manuais sem expor links SDP ou clipboard em logs.
- Criterio de conclusao: CA-10, CA-11 e CA-13 exercitados com testes passando
  e evidencias manuais obrigatorias de UX registradas, sem ampliacao de IPC
  ou protocolo. Evidencias do roteiro completo de amizade, se obtidas aqui,
  podem ser usadas na revalidacao autorizada de T2 se o codigo nao mudar;
  esta task nao marca T2 como concluida automaticamente.
- Evidencias:
  - Implementados `web/src/services/p2p/pairing-flow.js` e sua integracao em
    `web/src/components/PairingPanel.vue`: Criar convite, Copiar convite,
    Copiar resposta, acao unica Continuar, instrucao por estado, Ver link
    fechado por padrao e alternativa manual aberta quando a copia falha.
    Nenhuma leitura automatica de clipboard ou nova capacidade IPC.
  - Fluxo preserva oferta valida em erro de entrada e distingue resposta
    sem oferta, convite concorrente e falha nativa de conexao. Copia nao
    confirma sucesso antes da escrita nem gera outro link em erro.
  - `pairing.js` aceita AbortSignal durante geracao; cancela coleta ICE,
    limpa timer/handler e fecha PC nao registrado. Canais atrasados de
    tentativa abortada sao fechados. Recursos anexados continuam sob o node.
  - `pairing-peer.js` retorna cancelamento de handshake pendente e impede
    assinatura/verificacao tardia de enviar hello ou anexar peer descartado.
    Cancelamento apos attachment nao remove a conexao.
  - `transport.on` devolve unsubscribe idempotente. Painel remove suas
    assinaturas e descarta somente tentativas pendentes na desmontagem.
  - Ajuste localizado em `web/src/views/HomeView.vue`: Amigos reutiliza
    o estado de painel aberto no mobile e oferece Voltar as conversas.
    O CSS anterior escondia a tela abaixo de 700 px; sem esse ajuste o
    fluxo novo nao ficava acessivel em viewport estreita. Sem refatoracao
    de outras views ou alteracao da linguagem visual.
  - Adicionados `web/test/p2p-pairing-flow.test.js` e
    `web/test/p2p-pairing-resources.test.js`; ampliado
    `web/test/p2p-pairing-peer.test.js`. Sao 33 novos casos: roteamento,
    concorrencia, copia/clipboard, falhas, reset/dispose, resultados tardios,
    aborto de ICE/handshake e preservacao de peers anexados/listeners.
  - Validacao da primeira implementacao de T2B: `npm --prefix web test` passou 170/170.
    `npm run build` passou (Vite 6.4.4, 66 modulos).
    `git diff --check` passou. Node.js v24.18.1; apenas aviso preexistente
    de modulo. Backend, migracoes e dados reais nao foram utilizados.
  - Runtime automatizado no Chrome, duas instancias/contextos isolados:
    geracao e copia por teclado, fallback de clipboard negado, erro de
    link incompleto, oferta no lugar de resposta, normalizacao de colagem,
    pareamento WebRTC real local e aceite sem reload passaram.
    A apresentou Enviadas=1, B Recebidas=1; apos aceite, Amigos=1 em ambos.
    Recomecar preservou peer online e amizade. Clipboard simulado no browser
    para nao sobrescrever a area de transferencia durante o teste do usuario;
    isso nao comprova copia nativa do Electron.
  - Viewport de 390 px: painel visivel, sem overflow horizontal, navegacao
    Voltar/Amigos exercitada. Capturas desktop e estreita inspecionadas.
    Driver: `/tmp/prosa-r2-browser-smoke.mjs`; capturas em
    `/tmp/prosa-r2-browser-desktop.png` e `/tmp/prosa-r2-browser-narrow.png`.
  - Primeira tentativa de teclado no driver nao ativou o botao porque a
    outra pagina era a ativa; corrigido foco do target via CDP, sem
    workaround no produto. Roteiro completo passou apos essa correcao.
  - Electron: novas janelas R2 A/B abertas em perfis descartaveis, com
    build atualizado do fluxo. Inspecao somente de leitura observou A
    aguardando resposta e B com resposta pronta, sem erro e sem peers.
    Driver automatizado nativo nao prosseguiu porque a tentativa ja estava
    em andamento; seu estado foi preservado para o teste manual do usuario.
  - Chrome/Vite de automacao encerrados. Janelas Electron R2 deixadas abertas.
    Esses testes usam ICE local sem STUN/TURN externos; nao comprovam
    conectividade entre redes reais ou o instalador Electron distribuido.
  - Pendente obrigatoria: usuario confirmar copia/colagem nativa por
    mouse/teclado, feedback e fallback no Electron atualizado. Tambem falta
    observacao manual no navegador; automacao e capturas nao sao declaradas
    equivalentes a essa verificacao. Nao marcar T2B ou T2 como concluidas,
    nem iniciar T3, ate os criterios obrigatorios serem atendidos.
  - Codigo e diff revisados; arquivos novos sem segredos/whitespace indevido.
    Chave/fingerprint continuam acessiveis; recolhimento e Copiar chave
    permanecem no escopo ainda nao iniciado de T3.
  - Novo retorno manual: fluxo B -> A -> B nao apresentou o resultado esperado.
    Inspecao somente de leitura nas instancias R2 confirmou peer online em
    ambas, A na tela inicial e B presa em Conectando. Dados dos perfis
    descartaveis mostram `removed`; esses estados nao serao apagados para
    fazer o teste passar. Permissao nativa clipboard-write estava denied.
    Corrigir handshake para peer ja online e permissao de escrita da pagina
    confiavel, mantendo leitura negada, sem novo IPC nem mudanca de RF-03.
  - Correcoes realizadas no escopo de T2B: o handshake agora verifica a
    assinatura mesmo para peer online, conclui a UI usando o transporte
    existente e fecha apenas PC/DC redundantes. Nao substitui o canal vivo,
    duplica timers ou recria contatos removidos/bloqueados. A UI informa
    explicitamente quando o relacionamento existente impede novo pedido.
  - `web/desktop/main.cjs` usa a politica testavel de
    `web/desktop/permissions.cjs` para permitir `clipboard-sanitized-write`
    apenas no frame principal e URL confiavel do app (ou origem exata em
    dev). Leitura de clipboard, subframes, outras paginas/arquivos e permissoes
    desconhecidas continuam negados. Politica anterior de midia preservada.
    Sem nova ponte IPC, acesso Node no renderer ou permissao de leitura.
  - Tres novas regressoes de peer online falharam antes da correcao,
    reproduzindo o retorno antecipado do handshake. Adicionados tambem
    avisos de relacionamento no flow e testes puros da politica desktop.
    A suite ganhou 18 casos nesta correcao, totalizando 188/188 passando.
  - Revalidacao final: `npm --prefix web test` passou 188/188;
    `npm run build` passou (66 modulos); `git diff --check` passou.
    Nova politica desktop incluida pelo glob `desktop/**` ja existente no
    electron-builder. Nenhuma dependencia, migracao ou artefato distribuido novo.
  - Runtime automatizado no Electron real, backend journal, perfis novos
    descartaveis e ICE local: B criou oferta, A gerou resposta, B completou.
    B exibiu Enviadas=1 e A Recebidas=1; aceitar em A resultou em Amigos=1
    nos dois sem reload. Novo pareamento com o peer ainda online concluiu
    a UI e preservou amizade, sem travar em Conectando.
  - No mesmo runtime, Permissions API reportou clipboard-write granted e
    clipboard-read denied. Driver nao leu/escreveu clipboard: os links
    sinteticos foram transferidos diretamente entre campos das instancias
    de diagnostico. Copia/colagem nativa por gesto do usuario segue pendente.
    Driver: `/tmp/prosa-corrected-native-smoke.mjs`.
  - Instancias ocultas de diagnostico encerradas. A tentativa anterior R2
    foi preservada; novas janelas "Prosa - Teste corrigido A/B" abertas com
    perfis temporarios sem relacionamentos antigos, prontas para novo teste
    manual B -> A -> B. Nao apagar `removed` dos perfis anteriores para
    contornar RF-03; nao declarar T2/T2B validadas sem os criterios manuais.
  - Confirmacao manual do usuario: "foi", em resposta ao roteiro B -> A -> B
    nas janelas Teste corrigido A/B. Registrado sucesso do fluxo principal,
    incluindo copia/colagem nativa e aceite em Recebidas. Nao inferir desse
    retorno teste de teclado, fallback, viewport estreita ou navegador.
    Esses criterios especificos continuam pendentes de observacao manual;
    testes automatizados anteriores permanecem evidencias separadas.
    Nenhuma autorizacao para nova task ou dispensa de criterio foi recebida.
  - Usuario pediu "continuar" apos essa confirmacao: prosseguir somente nas
    checagens restantes de T2B. Preparado navegador visivel com perfil
    descartavel, titulo "Prosa - Validacao no navegador", viewport de 500 px,
    modo P2P e ICE local sem servicos externos. Vite em 127.0.0.1:5177.
    Nenhum teste de teclado/clipboard executado automaticamente nessa janela.
  - Solicitado roteiro manual curto no navegador e no Electron: criar/copiar
    por Tab/Enter, entrada "teste" rejeitada sem perder convite e acesso/copia
    manual por Ver link, seguido de recomeco. Resultado dessas checagens
    registrado na confirmacao a seguir; amizade anterior e perfis antigos
    preservados.
  - Confirmacao manual do usuario: "funcionou", em resposta ao pedido de
    verificar os tres pontos nos dois ambientes. Confirmados teclado,
    feedback de copia, erro recuperavel sem perda de convite e acesso/copia
    alternativa por Ver link no Electron e no navegador de teste estreito.
  - T2B concluida com as evidencias automatizadas (188/188, build e diff)
    e manuais registradas. Nenhum codigo mudou desde essas validacoes.
    T2 nao e marcada como concluida automaticamente: sua revalidacao e o
    proximo passo e exige autorizacao separada, conforme este plano.

## T3 - Chave publica copiavel e detalhes da conexao recolhidos

- Status: concluida
- Autorizacao: "continuar", apos a conclusao/revalidacao de T2 e o pedido
  especifico para executar T3.
- Requisitos/aceite: RF-05, RF-12; RNF-01, RNF-02, RNF-03; CA-04,
  CA-09 e CA-14 (clipboard, cartao da chave e detalhes).
- Dependencias: T2A/T2B concluidas e T2 revalidada/concluida.
- Escopo e arquivos provaveis: `web/src/components/PairingPanel.vue`,
  `web/test/` para regressao da copia quando viavel sem nova dependencia.
- Implementacao:
  - Recolher chave, fingerprint, peers conhecidos e adicao por chave em
    "Detalhes da conexao", fechado por padrao e operavel por teclado.
  - Adicionar botao "Copiar chave" ao cartao preservando linguagem visual.
  - Copiar a chave publica integral e aguardar a operacao antes de mostrar
    sucesso; tratar API ausente, rejeicao e nova tentativa.
  - Usar botao semantico, foco por teclado e feedback anunciado; evitar
    disparo duplicado se o clique no cartao for mantido.
  - Nao introduzir IPC adicional; reportar eventual limitacao de plataforma.
  - Manter aviso legado visivel fora dos detalhes, orientando conferir
    fingerprint ao expandir. Reutilizar o padrao de feedback de copia de T2B.
- Testes e comandos de validacao:
  - Cobrir chave integral, sucesso, rejeicao e clipboard ausente de forma
    automatizada quando viavel; registrar claramente casos apenas manuais.
    Nao usar somente verificacao textual do componente como prova funcional.
  - Executar `npm --prefix web test`, `npm run build` e
    `git diff --check`.
  - Testar clique e teclado no Electron e navegador de desenvolvimento,
    conferir valor colado em destino descartavel e feedback de falha/sucesso.
  - Verificar foco, anuncio acessivel e layout em viewport estreita.
  - Conferir detalhes recolhidos inicialmente, acesso a todos os controles
    expandidos, aviso legado e ausencia de regressao nos botoes de copiar links.
- Criterio de conclusao: casos de CA-04/CA-14 comprovados, sem copia truncada,
  confirmacao falsa ou alteracao da fronteira main/renderer; validacao manual
  de acessibilidade e plataformas registrada.
- Evidencias:
  - `web/src/components/PairingPanel.vue`: detalhes nativos fechados por
    padrao, com chave completa, fingerprint, peers conhecidos e formulario
    manual acessiveis ao expandir. Removida copia por clique no cartao;
    novo botao semantico Copiar chave evita disparo duplicado por bubbling.
  - Copia espera a escrita, desabilita botao enquanto pendente e permite
    retry apos erro. Regiao de anuncio persistente role/status/aria-live/
    aria-atomic e separada do texto visual para evitar anuncio duplicado.
    Feedback visual e erro role/alert ficam fora dos detalhes para
    continuarem visiveis se a secao for recolhida durante a operacao.
    Resultado apos desmontagem e ignorado.
  - Aviso legado permanece fora dos detalhes, orientando conferir fingerprint
    nessa secao. Adicao por chave continua acessivel; mensagens de contato
    removido/falha de solicitacao orientam encontrar o formulario nos detalhes.
  - Novo helper `web/src/services/p2p/clipboard.js` e compartilhado entre
    Copiar chave e `pairing-flow.js`, reutilizando API/feedback de T2B sem
    mudanca de protocolo, IPC, dependencias ou permissao de leitura.
  - Novo `web/test/p2p-clipboard.test.js`: 9 casos para chaves completas
    de 64/88 caracteres, binding do metodo nativo, escrita assincrona,
    API ausente/invalida, rejeicao, retry e falha do accessor. Nenhuma leitura
    de clipboard ou uso de chave privada.
  - `npm --prefix web test`: 197/197 passaram. `npm run build`: passou
    (Vite 6.4.4, 67 modulos). `git diff --check`: passou.
    Runtime Node.js v24.18.1; somente aviso preexistente de modulo.
  - Runtime automatizado em dois contextos Chrome isolados: detalhes fechados
    inicialmente, abertura por teclado, copia integral, escrita pendente sem
    sucesso antecipado, clique duplicado, API negada/ausente, retry por
    teclado e feedback visivel com detalhes fechados passaram. Atributos
    aria-describedby, aria-live e role/alert verificados no DOM.
  - Regressao real WebRTC local no mesmo runtime passou com Copiar convite
    e Copiar resposta usando o helper compartilhado. Hello legado simulado
    apenas no peer de teste mostrou aviso visivel fora dos detalhes fechados.
    Peers conhecidos e formulario manual acessiveis ao reabrir a secao.
  - Capturas a 390 px inspecionadas, sem overflow horizontal, com foco
    visivel no botao. Driver `/tmp/prosa-t3-ui-smoke.mjs`; capturas
    `/tmp/prosa-t3-collapsed.png`, `/tmp/prosa-t3-expanded.png` e
    `/tmp/prosa-t3-legacy.png`.
  - Primeiro assert do driver usava getClientRects para inferir visibilidade
    em details fechado; Chromium mantem boxes mesmo sem pintar o conteudo.
    Corrigido para checkVisibility e inspecao das capturas, sem mudar produto.
  - Apos refinar a regiao persistente de anuncio, suites/build passaram
    novamente (197/197, 67 modulos). Uma repeticao de WebRTC local atingiu
    timeout aguardando recebida. O roteiro completo passou na repeticao
    com politica WebRTC padrao explicitada no Chrome de teste, alem da
    flag mDNS usada nas validacoes anteriores; nenhuma config ICE ou codigo
    de transporte foi alterado para contornar esse timeout. Nao atribuir
    causa definitiva sem evidencia nem prometer conectividade universal.
  - Runtime automatizado no Electron: chave publica de 88 caracteres exibida
    integralmente e igual a pubkey da API publica; chamada de copia recebeu
    o valor integral uma unica vez, com erro/retry e feedback preservado ao
    recolher. Permissoes nativas write granted/read denied confirmadas.
    Driver `/tmp/prosa-t3-native-smoke.mjs`; adapter de clipboard simulado,
    sem ler/escrever area de transferencia do sistema.
  - Diagnosticos ocultos encerrados. Aberta janela Electron visivel
    "Prosa - Copiar chave" no perfil descartavel, em novo processo sem o
    mock de clipboard. Aberto navegador isolado "Prosa - Copiar chave no
    navegador", 500 px, detalhes fechados, ICE local e sem servicos externos.
    Perfis/amizades usados nas tasks anteriores nao foram modificados.
  - Solicitada confirmacao manual de clique/teclado e valor colado em destino
    descartavel nos dois ambientes, com detalhes fechados inicialmente e
    acesso aos controles ao expandir. Usuario confirmou "funcionou" em
    resposta ao roteiro de atualizar, abrir detalhes, copiar por clique e
    Tab/Enter e comparar o valor colado com a chave completa, nao fingerprint.
  - CA-04/CA-14 consolidados pelas regressoes e observacoes automatizadas,
    capturas inspecionadas e confirmacao manual no Electron e navegador.
    Mantida a distincao: atributos de acessibilidade verificados nao sao
    declaracao de observacao de fala real por leitor de tela.
  - T3 concluida, sem alteracao de codigo desde as validacoes e sem nova
    autorizacao implicita. Proxima task elegivel: T4, ainda pendente.

## T4 - Cancelamento de solicitacoes enviadas em P2P e server

- Status: concluida
- Autorizacao: "continuar", apos confirmacao manual/conclusao de T3 e
  pedido especifico para executar T4.
- Requisitos/aceite: RF-06, RF-07, RF-08; RNF-01, RNF-02, RNF-04;
  CA-05, CA-06, CA-07, CA-08, CA-09 (cancelamento).
- Dependencias: T1, T2, T3 (ordem de execucao).
- Escopo e arquivos provaveis: `web/src/components/FriendsPanel.vue`,
  `web/test/p2p.test.js`, `server/test/api.test.js`. Reutilizar providers
  existentes; nao alterar backend sem falha comprovada no escopo aprovado.
- Implementacao:
  - Adicionar "Cancelar convite" em cada enviada, com estado pendente por
    contato, prevencao de chamadas duplicadas e erro visivel.
  - Aguardar `contacts.remove` e releitura da lista, sem remocao otimista;
    distinguir erro da operacao de falha ao atualizar a lista, se necessario.
  - Manter conexao, mensagens e peers conhecidos; nao indicar revogacao do
    link SDP nem entrega remota confirmada no modo P2P.
- Testes e comandos de validacao:
  - Cobrir cancelamento P2P online e fila offline, releitura, aceite tardio e
    preservacao de bloqueio, complementando T1 sem duplicar testes existentes.
  - Adicionar regressao servidor com contas isoladas: cancelar enviada,
    destinatario sem pendencia, evento `RELATIONSHIP_UPDATE` e tentativa de
    terceiro sem autorizacao, sem alterar o relacionamento de outras contas.
  - Cobrir loading, clique duplicado e erro de UI por teste automatizado
    quando viavel; verificar manualmente os casos restantes.
  - Executar `npm --prefix web test`, `npm test`, `npm run build` e
    `git diff --check`.
  - Testar os dois modos em perfis/contas descartaveis; cancelar online,
    offline e apos reinicio; conferir contadores, ausencia de item fantasma,
    preservacao dos dados e limites da entrega remota.
- Criterio de conclusao: CA-05 a CA-08 aplicaveis comprovados por testes e
  roteiro manual; cancelamento nao aparece em Recebidas nem ressuscita por
  aceite tardio; erros/loading e autorizacao servidor verificados.
- Evidencias:
  - Adicionado `web/src/services/invitation-cancellation.js` para aguardar
    `remove`, depois recarregar a lista, controlar pendencias por contato e
    impedir chamadas repetidas. Falha antes da remocao permite retry; falha
    depois da remocao ativa "Atualizar lista" e bloqueia novo DELETE.
  - `web/src/components/FriendsPanel.vue` exibe "Cancelar convite" em cada
    enviada, sem remover a linha otimisticamente, com foco por teclado,
    `aria-busy`, erro `role=alert` e aviso P2P de que a entrega remota nao e
    confirmada.
  - `web/src/services/p2p/contacts.js` serializa mutacoes por chave publica,
    sem bloquear contatos diferentes. Isso impede que leituras IPC clonadas
    ou updates de perfil restaurem `removed`/`blocked` durante corridas.
  - Novos testes em `web/test/invitation-cancellation.test.js` e
    `web/test/p2p-contacts.test.js` cobrem duplicidade, retry, reload com
    remocao ja confirmada, dispose, fila offline, reinicio da fila volatil,
    aceite tardio, bloqueio preservado e corridas de IPC/perfis.
  - Regressao servidor em `server/test/api.test.js`: contas descartaveis,
    DELETE autenticado remove a pendencia, receptor recebe
    `RELATIONSHIP_UPDATE`, DELETE anonimo/terceiro e rejeitado, outra amizade
    e preservada e aceite tardio retorna 404. Backend nao foi alterado.
  - Suites/build: `npm --prefix web test` passou 212/212; `npm test` passou
    13/13; `npm run build` passou; `git diff --check` passou.
    Node.js v24.18.1; apenas aviso preexistente de modulo.
  - UI automatizada em modo P2P a 390 px: pendencia por contato, clique por
    Enter, prevencao de segunda chamada, contadores, erro/retry e ausencia de
    overflow passaram. `web/dist` segue ignorado; nao representa Electron
    empacotado.
  - UI servidor com backend isolado: falha de DELETE manteve a linha;
    DELETE real notificou o receptor por WS; falha de reload apos DELETE
    abriu recuperacao sem segundo DELETE; amizade e mensagem de teste foram
    preservadas. Driver `/tmp/prosa-t4-ui-smoke.mjs`.
  - Runtime P2P no Electron real, perfis descartaveis e WebRTC local:
    cancelamento online removeu Enviadas no remetente e Recebidas no
    destinatario, preservando peer online, peers conhecidos e dados
    sentinelas. Offline, a linha local saiu imediatamente, a pendencia remota
    permaneceu e a remocao foi entregue ao reparear no mesmo processo.
  - Falha inicial do runtime offline reproduziu restauracao de estado por
    leitura IPC clonada; corrigida pela serializacao por contato acima.
    A repeticao passou sem alterar protocolo nem apagar dados dos perfis.
  - Reinicio P2P validado como limitacao: cancelamento local persistiu,
    destinatario manteve a pendencia porque a fila de controle e volatil,
    e aceite tardio nao restaurou amizade no remetente. Esse resultado e
    esperado por CA-08; nao se declarou entrega remota confirmada.
    Driver `/tmp/prosa-t4-native-cancel.mjs`.
  - Checagem manual P2P observada no Electron visivel: o usuario cancelou as
    duas enviadas; a lista passou de Enviadas=2 para Enviadas=0, preservou
    Amigos=1 e exibiu "Convite cancelado neste dispositivo. A entrega ao
    amigo nao e confirmada." Nenhum peer ou perfil real foi alterado.
  - Checagem manual servidor concluida: usuario confirmou a tentativa com
    erro simulado seguida de retry na janela descartavel. A janela foi
    fechada; consulta final da conta de teste mostrou apenas o amigo
    preservado, sem a enviada cancelada. Nenhum dado real foi alterado.
  - T4 concluida. Limitacao registrada para T5/documentacao: o cancelamento
    P2P local e duravel, mas a fila de controle offline nao e persistente;
    apos reinicio, o destinatario pode manter pendencia antiga sem que a UI
    afirme entrega remota confirmada.

## T5 - Validacao integrada e documentacao do fluxo

- Status: concluida
- Requisitos/aceite: RF-01 a RF-13, RNF-01 a RNF-04; CA-01 a CA-14
  (consolidacao das evidencias e verificacao integrada).
- Dependencias: T1, T2A, T2B, T2 revalidada, T3 e T4 concluidas.
- Escopo e arquivos provaveis: `README.md`, este plano e testes existentes
  somente para lacunas de integracao demonstradas. Mudanca de requisito ou
  arquitetura exige revisao da spec, nao ampliacao silenciosa desta task.
- Implementacao:
  - Documentar pareamento versus aceite de amizade, botao de copia,
    cancelamento e limites offline/reinicio, sem prometer entrega duravel.
  - Incluir o fluxo R2, copia de links, acao unica, detalhes recolhidos,
    validacao de entrada e recomeco sem prometer codigo curto ou sinalizacao.
  - Consolidar evidencias por criterio de aceite e revisar o diff completo
    quanto a contratos, dados, IPC, efeitos externos e arquivos gerados.
  - Corrigir apenas falhas de integracao do escopo, com regressao associada.
- Testes e comandos de validacao:
  - Executar `npm --prefix web test`, `npm test`, `npm run build` e
    `git diff --check`; registrar comandos, ambiente e resultados.
  - Executar roteiro integrado com duas instancias isoladas: parear,
    conferir listas, aceitar amizade, repetir pareamento, copiar chave,
    criar nova pendencia de teste e cancelar online/offline.
  - Usar Criar convite/Copiar convite/Copiar resposta/Continuar; verificar
    whitespace, entrada invalida, resposta sem oferta, oferta concorrente,
    recomeco e resultados tardios. Conferir detalhes e copia manual alternativa.
  - Reiniciar perfis descartaveis e conferir estados persistidos e ausencia
    de promessas de entrega remota; conferir bloqueios e aceite tardio.
  - Repetir cancelamento no servidor; revisar teclado, feedback, loading,
    erro, contadores vazios e layout em janela estreita/desktop.
  - Reutilizar evidencias manuais anteriores somente se o codigo relevante
    nao mudou; registrar exatamente o que foi observado e o que falta.
- Criterio de conclusao: todos os criterios de aceite ligados a evidencias
  verificaveis, suites/build passando e documentacao coerente; nenhuma
  pendencia obrigatoria de validacao manual. Nao fazer commit, push ou release.
- Evidencias:
  - Documentacao final atualizada em `README.md`: fluxo guiado de convite e
    resposta, diferenca entre conexao e amizade, Copiar chave, detalhes
    recolhidos, Cancelar convite, preservacao do peer/link SDP e limite da
    fila offline volatil. Contador da suite servidor atualizado para 13.
  - `docs/specs/friend-invitation-flow.md`: estado da execucao atualizado,
    mantendo a falha manual anterior como historico da R1 e a limitacao de
    entrega remota apos reinicio como comportamento aceito de CA-08.
  - Build: `npm run build` passou antes do runtime e novamente na rodada
    final, com Vite 6.4.4, 69 modulos e `web/dist` ignorado. Build Vite nao
    foi tratado como prova de pacote Electron nem de conectividade entre
    redes distintas.
  - Runtime integrado no Electron real, perfis `/tmp/prosa-r2-electron-t5-*`,
    backend de store journal, WebRTC local e sem rede externa: entrada
    invalida, oferta concorrente, colagem com whitespace, fluxo B -> A -> B,
    Enviadas/Recebidas, aceite sem reload, resposta sem oferta, re-pareamento
    de peer online, Copiar chave integral, cancelamento online, cancelamento
    offline com flush no mesmo processo e reinicio com fila perdida passaram.
  - No cenario de reinicio, o remetente permaneceu removido/sem enviada, o
    destinatario manteve a recebida antiga e o aceite tardio nao restaurou
    amizade no remetente. Peers conhecidos e dados sentinelas persistiram.
    Driver: `/tmp/prosa-t5-integrated.mjs`. Perfis e processos descartaveis
    foram encerrados; clipboard do sistema nao foi alterado.
  - Suites finais: `npm --prefix web test` passou 212/212;
    `npm test` passou 13/13, repetindo o cancelamento servidor com DELETE
    autenticado, WS `RELATIONSHIP_UPDATE`, terceiro rejeitado e aceite tardio
    404. `git diff --check` passou. Node.js v24.18.1; apenas aviso
    preexistente de modulo `MODULE_TYPELESS_PACKAGE_JSON`.
  - Revisao final de documentacao e status nao encontrou titulo duplicado de
    T4 nem pendencia manual obrigatoria. Evidencias manuais anteriores foram
    reutilizadas apenas onde o codigo relevante nao mudou desde a observacao.
  - Limitacoes mantidas: sem mailbox/relay ou discovery, sem revogacao do
    link SDP, fila offline de controle nao persistente apos reinicio, testes
    locais nao comprovam NAT/TURN/redes distintas e build Vite nao valida
    artefato Electron distribuido. Nao houve commit, push ou release.

# Tasks: Reconstrucao da home a partir do Figma

- Status geral: concluido; T1 a T4 implementadas e validadas.
- Spec: `docs/specs/reconstrucao-home-figma.md`.
- Spec revisada aprovada no chat em 2026-11-06.
- Ordem de execucao: T1 -> T2 -> T3 -> T4.
- Plano aprovado e T1 autorizada no chat em 2026-11-06 por "continuar".
- T2 autorizada no chat por "continuar", em resposta ao pedido para executar T2.
- T3 autorizada no chat por "continuar", em resposta ao pedido para executar T3.
- T4 autorizada no chat por "continuar", em resposta ao pedido de validacao final.

## Regras de execucao e validacao

- Executar uma task por autorizacao e parar apos registrar seus resultados.
- Preservar as alteracoes preexistentes, inclusive arquivos no stage.
- Reconfirmar Node 24 e pnpm 11 antes dos comandos de runtime.
- Nao instalar dependencias, baixar fontes ou acessar servicos externos sem
  permissao adicional. Builds podem tentar resolver icones ou outros recursos
  pela rede; se isso ocorrer, registrar o bloqueio e solicitar permissao.
- A consulta externa de download e comportamento existente da aplicacao.
  Seu exercicio real no navegador exige permissao de rede; preferir simulacao
  local quando houver ferramenta disponivel, sem acrescentar um runner.
- Nao manipular `.data/`, gerar releases de teste ou sobrescrever dados reais.
- Nao adicionar suite de testes: a spec aprovada preve build, geracao estatica e
  verificacao manual. Registrar verificacoes nao executadas como pendentes.
- Cada task inclui verificacao do diff e testes de regressao do proprio escopo.
  T4 consolida a validacao integrada, nao substitui as verificacoes anteriores.
- Se um criterio obrigatorio nao puder ser observado, marcar a task como
  `aguardando validacao`, nao `concluida`.

## T1 - Hero responsivo e composicao exclusiva da home

- Status: concluida
- Requisitos/aceite: RF-02, RF-07, RF-08, RNF-01 a RNF-07;
  CA-01 (hero), CA-02 (chrome), CA-03, CA-04 a CA-08 (escopo do hero).
- Dependencias: nenhuma.
- Escopo e arquivos provaveis:
  - `app/app.vue`, `app/pages/index.vue` e layouts, somente se necessario.
  - `content/index.md`: metadados e substituicao do hero atual.
  - `app/components/content/LandingHero.vue` e estilos isolados da landing.
  - `app/components/content/DownloadButton.vue`: apenas ajuste visual
    compativel, se necessario.
- Implementacao:
  - Distinguir a home das paginas internas sem APIs de browser durante setup.
  - Remover o header de documentacao apenas da home. Manter o footer atual ate
    sua substituicao atomica em T3, sem deixa-lo duplicado ou remover o das docs.
  - Criar hero com gradiente roxo sobre preto, titulo centralizado, descricao,
    botoes e mockup decorativo de conversa, com dimensoes responsivas.
  - Consultar releases locais em SSR para selecionar a ultima estavel com tag
    e data valida. Excluir prereleases; omitir selo se nao houver candidata.
  - Manter o comportamento de download e o link para `/introducao`.
  - Preservar as secoes inferiores existentes ate T2 e T3, evitando remover
    conteudo sem substituicao.
- Testes e comandos de validacao:
  - `pnpm build` e `git diff --check`.
  - Inspecao do HTML SSR: um h1, links utilizaveis, selo coerente com a colecao.
  - Conferir selecao de release com exemplos descartaveis em memoria ou revisao
    da consulta: release estavel, prerelease mais recente, tag/data ausentes e
    nenhuma candidata; nao alterar arquivos reais para simular estados.
  - No preview do build, conferir hero em 360, 768 e 1440 px; teclado,
    movimento reduzido e ausencia de erros de hidratacao.
  - Exercitar download em macOS, Windows, Linux, plataforma desconhecida e
    falha da API por simulacao local, quando disponivel; caso contrario,
    registrar esses cenarios como validacao manual pendente.
  - Navegar de `/` para `/introducao`, `/download` e `/releases`, voltando a
    home; verificar chrome e preferencia de tema preservados.
- Criterio de conclusao: hero funcional e responsivo conforme o PNG, sem
  regressao observada em download, SEO ou chrome das paginas internas;
  verificacoes obrigatorias do escopo atendidas e evidencias registradas.
- Evidencias (2026-11-06):
  - Criado `app/components/content/LandingHero.vue`: hero escuro, titulo com
    acento roxo, botoes, cartao flutuante e mockup decorativo de conversa;
    estilos isolados, breakpoints e respeito a movimento reduzido.
  - `content/index.md`: substituido somente o hero e atualizado o titulo SEO.
    Secoes inferiores e rodape antigos preservados conforme o escopo de T1.
  - `app/app.vue`: header condicionado a rota diferente de `/`, sem alterar
    navegacao, busca ou preferencia global de tema.
  - Selo consulta a colecao local por data decrescente e seleciona a primeira
    release estavel com tag nao vazia e data valida; omite quando inexistente.
  - `DownloadButton.vue` nao foi alterado; estilos do hero aplicados pela classe
    no componente, preservando seu comportamento atual.
  - Criado `scripts/verify-landing-hero.mjs`, executado com
    `node scripts/verify-landing-hero.mjs`: 5 cenarios de selecao da release e
    9 cenarios de download passaram, incluindo estado inicial SSR, plataformas,
    falha da API e assets vazios. Usa scripts setup reais com mocks de Nuxt e
    navegador; nao e teste de montagem Vue ou de hidratacao. Nenhuma rede real.
  - Runtime confirmado: Node 24.18.1, pnpm 11.18.0.
  - `pnpm build`: passou em 24.7s. Aviso informativo de sharp darwin-arm64,
    sem falha. Sem novas dependencias ou alteracoes de configuracao.
  - Servidor do build iniciado em `http://127.0.0.1:3100`.
    Inspecao automatizada do HTML via fetch local: `/`, `/introducao`,
    `/download`, `/releases` e `/releases/v0-6-0` retornam 200, com um h1 por
    pagina e footer existente. Home sem header; paginas internas com header.
    Hero, SEO, links, selo v0.6.0 e secao inferior antiga presentes no HTML.
  - `git diff --check` passou; arquivos novos de codigo tambem revisados para
    whitespace. Alteracoes staged preexistentes preservadas; nenhum git add,
    commit ou mudanca de dependencias.
  - Criado `scripts/verify-landing-browser.mjs`: usa Chrome instalado, perfil
    temporario isolado e CDP nativo via WebSocket do Node, sem dependencias novas.
    Requisicoes externas da pagina bloqueadas; API de releases interceptada.
    Nao acessa o perfil pessoal do navegador nem abre instaladores.
  - `node scripts/verify-landing-browser.mjs` passou: layout em 360/768/1440 px,
    sem overflow horizontal e com links do hero dentro da viewport; tabulacao
    entre selo/download/introducao e outline visivel; transicoes desativadas
    com movimento reduzido.
  - Navegacao cliente entre `/`, `/introducao`, `/download` e `/releases`
    verificada com preferencias clara e escura. Hero permanece escuro, header
    das docs retorna nas paginas internas e preferencia global e preservada.
  - CA-03 tambem exercitado com componente montado no Chrome: macOS, Windows,
    Linux, plataforma desconhecida, falha da API e lista de assets vazia.
    Os seis cenarios passaram com respostas simuladas, sem rede externa.
  - Primeira execucao do teste de navegador falhou na assercao generica de
    console: o bloqueio de rede provoca avisos do fallback Iconify existente.
    O teste agora separa e reporta somente esse padrao conhecido, sem ignorar
    erros de hidratacao ou outras excecoes. Segunda execucao passou, com
    79 avisos esperados (15 icones distintos) e nenhum erro inesperado.
    Isso nao comprova disponibilidade do servico externo de icones.
  - Capturas de 360/768/1440 px inspecionadas visualmente e comparadas ao PNG:
    hierarquia, cores, botoes e mockup coerentes com o hero da referencia;
    no celular os botoes empilham sem ocultar texto.
    Capturas da rodada aprovada:
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-o0tzAL/`.
    Os artefatos sao temporarios, nao fazem parte do repositorio.
  - `node scripts/verify-landing-hero.mjs` e `git diff --check` repetidos com
    sucesso apos adicionar o teste de navegador. Nenhum codigo de producao
    alterado desde o build validado.
  - CA-01 a CA-05, CA-07 e CA-08 atendidos no escopo de T1; CA-06 atendido
    quanto ao build. Geracao estatica com `/Prosa/` permanece prevista para T4.
    T2 tornou-se elegivel, mas ainda exige autorizacao especifica.

## T2 - Duas secoes ilustradas com assets vetoriais originais

- Status: concluida
- Requisitos/aceite: RF-01 (secoes centrais), RF-03, RF-04, RF-09,
  RNF-01 a RNF-06; CA-01 (secoes ilustradas), CA-04, CA-05 e CA-07.
- Dependencias: T1 concluida.
- Escopo e arquivos provaveis:
  - `content/index.md`.
  - Componentes de secoes em `app/components/content/`.
  - Assets SVG originais em `public/images/`, se necessario.
  - Estilos restritos aos componentes ou a raiz da landing.
- Implementacao:
  - Substituir a secao atual de recursos por duas secoes em duas colunas.
  - Na primeira, usar titulo, selo, dois destaques e cartao sobreposto; criar
    painel de comunidade em SVG com linguagem neon roxa inspirada no PNG.
  - Na segunda, usar titulo, descricao e tres destaques; criar ilustracao
    vetorial de computador/editor, sem tentar apresenta-la como fotografia.
  - Adaptar textos ao conteudo existente de releases, downloads e documentacao;
    nao prometer jogos, criptografia ou infraestrutura nao confirmados.
  - Definir proporcoes das imagens e comportamento mobile, sem cortes que
    escondam informacao essencial. Resolver assets com suporte a `/Prosa/`.
  - Marcar ilustracoes e elementos decorativos adequadamente para leitores
    de tela; nao usar o PNG inteiro como fundo ou pagina.
- Testes e comandos de validacao:
  - `pnpm build` e `git diff --check`.
  - Verificar que SVGs sao locais, sem scripts ou referencias externas.
  - No preview, comparar proporcoes e espacamento com o PNG em 1440 px e
    revisar empilhamento, legibilidade e overflow em 360 e 768 px.
  - Verificar carregamento das imagens, alt/elementos decorativos, hierarquia
    de titulos e regressao visual do hero.
- Criterio de conclusao: duas secoes implementadas com ilustracoes originais,
  textos coerentes e responsividade validada; registrar a diferenca intencional
  entre os SVGs e as imagens originais da referencia.
- Evidencias (2026-11-06):
  - Criado `app/components/content/LandingFeatures.vue`: duas secoes com texto a
    esquerda, ilustracao a direita, cinco destaques e cartao sobreposto.
    Textos adaptados a releases, documentacao e downloads; sem afirmacoes sobre
    jogos, criptografia ou infraestrutura global.
  - Criados `LandingCommunityArt.vue` e `LandingWorkspaceArt.vue` no mesmo
    diretorio: SVGs originais de comunidade neon e computador/editor.
    Diferenca intencional aprovada: estilo vetorial, nao personagens renderizados
    ou fotografia identica a referencia.
  - SVGs inline, sem downloads, scripts, imagens embutidas ou URLs externas.
    Isso evita caminhos de assets que dependam do base path. Ilustracoes e
    cartao de atividade decorativos, com `aria-hidden`; SVGs nao focaveis.
  - `content/index.md`: secao antiga de seis recursos substituida por
    `landing-features`; hero, metadados e CTA inferior preservados.
    Cards e novo rodape nao implementados, pois pertencem a T3.
  - Criado `scripts/verify-landing-art.mjs`: compila os tres templates com o
    compilador Vue ja instalado, verifica markup local e estatico,
    IDs unicos, referencias internas dos SVGs e whitespace.
    `node scripts/verify-landing-art.mjs` passou: 17 IDs unicos e
    20 referencias SVG resolvidas.
  - Runtime reconfirmado: Node 24.18.1 e pnpm 11.18.0.
    `pnpm build` passou em 26.2s, somente aviso informativo de sharp darwin-arm64.
  - `node scripts/verify-landing-hero.mjs` passou: cinco cenarios de selecao
    da release e nove cenarios de download, sem chamadas reais.
  - Ampliado `scripts/verify-landing-browser.mjs` com verificacoes das secoes,
    cinco itens, titulos, bounds das ilustracoes, fundo escuro e screenshots.
    `node scripts/verify-landing-browser.mjs` passou em 360/768/1440 px:
    sem overflow, duas ilustracoes visiveis e dentro da largura da pagina.
    Regressao de foco, movimento reduzido, temas, navegacao cliente e seis
    cenarios de download montado tambem passou.
  - Nenhum erro inesperado de console ou hidratacao. Mantida a limitacao offline:
    79 avisos do fallback Iconify existente (15 icones), reportados separadamente.
    Nenhuma dependencia instalada ou permissao de rede externa utilizada.
  - Capturas das duas secoes nas tres larguras inspecionadas visualmente:
    composicao e espacamentos coerentes com o PNG, empilhamento mobile legivel,
    cartao de atividade sem encobrir conteudo essencial. Screenshots temporarios:
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-LbOaGZ/`.
  - HTML SSR local confirma novas secoes, SVGs e um h1; secao antiga removida e
    CTA antigo preservado. `/introducao`, `/download`, `/releases` e
    `/releases/v0-6-0` retornam HTTP 200 com chrome das docs e sem novas secoes.
  - `git diff --check` e verificacoes de whitespace dos arquivos novos passaram.
    Nenhuma alteracao em dependencias, schema, deploy ou dados locais do usuario.
    Stage preexistente preservado.
  - CA-01 (secoes ilustradas), CA-04, CA-05 e CA-07 atendidos no escopo de T2.
    Preview atualizado em `http://127.0.0.1:62478`.
    T3 elegivel, mas ainda nao autorizada.

## T3 - Cards e rodape completo sem destinos ficticios

- Status: concluida
- Requisitos/aceite: RF-01, RF-05, RF-06, RF-08, RF-09, RNF-01 a RNF-07;
  CA-01 (cards/rodape), CA-02, CA-04, CA-05, CA-07 e CA-08.
- Dependencias: T2 concluida.
- Escopo e arquivos provaveis:
  - `content/index.md`, componentes de cards e rodape da landing.
  - `app/app.vue` e/ou layouts para substituicao do footer apenas na home.
  - Reutilizacao de `public/logotipo-prosa.png` com URL compativel com base path.
- Implementacao:
  - Substituir o CTA inferior antigo por tres cards sobre atualizacoes,
    historico e origem no GitHub, com icones e estilo da referencia.
  - Criar rodape com marca, descricao, grupos de navegacao e faixa de creditos.
  - Usar destinos reais conhecidos. Itens sem URL aparecem como texto nao
    interativo com indicacao "Em breve", sem href ficticio ou foco de teclado.
  - Substituir o footer global na home sem duplicacao. Preservar o footer atual
    nas paginas internas e manter acesso a docs, downloads e releases.
  - Ajustar colunas e alinhamentos para desktop e celular.
- Testes e comandos de validacao:
  - `pnpm build` e `git diff --check`.
  - No preview, verificar todos os links internos e externos por seus destinos,
    sem necessidade de requisicoes externas para validar os enderecos.
  - Conferir ordem de tabulacao e ausencia de foco em itens "Em breve".
  - Revisar home completa em 360, 768 e 1440 px e navegacao de ida/volta para
    paginas internas nos temas claro e escuro.
  - Confirmar ausencia de secoes antigas duplicadas, segundo h1 e footer duplo.
- Criterio de conclusao: home completa na ordem aprovada, cards e rodape
  responsivos, sem links ficticios nem regressao no chrome das paginas internas.
- Evidencias (2026-11-06):
  - Criado `app/components/content/LandingCards.vue`: tres cards estaticos
    sobre atualizacoes, historico e origem no GitHub, com SVGs decorativos
    locais e tratamento visual da referencia.
  - `content/index.md`: CTA antigo substituido por `landing-cards`, preservando
    hero, secoes ilustradas e metadados.
  - Criado `app/components/LandingFooter.vue`: marca existente, descricao,
    colunas Plataforma/Recursos/Legal, redes e creditos do projeto.
    Logo usa `runtimeConfig.app.baseURL`; creditos reutilizam `app.config.ts`.
  - Sete links funcionais apontam para home, releases, download, introducao,
    repositorio GitHub e issues. Oito itens pendentes (seis rotulos e duas redes)
    sao spans nao interativos com texto ou nome acessivel "Em breve".
    Nenhum href vazio, `#` ou destino ficticio. Links externos com
    `noopener noreferrer` e indicacao de nova aba.
  - `app/app.vue`: footer da landing somente em `/`; `AppFooter` atual mantido
    em todas as paginas internas. Sem duplicacao de footer ou alteracao do
    header/busca das docs.
  - Runtime confirmado: Node 24.18.1 e pnpm 11.18.0.
    `pnpm build` passou em 25.4s; somente aviso informativo do sharp darwin-arm64.
  - `node scripts/verify-landing-art.mjs` passou, agora incluindo os cards:
    quatro templates compilados, 18 IDs unicos e 20 referencias SVG resolvidas.
    `node scripts/verify-landing-hero.mjs` passou com os 14 cenarios existentes.
  - Template do footer compilado com Vue; script setup executado em memoria
    com mocks para baseURL `/` e `/Prosa/`: logo gerado corretamente nos dois
    casos. Verificacao sem rede e sem alterar configuracao real.
  - Ampliado `scripts/verify-landing-browser.mjs`: tres cards, um footer, logo
    carregado, sete destinos conhecidos e oito placeholders nao interativos
    verificados em 360/768/1440 px. Nenhum overflow horizontal ou CTA antigo.
  - Teste de teclado percorreu os sete links do footer com foco visivel,
    pulando placeholders. Navegacao cliente com preferencias clara e escura
    preservou tema e chrome das docs e montou o novo footer apenas na home.
  - Regressao do hero, secoes, movimento reduzido e seis cenarios de download
    montado passou. Nenhum erro inesperado ou de hidratacao no console.
    Limitacao offline mantida: 87 avisos esperados de 16 icones do fallback
    Iconify, sem validar disponibilidade real desse servico externo.
  - Capturas de cards e rodape nas tres larguras inspecionadas visualmente:
    hierarquia e espacamentos coerentes com o PNG, cards empilhados no celular
    e colunas do rodape reorganizadas sem esconder texto.
    Artefatos temporarios:
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-O7OEG5/`.
  - HTML SSR das cinco rotas existentes retorna HTTP 200, um h1 e um footer.
    Home sem header/CTA antigo; internas preservam header e footer anteriores.
  - `git diff --check` passou; nenhuma nova dependencia, mudanca de schema,
    dados, automacao ou deploy. Alteracoes staged preexistentes preservadas.
  - CA-01 (cards/rodape), CA-02, CA-04, CA-05, CA-07 e CA-08 atendidos no escopo
    de T3. Preview: `http://127.0.0.1:63076`.
    Geracao estatica e documentacao permanecem para T4, ainda nao autorizada.

## T4 - Validacao integrada do site estatico e documentacao

- Status: concluida
- Requisitos/aceite: RF-01 a RF-09, RNF-01 a RNF-07; CA-01 a CA-08.
- Dependencias: T3 concluida.
- Escopo e arquivos provaveis:
  - Ajustes pontuais nos arquivos da landing para falhas identificadas.
  - `README.md`: atualizar somente a descricao da home e suas fontes de conteudo.
  - Este plano: consolidar evidencias, limitacoes e resultados finais.
- Implementacao:
  - Corrigir apenas problemas de integracao ou criterios nao atendidos da spec.
  - Documentar que a home e uma landing e que `/releases` preserva o historico;
    descrever selo local, ilustracoes originais e itens pendentes de destino.
  - Nao aproveitar a etapa para refatoracoes ou alteracoes no deploy.
- Testes e comandos de validacao:
  - `pnpm build`.
  - `NUXT_APP_BASE_URL=/Prosa/ pnpm generate`.
  - Servir o resultado estatico com ferramenta local ja disponivel e conferir
    `/Prosa/`, `/Prosa/introducao`, `/Prosa/download`, `/Prosa/releases` e
    `/Prosa/releases/v0-6-0`, alem de URLs inexistentes conforme o deploy atual.
  - Verificar links e assets com base path e navegar entre home e docs.
  - Repetir comparacao visual em 1440 px e revisao responsiva em 360 e 768 px;
    conferir teclado, movimento reduzido, temas e console.
  - Consolidar os cenarios de download e selecao do selo verificados em T1;
    repetir quando ajustes posteriores afetarem esses comportamentos.
  - `git diff --check`; revisar tambem arquivos novos e diferencas em relacao
    ao estado inicial, sem modificar stage nem reverter trabalho do usuario.
  - Confirmar ausencia de novas dependencias, fontes remotas, segredos e
    alteracoes em automacao de releases.
- Criterio de conclusao: todos os criterios da spec atendidos com evidencias.
  Se revisao manual ou algum comando estiver bloqueado, manter
  `aguardando validacao` e listar exatamente as pendencias. Nao fazer commit,
  push ou publicacao.
- Evidencias (2026-11-06):
  - README atualizado com anatomia da home, fontes de conteudo, regras do selo,
    ilustracoes originais, itens sem destino e comandos locais de validacao.
  - Primeira rodada: `pnpm build` passou em 23.2s; geracao com `/Prosa/` falhou
    em `/Prosa/_ipx/_/Prosa/logotipo-prosa.png` com `IPX_FILE_NOT_FOUND`.
    O `UColorModeImage` preexistente acrescenta baseURL antes de passar o caminho
    ao Nuxt Image, fazendo o IPX procurar um arquivo inexistente.
    Tambem observado favicon apontando para a raiz `/favicon.ico`.
  - Correcao minima de integracao: `AppLogo.vue` agora usa imagens estaticas
    com caminhos prefixados, mantendo config, alt e variantes clara/escura.
    `app/app.vue` resolve favicon com o mesmo baseURL. Nenhuma alteracao de
    dependencias ou configuracao do otimizador. Stage anterior preservado.
  - Criado `scripts/verify-landing-assets.mjs`: scripts reais de logo, footer
    e app exercitados em memoria com baseURL `/` e `/Prosa/`; logos e favicon
    corretos, URLs externas preservadas.
  - Rodada final: `pnpm build` passou em 25.3s e
    `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` passou em 13.6s, com 17 rotas
    prerenderizadas. Aviso informativo do sharp darwin-arm64 sem falha.
    Logs temporarios: `/tmp/prosa-fixed-build.pUDoJ6` e
    `/tmp/prosa-fixed-generate.xE8Orp`.
  - Criado `scripts/preview-static.mjs`: servidor local somente de arquivos
    gerados, montados em `/Prosa/`, sem SSR ou fallback para HTML com status 200
    em caminhos ausentes. Usa apenas modulos nativos do Node e bind loopback.
    Nao modifica o deploy; serve para reproduzir a validacao local.
  - Inspecao HTTP do resultado estatico: `/Prosa/`, `/Prosa/introducao`,
    `/Prosa/download`, `/Prosa/releases` e `/Prosa/releases/v0-6-0` retornam 200,
    com um h1, um footer e favicon prefixado. Todos os hrefs locais e assets
    JS/CSS/PNG/ICO encontrados nessas paginas retornam 200 com prefixo correto.
    Quatro caminhos inexistentes/fora da base testados retornam 404.
  - `scripts/verify-landing-browser.mjs` adaptado para PREVIEW_URL com base path.
    Rodada final com
    `PREVIEW_URL=http://127.0.0.1:3100/Prosa/ node scripts/verify-landing-browser.mjs`
    passou: 360/768/1440 px sem overflow, SVGs, cards, logo, placeholders,
    foco visivel, movimento reduzido, temas e navegacao cliente.
    Deep links das quatro paginas internas carregam chrome e logos.
  - Busca verificada: abre pelo atalho, aceita consulta e retorna v0.6.0.
    Seis cenarios de download montado passaram com API interceptada.
    Sem erros inesperados ou de hidratacao, nem respostas 4xx de scripts,
    estilos, imagens ou fontes locais.
  - Os tres scripts locais de verificacao (`hero`, `art` e `assets`) passaram
    novamente. Sintaxe de `verify-landing-browser.mjs` e `preview-static.mjs`
    verificada. `git diff --check` e whitespace dos arquivos novos revisados.
  - Captura integral desktop e capturas responsivas inspecionadas visualmente
    e comparadas ao PNG. Diferencas intencionais: textos adaptados, selo real,
    ilustracoes vetoriais, fonte atual com fallback e destinos pendentes.
    Artefatos temporarios da rodada aprovada:
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-HoHYPZ/`.
  - CA-01 a CA-08 atendidos no escopo aprovado. Nenhum commit, push, publicacao,
    instalacao de pacote, alteracao de workflow ou manipulacao manual de `.data/`.
    Diff de dependencias, config Nuxt e automacao de releases permaneceu vazio.
  - Preview final do resultado estatico: `http://127.0.0.1:64726/Prosa/`.

### Limitacoes e achados preexistentes

- O teste offline bloqueia requisicoes externas e reportou 96 avisos esperados
  do fallback Iconify (19 icones). Disponibilidade real de icones e da API de
  releases nao foi exercitada; os cenarios de download usam respostas simuladas.
- Uma verificacao adicional de busca por "Download" falhou. A navegacao
  preexistente mistura folhas de docs com um grupo de releases; o ContentSearch
  atual considera apenas filhos quando encontra qualquer grupo, omitindo folhas.
  Isso foi confirmado pelo payload gerado e pela implementacao instalada do
  componente, sem erros de runtime ou assets. Nenhuma mudanca desta tarefa
  alterou essa consulta/estrutura. Nao foi ampliado o redesign para corrigir a
  busca de paginas soltas; o teste final verifica a busca existente de releases.
- Links externos, GitHub Pages publicado e destinos ainda nao informados pelo
  usuario nao foram validados por rede. Itens sem destino permanecem "Em breve".
- Nao ha requisito adicional pendente de implementacao neste plano.

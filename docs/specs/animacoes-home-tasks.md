# Tasks: Animacoes da home

- Status geral: T1 e T2 concluidas; T3 em andamento.
- Spec: `docs/specs/animacoes-home.md`.
- Spec aprovada no chat em 2026-11-06 por "continuar", em resposta ao pedido
  de aprovacao da spec para criar as tasks.
- Ordem de execucao: T1 -> T2 -> T3.
- Plano aprovado e T1 autorizada no chat em 2026-11-06 por "continuar",
  em resposta ao pedido de aprovacao das tasks e autorizacao para executar T1.
- T2 autorizada no chat por "continuar", em resposta ao pedido
  "Autoriza executar a T2?".
- T3 autorizada no chat por "continuar", em resposta ao pedido
  "Autoriza executar a T3?".

## Regras de execucao e validacao

- Executar uma task por autorizacao explicita e parar apos registrar evidencias.
- Reler spec, task, git status e diff antes de cada execucao.
- Preservar as alteracoes preexistentes identificadas na spec, inclusive
  header na home, rodape compartilhado e tema atual.
- Nao animar header ou rodape nem aplicar estilos novos a paginas internas.
- Nao adicionar dependencias, persistencia ou requisicoes externas.
- Confirmar Node 24 e pnpm 11 antes dos comandos de runtime.
- Nao manipular `.data/`, perfis reais de navegador ou arquivos gerados.
- Usar Chrome com perfil temporario e preview local, bloqueando/simulando
  requisicoes externas conforme o script existente.
- Solicitar permissao adicional caso uma validacao exija acesso a rede.
- Nao marcar como concluida uma task com criterio obrigatorio sem validacao;
  registrar `aguardando validacao` ou `bloqueada`, conforme o caso.
- Separar resultados automatizados de verificacoes visuais/manuais.
- Nao fazer commit, push ou publicacao.

## T1 - Hero animado com base acessivel e fallbacks

- Status: concluida
- Requisitos/aceite: RF-01, RF-03 (mockups do hero), RF-05, RF-07;
  RNF-01 a RNF-08; CA-01, CA-03 a CA-08 (escopo do hero).
- Dependencias: nenhuma.
- Escopo e arquivos provaveis:
  - `app/components/content/LandingHero.vue`.
  - `app/composables/useLandingReveal.ts`, se necessario para compartilhar
    observacao e ciclo de vida com as secoes de T2.
  - Estilos de movimento em arquivo dedicado de `app/assets/css/` ou estilos
    locais, sempre com adesao explicita e sem seletores globais genericos.
  - `scripts/verify-landing-hero.mjs` e
    `scripts/verify-landing-browser.mjs`.
  - Novo script local de regressao sem dependencias, se necessario para
    exercitar ciclo de vida e falhas de inicializacao da base de revelacao.
- Implementacao:
  - Criar a menor base reutilizavel para revelar elementos explicitamente
    marcados, com estado inicial SSR visivel e inicializacao somente no cliente.
  - Observar visibilidade sem polling ou listener continuo de scroll;
    revelar uma vez e desconectar elementos ja tratados.
  - Tratar ausencia de observer, falha de inicializacao, preferencia de
    movimento reduzido inicial/dinamica e limpeza ao desmontar.
  - Revelar imediatamente conteudo que receba foco, sem aguardar atrasos.
  - Aplicar entrada coordenada ao selo opcional, titulo, descricao, acoes e
    mockups do hero, nos limites de duracao e amplitude da spec.
  - Adicionar feedback de hover/pressionamento aos CTAs, sem alterar a
    deteccao de plataforma, links ou fallbacks de download.
  - Manter os efeitos restritos ao hero; nao antecipar aplicacao nas secoes.
- Testes e comandos de validacao:
  - `node scripts/verify-landing-hero.mjs`: preservar selecao de release e os
    nove cenarios de download; ajustar mocks somente se o setup exigir.
  - Ampliar verificacao de navegador para sequencia/estado final do hero,
    foco durante entrada, hover/pressionamento, reduced motion inicial e
    dinamico, ausencia de JavaScript/observer e retorno via navegacao cliente.
  - Adaptar percurso de teclado ao header atual, preservando as verificacoes
    de foco dos links do hero e rodape e registrando falhas preexistentes.
  - Cobrir limpeza de observers/listeners e recuperacao de falha, por
    instrumentacao isolada no teste ou script de regressao local.
  - `pnpm build`; preview local do build e
    `node scripts/verify-landing-browser.mjs`.
  - Verificacao visual do hero e CTAs em 390, 1024 e 1440 px, com e sem
    movimento reduzido; verificar foco e ausencia de overflow.
  - `git diff --check`.
- Criterio de conclusao:
  - Hero atende aos criterios relacionados, com fallbacks exercitados, sem
    nova divergencia de hidratacao nem regressao de download/navegacao.
  - Recursos criados sao liberados ao desmontar e nenhuma outra area recebe
    efeitos novos; testes e verificacoes pertinentes passam.
- Evidencias (2026-11-06):
  - Runtime confirmado: Node v24.18.1 e pnpm 11.18.0.
  - Arquivos: `app/components/content/LandingHero.vue`,
    `app/composables/useLandingReveal.ts`,
    `app/assets/css/landing-motion.css`,
    `scripts/verify-landing-hero.mjs`,
    `scripts/verify-landing-motion.mjs` e
    `scripts/verify-landing-browser.mjs`, alem deste plano.
  - Entradas CSS de 600 ms, atrasos entre 0 e 240 ms, deslocamento de 18 px
    e escala inicial .98 para mockups. CTAs com feedback de 180 ms.
  - Base usa observacao por elemento, foco imediato, fallback visivel e
    cancelamento ao ativar movimento reduzido; recursos liberados ao desmontar.
  - `node scripts/verify-landing-hero.mjs`: passou; cinco cenarios de selecao
    de release e nove cenarios simulados de download.
  - `node scripts/verify-landing-motion.mjs`: passou; SSR visivel, revelacao
    unica, foco inicial/durante entrada, reduced motion dinamico, observer
    ausente, falha parcial de inicializacao, callbacks atrasados e limpeza.
  - `node scripts/verify-landing-art.mjs`: passou; templates, semantica
    decorativa, 18 IDs unicos e 20 referencias locais preservados.
  - `node scripts/verify-landing-assets.mjs`: passou em `/` e `/Prosa/`.
  - `pnpm build`: passou, sem solicitar acesso externo adicional.
  - `pnpm exec tsc --noEmit -p .nuxt/tsconfig.app.json`: passou.
  - Preview SSR iniciado em `http://127.0.0.1:3101`, pois a porta 3100
    estava ocupada por processo preexistente, que nao foi interrompido.
  - `PREVIEW_URL=http://127.0.0.1:3101 node scripts/verify-landing-browser.mjs`:
    passou. Exercitados sequencia/duracoes, foco durante entrada, movimento
    reduzido inicial/dinamico, ausencia de JavaScript/observer, remount com
    movimento normal, isolamento de rotas, teclado, hover/pressionamento,
    toque emulado, busca e seis cenarios de download com API interceptada.
  - Sem overflow em 360, 390, 768, 1024 e 1440 px; nenhum erro novo de
    hidratacao ou recurso local quebrado nos cenarios normais.
  - Revisao visual por capturas: quadros de entrada e estados finais do hero
    em 390, 1024 e 1440 px, incluindo movimento reduzido, foram inspecionados.
    Textos, CTAs e mockups preservam composicao e layout final.
  - Capturas da ultima execucao:
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-M3NHQs`.
    Os quadros `hero-entry-*` usam animacoes pausadas em 180 ms para inspecao;
    nao representam observacao de fluidez em tempo real.
  - Teste de teclado atualizado para atravessar o header atual; assercoes
    antigas de header/rodape condicionais alinhadas ao codigo preexistente,
    sem alterar o produto nem remover verificacoes de foco.
  - Limitacao preexistente identificada: sem IntersectionObserver, o prefetch
    de visibilidade do NuxtLink gera sete excecoes de construtor no Chrome
    instrumentado. Origem confirmada em
    `node_modules/nuxt/dist/app/components/nuxt-link.js`, funcao `useObserver`.
    O hero continua visivel e seus links permanecem presentes. O teste reporta
    essas excecoes separadamente somente nesse cenario injetado; nao ignora
    excecoes equivalentes em navegacao normal. Nenhuma correcao no framework.
  - Rede externa bloqueada no teste; 106 avisos conhecidos de Iconify
    (15 icones unicos) registrados separadamente. Nenhum instalador aberto.
  - `git diff --check`: passou. Nenhuma dependencia, alteracao em paginas
    internas ou efeito novo em header, rodape, secoes e cards.
  - Aprovacao do resultado visual: usuario respondeu "continuar" ao pedido
    direto "Voce conferiu o hero [...] e aprova a fluidez das animacoes?".
    Registrado como aprovacao da T1 no chat, sem atribuir ao agente observacao
    em tempo real nem inventar detalhes de dispositivos ou do roteiro seguido
    pelo usuario. A pendencia de aceite visual foi encerrada por essa aprovacao.
  - Limitacoes mantidas: testes em aparelho fisico e observacao de fluidez em
    tempo real pelo agente nao realizados; validacao tecnica e capturas
    descritas nos itens anteriores.
  - T2 nao iniciada; proxima task elegivel, ainda depende de nova autorizacao.

## T2 - Secoes ilustradas e cards com revelacao por rolagem

- Status: concluida
- Requisitos/aceite: RF-02 a RF-04, RF-06, RF-07; RNF-01 a RNF-08;
  CA-02 a CA-08 (secoes e cards), regressao de CA-01.
- Dependencias: T1 concluida.
- Escopo e arquivos provaveis:
  - `app/components/content/LandingFeatures.vue`.
  - `app/components/content/LandingCards.vue`.
  - Base e estilos de revelacao criados em T1, somente para ajustes necessarios.
  - `scripts/verify-landing-art.mjs` e
    `scripts/verify-landing-browser.mjs`.
- Implementacao:
  - Reutilizar a base de T1 para titulos, descricoes, itens de destaque e SVGs,
    sem modificar a geometria ou o conteudo das ilustracoes.
  - Aplicar escala/opacidade discreta as ilustracoes e revelacao escalonada
    aos cards, com atraso limitado e ativacao individual no celular.
  - Adicionar realce de borda e elevacao discreta nos cards em ponteiro
    preciso com hover; manter semantica de artigo e ausencia de clique.
  - Evitar conflito entre transformacoes de entrada e hover.
  - Preservar o fundo alterado previamente em LandingFeatures.
- Testes e comandos de validacao:
  - Ajustar `verify-landing-art.mjs` para permitir logica de apresentacao nos
    containers se necessaria, mantendo SVGs estaticos, verificacao de assets
    locais, semantica decorativa, compilacao de templates e integridade de IDs.
  - Ampliar teste de navegador para revelar cada secao/card por rolagem,
    aguardar estados finais antes de capturas e comprovar que nao reiniciam
    ao sair e voltar a area visivel na mesma montagem.
  - Verificar reduced motion inicial/dinamico e fallbacks em todos os alvos;
    confirmar que cards seguem sem link, tabindex ou role interativo.
  - Validar isolamento e limpeza na navegacao home -> introducao -> releases
    -> home; verificar os elementos ja visiveis no retorno.
  - `node scripts/verify-landing-hero.mjs`.
  - `node scripts/verify-landing-art.mjs`.
  - `node scripts/verify-landing-assets.mjs`.
  - `pnpm build`; preview local e
    `node scripts/verify-landing-browser.mjs`.
  - Verificacao visual de todas as secoes em 390, 1024 e 1440 px: sequencia,
    clipping, layout final, hover e toque sem hover persistente.
  - `git diff --check`.
- Criterio de conclusao:
  - Textos, ilustracoes e os tres cards revelam corretamente uma vez por
    montagem; fallback e acessibilidade cobrem todos os elementos novos.
  - Cards continuam informativos, sem regressao no hero, layout ou rotas
    internas; todos os testes pertinentes passam.
- Evidencias (2026-11-06):
  - Runtime confirmado: Node v24.18.1 e pnpm 11.18.0.
  - Arquivos: `app/components/content/LandingFeatures.vue`,
    `app/components/content/LandingCards.vue`,
    `scripts/verify-landing-art.mjs`, `scripts/verify-landing-browser.mjs`
    e este plano.
  - Reutilizada a base de T1 sem altera-la: 12 alvos nas secoes ilustradas e
    cinco na secao de cards, com entradas de 600 ms. Atrasos dos cards:
    0, 90 e 180 ms; cada card e observado individualmente.
  - Cards mantidos como artigos nao interativos, com borda/sombra sutis e
    elevacao de 4 px no hover. Propriedade `translate` separada do `transform`
    da entrada evita conflito; feedback de 180 ms, desativado com movimento
    reduzido e sem elevacao em ponteiro de toque.
  - Conteudo, SVGs, hierarquia, links e fundo preexistente de LandingFeatures
    preservados. Nenhuma dependencia, requisicao ou persistencia adicionada.
    Header, rodape e paginas internas nao receberam efeitos novos.
  - `node scripts/verify-landing-hero.mjs`: passou; cinco cenarios de release
    e nove de download, sem regressao da T1.
  - `node scripts/verify-landing-motion.mjs`: passou; fallbacks, foco,
    cancelamento e limpeza da base continuam cobertos.
  - `node scripts/verify-landing-art.mjs`: passou; adaptado para setup de
    apresentacao nos containers, mantendo SVGs estaticos, compilacao,
    verificacao de URLs nos templates/estilos, 18 IDs e 20 referencias locais.
  - `node scripts/verify-landing-assets.mjs`: passou em `/` e `/Prosa/`.
  - `pnpm build` e
    `pnpm exec tsc --noEmit -p .nuxt/tsconfig.app.json`: passaram.
  - Preview SSR atualizado em `http://127.0.0.1:3101`; reiniciado somente o
    servidor criado na T1. O processo preexistente da porta 3100 foi preservado.
  - `PREVIEW_URL=http://127.0.0.1:3101 node scripts/verify-landing-browser.mjs`:
    passou. Testados os 17 novos alvos em 360, 390, 768, 1024 e 1440 px,
    sem overflow, reinicio ao voltar na rolagem ou mudanca do estado final.
  - Instrumentacao isolada de IntersectionObserver comprova liberacao dos
    alvos apos revelacao e limpeza ao sair da home com elementos pendentes.
    Remount normal reinicializa corretamente os tres componentes.
  - Todos os 23 alvos da home permanecem visiveis sem JavaScript/observer.
    Movimento reduzido inicial/dinamico cobre alvos fora da tela e cancela
    entrada ativa de ilustracao; transicoes de CTA/cards ficam desativadas.
  - Verificados hover durante entrada do card, retorno ao estado final,
    ausencia de elevacao por toque emulado, semantica nao interativa, foco,
    navegacao interna, busca e seis cenarios de download com API interceptada.
  - Rede externa bloqueada; mantidas limitacoes preexistentes da T1:
    sete excecoes de prefetch NuxtLink somente no cenario sem observer e
    108 avisos Iconify, de 15 icones. Sem erros novos nos cenarios normais,
    sem divergencia de hidratacao ou falhas de recursos locais.
  - Capturas finais:
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-LseUPY`.
    Capturas anteriores de hover/entrada/toque e movimento reduzido tambem
    inspecionadas em
    `/var/folders/cw/c_1dwr5s3570chyn542yvs9c0000gn/T/prosa-hero-browser-4T0hR4`.
  - Revisao visual por capturas: secoes e cards legiveis, SVGs proporcionais,
    cards empilhados no celular e layout final preservado em 390, 1024 e
    1440 px. Quadros intermediarios pausados e estados de hover/toque
    inspecionados; capturas nao comprovam fluidez em tempo real.
  - Capturas de secoes agora partem da rolagem no topo, evitando que o header
    sticky cubra artificialmente o conteudo em recortes de documento.
  - `git diff --check`: passou; alteracoes preexistentes preservadas.
  - Aprovacao do resultado visual: usuario respondeu "continuar" ao pedido
    direto "Aprova a fluidez para concluir a T2?". Registrado como aprovacao
    da T2 no chat, sem atribuir ao agente observacao em tempo real nem
    inventar detalhes do roteiro seguido pelo usuario.
  - Limitacoes mantidas: aparelho fisico e observacao de fluidez em tempo
    real pelo agente nao testados; validacao tecnica e capturas descritas
    nos itens anteriores. Pendencia de aceite visual encerrada pela aprovacao.
  - T3 nao iniciada; proxima task elegivel, ainda depende de nova autorizacao.

## T3 - Validacao estatica integrada e documentacao

- Status: em andamento
- Requisitos/aceite: RF-01 a RF-07; RNF-01 a RNF-08; CA-01 a CA-09.
- Dependencias: T1 e T2 concluidas.
- Escopo e arquivos provaveis:
  - `README.md`: comportamento dos efeitos, acessibilidade e comandos locais
    de validacao adicionados, se houver.
  - `scripts/verify-landing-browser.mjs` e scripts de regressao pertinentes,
    apenas para lacunas da validacao integrada.
  - Este plano: evidencias finais e pendencias.
  - Implementacao de T1/T2 apenas para corrigir defeitos do escopo aprovado.
- Implementacao:
  - Documentar animacoes somente na home, fallback visivel e suporte a
    movimento reduzido, sem mensagens de aprovacao no README.
  - Consolidar validacao SSR e estatica com base `/Prosa/`, sem mudar deploy,
    nuxt.config ou requisitos.
  - Revisar o diff completo para isolamento, dependencias, requisicoes,
    preservacao do trabalho anterior e ausencia de arquivos gerados/segredos.
- Testes e comandos de validacao:
  - `node scripts/verify-landing-hero.mjs`.
  - `node scripts/verify-landing-art.mjs`.
  - `node scripts/verify-landing-assets.mjs`.
  - Executar qualquer script local de regressao adicionado em T1/T2.
  - `pnpm build`; preview SSR local e teste de navegador.
  - `NUXT_APP_BASE_URL=/Prosa/ pnpm generate`.
  - `node scripts/preview-static.mjs` e, em outro processo,
    `PREVIEW_URL=http://127.0.0.1:3100/Prosa/ node scripts/verify-landing-browser.mjs`.
  - Nao manter previews conflitantes na mesma porta.
  - Conferir sem JavaScript e sem observer no preview estatico: conteudo
    visivel, links locais corretos e imagens carregadas.
  - Repetir roteiro visual de hero, secoes e cards nas tres larguras,
    movimento normal/reduzido, teclado, ponteiro e toque emulado.
  - Inspecionar erros novos de console, hidratacao e recursos locais;
    separar avisos externos esperados de falhas reais.
  - `git diff --check`.
- Criterio de conclusao:
  - Todos os criterios da spec atendidos e evidenciados, incluindo build,
    geracao estatica no prefixo de producao e verificacao visual.
  - README atualizado, sem alteracoes fora de escopo; limitacoes de emulacao
    e eventual validacao em aparelho fisico descritas sem alegar observacao.
  - Se qualquer verificacao obrigatoria nao puder ser executada, registrar
    pendencia em vez de declarar o plano concluido.
- Evidencias: a preencher durante a execucao.

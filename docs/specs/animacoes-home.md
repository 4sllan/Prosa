# Spec: Animacoes da home

- Status: aprovada (2026-11-06)
- Data: 2026-11-06
- Analise: concluida no chat.
- Autorizacao: criacao da spec autorizada por "continuar", em resposta ao
  pedido para criar a spec com efeitos somente na home.
- Escopo confirmado pelo usuario: home; documentacao e releases sem alteracoes.
- Aprovacao: spec aprovada no chat por "continuar", em resposta ao pedido de
  aprovacao da spec para criar as tasks. Autorizacoes de execucao por task
  registradas em `docs/specs/animacoes-home-tasks.md`.

## 1. Objetivo e contexto

Adicionar animacoes discretas e coordenadas aos textos, botoes, ilustracoes e
cards da rota `/`, preservando o conteudo, a linguagem visual e a navegacao.

A home usa `app/pages/index.vue` para renderizar `content/index.md`, composto
por `LandingHero`, `LandingFeatures` e `LandingCards`. O hero ja possui
transicoes de cor e sombra nos CTAs e tratamento basico de movimento reduzido.
As ilustracoes sao SVGs locais e os tres cards sao artigos nao interativos.

Existem alteracoes preexistentes em `app/app.vue`, `app/assets/css/main.css`,
`app/components/AppHeader.vue`, `app/components/LandingFooter.vue` e
`app/components/content/LandingFeatures.vue`. Elas devem ser preservadas.
O codigo atual exibe o header na home e compartilha o rodape entre rotas,
diferentemente do isolamento descrito na spec de reconstrucao anterior.
Esta proposta nao corrige nem reverte essa divergencia.

## 2. Escopo

### Dentro do escopo

- Entrada coordenada dos textos, selo e acoes do hero.
- Revelacao dos titulos, descricoes, itens de destaque e ilustracoes das
  secoes inferiores quando entrarem na area visivel.
- Entrada escalonada dos tres cards e realce visual discreto no hover.
- Feedback de hover e pressionamento dos CTAs da home.
- Acessibilidade, fallbacks, responsividade e validacoes dos efeitos.

### Fora do escopo

- Animar header, rodape, busca, documentacao ou paginas de releases.
- Redesign, alteracao de textos, links, dados ou algoritmo de download.
- Efeitos por letra, texto digitado, parallax, tilt com ponteiro ou loops
  decorativos continuos.
- Novas dependencias, fontes, assets remotos, endpoints ou infraestrutura.
- Refatoracoes adjacentes, alteracoes no deploy, commit, push ou publicacao.

## 3. Requisitos

### Funcionais

- RF-01: Na montagem da home, revelar selo quando presente, titulo, descricao
  e grupo de acoes do hero em sequencia curta, usando opacidade e pequeno
  deslocamento vertical. Nao dividir palavras em elementos para animar letras.
- RF-02: Revelar os textos e itens das secoes inferiores uma unica vez por
  montagem, quando entrarem na area visivel. Nao esconder novamente ao sair
  da tela nem exigir rolagem para revelar elementos ja visiveis na montagem.
- RF-03: Revelar mockups e ilustracoes com opacidade e escala discreta.
  Preservar proporcoes, posicoes finais, recortes e atributos decorativos.
- RF-04: Revelar os tres cards em sequencia quando visiveis, com atrasos
  limitados e independentes da quantidade total de elementos da pagina.
  No celular, cada card deve poder aparecer sem aguardar cards fora da tela.
- RF-05: Os CTAs devem apresentar leve elevacao no hover e resposta de
  pressionamento. Manter feedback de foco visivel sem depender de movimento.
  O selo de release deve preservar seu comportamento e foco existentes.
- RF-06: Cards podem receber elevacao discreta e realce de borda no hover,
  mas devem continuar nao clicaveis: sem cursor de link, tabindex, role de
  botao ou manipuladores de clique.
- RF-07: Ao sair da home, liberar observers e listeners criados para os
  efeitos. Ao retornar via navegacao cliente, inicializar os efeitos sem
  duplicacao de recursos ou conteudo permanentemente oculto.

### Nao funcionais

- RNF-01: Aplicar novos efeitos somente ao conteudo dos tres componentes da
  home. Estilos e eventual logica compartilhada devem exigir adesao explicita,
  sem seletores genericos que animem outras paginas ou componentes globais.
- RNF-02: Respeitar `prefers-reduced-motion: reduce` na carga inicial e em
  mudancas durante a sessao: revelar conteudo imediatamente, sem deslocamentos,
  escala, atrasos ou transicoes animadas dos elementos abrangidos.
- RNF-03: SSR e HTML estatico devem conter todo o conteudo visivel por padrao.
  Sem JavaScript ou sem suporte a observacao de visibilidade, nada pode ficar
  oculto. APIs de navegador devem ser usadas somente no cliente apos montagem,
  sem divergencia de hidratacao.
- RNF-04: Usar CSS para animacao e observacao de visibilidade no cliente apenas
  quando necessaria. Nao adicionar bibliotecas, polling ou listeners de scroll
  executando a cada quadro.
- RNF-05: Entradas devem durar entre 400 e 700 ms, com atraso individual de
  no maximo 240 ms; feedback dos CTAs/cards deve durar entre 120 e 220 ms.
  Deslocamentos devem ser de no maximo 24 px e variacoes de escala de ate 3%.
  Nao animar dimensoes ou margens; priorizar transform e opacity.
- RNF-06: Preservar layout final, tipografia, cores, hierarquia semantica e
  ordem de leitura. Efeitos nao devem gerar rolagem horizontal, bloquear links,
  ocultar foco ou impedir uso por toque. Hover com movimento deve ficar
  restrito a dispositivos com hover e ponteiro preciso.
- RNF-07: Elementos que recebam foco durante uma entrada devem ficar
  imediatamente visiveis. Nenhuma acao pode depender do termino da animacao.
- RNF-08: Preservar alteracoes preexistentes e nao editar arquivos gerados,
  dados locais ou comportamentos das demais rotas.

## 4. Renderizacao e UI/UX

- Preservar o fluxo Nuxt Content e a renderizacao atual, sem mudar routeRules.
- Suportar SSR e geracao estatica para GitHub Pages, inclusive base `/Prosa/`.
- Validar desktop, tablet e celular, com larguras de 1440, 1024 e 390 px.
- Executar entradas uma vez por montagem; uma nova visita cliente a home
  pode repetir a sequencia, respeitando a preferencia de movimento vigente.
- Manter textos e imagens visiveis quando o aprimoramento cliente nao puder
  ser inicializado. Nao atrasar renderizacao ou carregamento para animar.
- Evitar conflito entre transformacoes de entrada e hover, garantindo que
  ambos terminem na posicao e escala originais.

## 5. Contratos e compatibilidade

Rotas Nitro, middleware, runtimeConfig e tipos compartilhados: nao se aplica;
a mudanca e exclusivamente de apresentacao e nao cria contratos de dados.

Preservar consultas locais de conteudo, selecao de release estavel, links e
comportamento client-side de `DownloadButton.vue`, incluindo fallback.
As classes usadas pelos scripts existentes devem ser preservadas ou ter suas
assercoes ajustadas sem reduzir a cobertura.

## 6. Estado, persistencia e migracoes

Apenas estado efemero cliente de elementos revelados e recursos de observacao.
Nao persistir preferencias, flags ou progresso das animacoes.
Persistencia, migracoes e integridade de dados: nao se aplica; nao ha mudanca
de modelo nem necessidade de acessar `.data/`.

## 7. Seguranca, privacidade e recursos

Autenticacao e autorizacao: nao se aplica; nao ha operacoes protegidas novas.
Nao coletar dados, criar requisicoes externas ou acessar segredos.
Desconectar observacoes apos revelacao e liberar recursos ao desmontar.
Nao alterar a consulta externa ja existente do botao de download.

## 8. Falhas e recuperacao

- Sem JavaScript, suporte a observer ou com movimento reduzido: conteudo
  imediatamente visivel e links utilizaveis.
- Se a inicializacao dos efeitos falhar, nao deixar estados ocultos aplicados.
- Ao ativar movimento reduzido durante uma entrada, finalizar a revelacao e
  remover o movimento, sem exigir recarga.
- Offline, timeout e erros de dados: manter fallbacks atuais; as animacoes nao
  criam requisicoes nem estados adicionais de loading ou erro.

## 9. Criterios de aceite

- CA-01 (RF-01, RNF-05): selo quando existente, titulo, descricao e acoes do
  hero entram em ordem, dentro dos limites de duracao, atraso e deslocamento.
- CA-02 (RF-02 a RF-04): rolar a home revela textos, ilustracoes e cards;
  voltar a uma secao nao reinicia os efeitos na mesma montagem.
- CA-03 (RF-05, RF-06, RNF-06): hover e pressionamento funcionam nos CTAs;
  cards mantem semantica de artigo e nao aparentam ser links.
- CA-04 (RNF-02, RNF-07): com movimento reduzido, todo conteudo fica visivel
  sem animacao; alterar a preferencia durante a sessao produz o mesmo resultado.
  Navegacao por teclado mantem foco visivel, inclusive durante entradas.
- CA-05 (RNF-03): sem JavaScript ou sem observer, textos, imagens e links
  continuam visiveis e utilizaveis; nao ha erro novo de SSR ou hidratacao.
- CA-06 (RF-07, RNF-01, RNF-08): navegar entre home, introducao e releases
  nao aplica efeitos novos fora da home; retornar permite nova inicializacao
  sem duplicacao de observers/listeners.
- CA-07 (RNF-06): em 390, 1024 e 1440 px, nao ha overflow horizontal nem
  mudanca do layout final, incluindo interacao por toque sem hover persistente.
- CA-08 (RNF-04, RNF-08): nenhuma dependencia, requisicao ou persistencia
  adicionada; alteracoes preexistentes preservadas.
- CA-09: build e geracao estatica com base `/Prosa/` passam; scripts pertinentes
  e verificacao de whitespace passam, com verificacoes manuais registradas
  separadamente e sem declarar como observado o que nao foi executado.

## 10. Estrategia de validacao

- Confirmar Node 24 e pnpm 11 antes de comandos de runtime.
- Executar `pnpm build`, `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` e
  `git diff --check`.
- Reutilizar `scripts/verify-landing-hero.mjs`, `verify-landing-art.mjs`,
  `verify-landing-assets.mjs` e ampliar `verify-landing-browser.mjs` para
  movimento normal/reduzido, revelacao por rolagem, fallback sem JavaScript e
  sem observer, foco e retorno via navegacao cliente.
- Adaptar o teste de teclado ao header atualmente presente, sem remover
  verificacoes de foco e acesso aos links do hero e do rodape.
- Usar preview local, Chrome com perfil temporario e requisicoes externas
  bloqueadas/simuladas, conforme o script existente. Nao instalar runner.
- Revisar visualmente suavidade, sequencia, estado final, hover, pressionamento
  e toque nas larguras definidas. Separar testes automatizados de observacoes
  manuais e registrar limitacoes de emulacao.
- Preservar `.data/` e nao consultar servicos externos reais para validar
  animacoes. Solicitar permissao adicional se algum comando exigir rede.

## 11. Riscos e decisoes

- Aplicar estados ocultos antes de inicializar observacao pode deixar conteudo
  inacessivel; o fallback visivel e obrigatorio.
- Capturas de tela existentes podem ocorrer durante animacoes ou antes de
  secoes entrarem na tela; os testes devem aguardar estados observaveis.
- Transformacoes concorrentes de entrada/hover e recortes dos containers podem
  causar saltos ou clipping; validar ambas as interacoes e o layout final.
- A suite de navegador possui suposicoes anteriores ao header atual; tratar
  incompatibilidades pertinentes sem reverter o trabalho preexistente.
- Decisao proposta: efeitos breves e sem loops, restritos aos tres componentes
  de conteudo da home; header e rodape permanecem sem novos efeitos.
- Nao ha decisao tecnica bloqueante para a revisao desta spec.

# Spec: Reconstrucao da home a partir do Figma

- Status: aprovada (2026-11-06)
- Data: 2026-11-06
- Analise: concluida no chat; criacao desta spec autorizada pelo usuario.
- Revisao: decisoes do usuario incorporadas; versao revisada aprovada no chat
  por "continuar", em resposta ao pedido de aprovacao para criar as tasks.
- Referencia visual local: `docs/home.png` (1440 x 3675).
- Referencia Figma informada: https://www.figma.com/design/zuQoR9No92YxqMWzrPnhaB/teste?node-id=73-972&m=dev
- Cobertura: o Figma nao foi consultado; medidas e composicao foram observadas
  no PNG. Nao ha evidencia de interacoes ou variantes mobile do Figma.

## 1. Objetivo e contexto

Reconstruir a rota `/` como landing de apresentacao do Prosa, reproduzindo a
hierarquia visual da referencia: fundo preto, acentos roxos, hero centralizado,
mockup de conversa, secoes ilustradas, cards de tecnologia e rodape em colunas.

A home atual e renderizada por `app/pages/index.vue`, que consulta a colecao
`landing` e entrega `content/index.md` ao `ContentRenderer`. Header e footer
de documentacao sao montados globalmente em `app/app.vue`.

Esta proposta substitui, somente na home, a anatomia visual e o chrome definidos
em `docs/specs/estilo-landing-docs.md`. As paginas internas preservam o
comportamento existente. A aprovacao desta spec nao altera o status ou o
historico de aprovacoes das specs anteriores.

## 2. Escopo

### Dentro do escopo

- Reorganizar o conteudo da home mantendo Nuxt Content e seus metadados.
- Criar componentes de apresentacao quando o Markdown nao oferecer controle
  suficiente para reproduzir a referencia.
- Aplicar estilos especificos da landing, sem vazar para as paginas internas.
- Usar composicao sem header de documentacao e com rodape proprio apenas em `/`.
- Reutilizar o comportamento existente de download por plataforma.
- Preservar acesso a introducao, download e historico de releases.
- Adaptar o layout para desktop, tablet e celular.
- Criar ilustracoes locais originais em SVG inspiradas na composicao do PNG,
  sem requisicoes a bancos de imagens ou servicos de geracao.

### Fora do escopo

- Redesign de documentacao, busca ou paginas de releases.
- Novas rotas de produto, paginas legais ou funcionalidades anunciadas no PNG.
- Implementar chat, minijogos, infraestrutura ou mecanismos de seguranca.
- Novas dependencias, backend, autenticacao, migracoes ou mudancas no CI/CD.
- Alterar o algoritmo de selecao de instaladores ou a automacao de releases.
- Publicacao, commit ou push.

## 3. Requisitos

### Funcionais

- RF-01: A home deve apresentar as secoes nesta ordem visual: hero; secao
  ilustrada principal; secao ilustrada secundaria; tres cards; rodape.
  Os temas devem refletir notas de versao, downloads e documentacao.
- RF-02: O hero deve conter titulo "Onde a conversa acontece.", destaque roxo
  em "acontece.", descricao, selo conforme D2, CTA de download, link
  "Introducao" para `/introducao` e mockup decorativo de conversa.
- RF-03: A secao ilustrada principal deve conter selo, titulo, descricao, dois
  itens de destaque e cartao sobreposto, adaptados do conteudo atual sobre
  novidades e historico de releases, com ilustracao conforme D1.
- RF-04: A secao ilustrada secundaria deve conter titulo, descricao e tres itens
  sobre notas organizadas, acesso a documentacao e downloads, com ilustracao
  conforme D1.
- RF-05: A secao de cards deve apresentar titulo centralizado, descricao e tres
  cards adaptados dos temas atuais: atualizacoes, historico e origem no GitHub.
- RF-06: O rodape deve conter marca Prosa, descricao, grupos de navegacao e
  faixa de creditos. Conforme D3, itens sem destino devem aparecer como texto
  nao interativo, com indicacao de indisponibilidade; nao criar links `#`,
  destinos ficticios ou paginas inexistentes. Enderecos poderao ser definidos
  posteriormente, sem impedir a entrega visual desta home.
- RF-07: O CTA deve preservar deteccao client-side de plataforma, consulta
  existente aos assets do GitHub e fallback do `DownloadButton.vue`.
  No SSR e em plataformas nao reconhecidas, deve permanecer utilizavel sem
  depender de deteccao do navegador.
- RF-08: `/introducao`, `/download`, `/releases` e detalhes existentes devem
  continuar acessiveis, com header, footer, busca e tema atuais.
- RF-09: O conteudo deve preservar o idioma e a hierarquia do PNG, usando os
  textos atuais como fonte conforme D4, sem afirmar capacidades nao confirmadas.

### Nao funcionais

- RNF-01: Reproduzir proporcoes, espacamentos, contraste, superficies escuras,
  bordas sutis, botoes arredondados e iluminacao roxa da referencia.
- RNF-02: Em telas estreitas, empilhar colunas e cards, permitir quebra dos
  CTAs e impedir rolagem horizontal. Manter texto legivel e imagens proporcionais.
- RNF-03: Usar um unico h1, titulos hierarquicos, links com nomes acessiveis,
  foco visivel e contraste adequado. Imagens informativas devem ter alt;
  mockups puramente decorativos nao devem poluir a arvore de acessibilidade.
- RNF-04: Preservar SSR e hidratacao. Efeitos opcionais devem respeitar
  `prefers-reduced-motion`; nenhum conteudo essencial depende de animacao.
- RNF-05: Nao adicionar dependencias. Usar componentes e icones existentes,
  CSS e recursos locais aprovados. Nao introduzir fontes remotas sem autorizacao.
- RNF-06: Preservar alteracoes preexistentes e nao editar arquivos gerados.
  Assets e links internos devem funcionar com o base path `/Prosa/`.
- RNF-07: A aparencia escura deve ficar restrita a landing, inclusive quando
  a preferencia global estiver no modo claro, sem modificar o modo das docs.

## 4. Renderizacao e comportamento de UI

Manter SSR padrao do Nuxt e suporte ao pre-render estatico utilizado pelo
GitHub Pages. Nao adicionar `routeRules`. Manter a colecao `landing`,
`useAsyncData`, `ContentRenderer` e metas de SEO coerentes com o novo conteudo.

A composicao da home deve evitar duplicacao do rodape global. A distincao entre
home e paginas internas deve ser deterministica no SSR e na navegacao cliente,
sem inspecionar `window.location`.

Sem layout mobile fornecido, a adaptacao responsiva e uma interpretacao da
referencia desktop, a validar em 360, 768 e 1440 pixels de largura.

## 5. Contratos afetados

- `content/index.md`: nova estrutura de apresentacao e metadados da landing.
- `app/pages/index.vue`: preservar consulta, SEO e tratamento de pagina ausente.
- `app/app.vue` e/ou layouts: distinguir chrome da home e das paginas internas.
- Componentes e CSS: adicionar somente os necessarios para a landing; preservar
  a interface atual de `DownloadButton.vue`, salvo ajuste visual compativel.
- Colecoes `docs` e `releases`: sem alteracao de schema ou consultas por motivo
  deste redesign.
- Rotas Nitro, middleware, `runtimeConfig` e tipos compartilhados: nao se aplica;
  nenhuma nova API ou contrato de dados.

## 6. Estado, persistencia e migracoes

Nao ha novo estado persistente nem migracoes. O download conserva seu estado
client-side existente. Nao manipular `.data/` nem seus bancos para validacao.
Nao introduzir consultas de versao no navegador apenas para preencher o selo.

## 7. Autenticacao, privacidade e limites

Nao se aplica autenticacao ou autorizacao: trata-se de pagina publica estatica.
Nao adicionar formularios, analytics, cookies ou coleta de dados.
Preservar apenas a consulta externa ja existente no componente de download;
novos recursos visuais devem ser locais e otimizados.

## 8. Falhas e recuperacao

- Conteudo da landing ausente: preservar o 404 existente.
- API de releases indisponivel, bloqueada ou sem instalador correspondente:
  manter o fallback existente, sem bloquear o restante da landing.
- JavaScript indisponivel: conteudo principal e links devem existir no HTML.
- Ilustracoes: criar SVGs originais conforme D1. Nao declarar equivalencia com
  os personagens ou com a fotografia do PNG; registrar essa diferenca visual.
- Nenhuma nova tela de loading, erro ou estado vazio e necessaria para as secoes
  estaticas. Preservar o indicador de navegacao existente.

## 9. Criterios de aceite

- CA-01 (RF-01 a RF-05, RNF-01): em 1440 px, comparacao visual com o PNG confirma
  ordem, hierarquia, alinhamentos, proporcoes e tratamentos de cor das secoes,
  usando as ilustracoes definidas em D1 e os textos adaptados em D4.
  Registrar diferencas remanescentes; nao exigir identidade fotografica.
- CA-02 (RF-06, RF-08): todos os links interativos possuem destinos validos;
  itens pendentes do rodape nao recebem foco nem simulam links funcionais.
  Nao ha duplicacao de header ou rodape na home; paginas internas preservam
  seu chrome.
- CA-03 (RF-07): verificar CTA em macOS, Windows, Linux, plataforma desconhecida
  e falha da API; os rotulos e destinos seguem o comportamento existente.
- CA-04 (RNF-02): em 360, 768 e 1440 px, nao ha overflow horizontal,
  sobreposicao que esconda conteudo ou CTA inacessivel.
- CA-05 (RNF-03, RNF-04): navegacao por teclado, foco, hierarquia de titulos,
  alternativas de imagens e movimento reduzido verificados; sem erros de
  hidratacao no console.
- CA-06 (RNF-05, RNF-06): `pnpm build` e
  `NUXT_APP_BASE_URL=/Prosa/ pnpm generate` passam; preview estatico permite
  navegar pela home e paginas existentes com assets locais carregados.
- CA-07 (RNF-05, RNF-06): sem novas dependencias; `git diff --check` limpo nas
  alteracoes da tarefa; nenhum arquivo do usuario removido ou revertido.
- CA-08 (RNF-07): alternar preferencias claro/escuro e navegar entre home e docs
  nao altera o tema global nem causa flash de home clara apos hidratacao.

## 10. Estrategia de validacao

Ambiente observado: Node 24.18.1 e pnpm 11.18.0. Nao ha script de testes nem
runner configurado. Nao instalar ferramentas de teste nesta proposta.

Validacao automatizada: build, geracao estatica com base de producao e verificacao
do diff. Validacao manual: comparacao com o PNG, larguras definidas, teclado,
movimento reduzido, console, tema, links e cenarios do download.

Cada resultado deve distinguir o que foi executado do que permanece pendente.
Build e geracao nao substituem revisao visual ou testes de comportamento.
Nao executar o gerador de conteudo de releases nem alterar dados reais de
desenvolvimento para simular estados.

## 11. Decisoes do usuario e proposta revisada

- D1 - O usuario autorizou criar imagens seguindo a referencia, em vez de
  fornecer exportacoes. Proposta tecnica: ilustracoes vetoriais originais em SVG,
  com paleta neon roxa, painel de comunidade e cena estilizada de computador.
  Nao sao renders fotograficos nem reproducoes exatas dos personagens.
- D2 - Aprovado pelo usuario: consultar a ultima release estavel na colecao
  local, sem nova API, e omitir o selo quando nao houver versao valida.
  A consulta deve considerar releases com tag e data valida, excluir
  prereleases e ordenar por data decrescente. Nao usar versao fixa inventada.
- D3 - O usuario pediu montar os itens do rodape e definir os destinos depois.
  Proposta acessivel: manter os rotulos previstos na composicao como texto
  nao interativo quando nao houver URL, com indicacao discreta "Em breve".
  Usar links funcionais onde o destino ja existe. Creditos refletem o projeto,
  sem copiar automaticamente "2024 Prosa Inc.".
- D4 - Aprovado pelo usuario: usar textos atuais. Adaptar notas de versao,
  downloads e documentacao a hierarquia do PNG. Nao anunciar jogos, criptografia,
  baixa latencia ou infraestrutura global como recursos confirmados.
- D5 - Proposta: manter a configuracao tipografica atual (Public Sans com
  fallback sans-serif), sem download de fonte. A disponibilidade da fonte nao
  e garantida; diferencas tipograficas devem constar na revisao visual.

As escolhas diretas do usuario e as propostas tecnicas de D1, D3 e D5 foram
aprovadas na revisao. Plano em `docs/specs/reconstrucao-home-figma-tasks.md`.
A aprovacao desta spec autoriza o planejamento, nao a execucao das tasks.

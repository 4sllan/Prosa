# Remover seletor de modo — iniciar direto em P2P na Home

- Status: aprovada
- Data: 2026-10-17

## 1. Objetivo e contexto

Hoje o primeiro boot do Prosa mostra `ModePicker.vue` ("Escolha o modo")
quando `localStorage.prosa_mode` está vazio, oferecendo `server`
(login/senha, backend atual) e `p2p` (experimental). O modo escolhido é
persistido em `prosa_mode` e `provider.js` o lê na importação do módulo.

Objetivo: remover a tela de escolha e o modo Servidor da UI. A instalação
passa a operar sempre em `p2p` e abre direto na Home — sem login, sem
seletor, sem depender de `prosa_mode`.

## 2. Escopo

### Dentro do escopo

- `web/src/services/provider.js`: fixar `MODE = 'p2p'`; remover o fallback
  `server` e o uso de `localStorage.prosa_mode` na seleção.
- `web/src/stores.js`: remover o gate `needsModePick`/`chosenMode()` do
  `bootstrap()`; o caminho P2P (identidade + `initP2PNode`) vira o único
  fluxo de boot.
- `web/src/App.vue`: remover o ramo `ModePicker` do template e o import.
- `web/src/components/ModePicker.vue`: remover o arquivo (sem chamadores).
- `README.md`: atualizar a seção "Modo P2P" — sem seletor, P2P é o modo
  único do app; ajustar o que afirmar que `server` é o padrão.

### Fora do escopo

- Backend `server/` inteiro: continua existindo no repositório, intacto.
- `web/src/services/providers/server.js`, `web/src/services/realtime.js`,
  `web/src/views/AuthView.vue` e a rota `/login`: permanecem no código,
  inativos — remoção física é limpeza futura, não necessária aqui.
- `web/src/api.js` (`getToken`/`setToken`/`api`): permanece; `stores.js`
  ainda importa `getToken`/`setToken` para as funções legadas
  `login`/`register`/`logout`, que ficam inertes.
- Nenhuma mudança em protocolo P2P, identidade, IPC/Electron ou testes de
  protocolo existentes.
- Migração/limpeza de dados: `prosa_mode` e `prosa_token` antigos em
  `localStorage` ficam órfãos e são ignorados — não há remoção de dados.

## 3. Requisitos

### Funcionais

- **RF-01** — O app nunca renderiza a tela "Escolha o modo". O componente
  `ModePicker` deixa de existir e nenhum estado o alcança.
- **RF-02** — O modo ativo é sempre `p2p`, independente do valor (ou
  ausência) de `localStorage.prosa_mode`. Uma instalação que antes tinha
  `prosa_mode=server` passa a operar em P2P.
- **RF-03** — Após o bootstrap, `store.user` é a identidade Ed25519 local
  e a guarda de rota leva o usuário direto à Home (`/`), sem passar por
  `/login`.
- **RF-04** — O bootstrap em P2P continua populando comunidades, DMs,
  relacionamentos e presenças como hoje (`loadCommunities`, `loadDms`,
  `loadRelationships`, `loadPresences`).

### Não funcionais

- **RNF-01** — Menor mudança suficiente: não remover arquivos fora do
  escopo nem reestruturar a Service Layer.
- **RNF-02** — `chosenMode`/`setMode`/`needsModePick` deixam de ser
  necessários; remover ou enxugar sem quebrar imports existentes
  (`services/index.js` reexporta símbolos de `provider.js`).
- **RNF-03** — Preservar a fronteira main/renderer do Electron: identidade
  e store P2P seguem via IPC como hoje — esta mudança não toca IPC.

## 4. Modos suportados e UI/UX

- Modo efetivo após a mudança: somente `p2p`.
- `server` deixa de ser selecionável pela UI; o código permanece para
  reativação futura.
- Boot: `Carregando Prosa…` → Home. Falha no bootstrap P2P continua
  caindo na tela de erro existente com "Tentar novamente".
- A rota `/login` permanece registrada; em P2P `store.user` sempre existe
  após boot bem-sucedido, então a guarda redireciona `/login` → `/`.

## 5. Contratos afetados

- `provider.js`: `MODE` passa de derivado de `localStorage` para constante
  `'p2p'`. `getProvider()` sempre instancia `createP2PProvider()`.
  - Decisão: remover `chosenMode`/`setMode` e seus reexports em
    `services/index.js` — o único consumidor era o próprio bootstrap.
    `server` sai de `factories` (o import de `createServerProvider` pode
    ser removido junto, já que fica inalcançável).
- `stores.js`: `store.needsModePick` e `store.mode` perdem função; remover
  ambos do estado e o gate no `bootstrap()`. As funções
  `login`/`register`/`logout` permanecem exportadas (usadas por
  `AuthView`/`UserSettings`), mas `auth.login`/`auth.register` do provider
  P2P lançam erro tipado — comportamento já existente.
- Não se aplica: API HTTP, WS, IPC, envelope P2P — nenhum payload muda.

## 6. Estado e persistência

- `localStorage.prosa_mode`: deixa de ser lido/gravado. Valor antigo é
  ignorado (não removido — inócuo).
- `localStorage.prosa_token`: órfão; ignorado em P2P.
- Store local P2P (`userData/p2p/` no Electron, `localStorage` no dev web):
  inalterado; dados e espaços existentes são restaurados por `initP2PNode`.

## 7. Segurança e privacidade

- Não se aplica a novas superfícies: nenhum endpoint, IPC ou permissão
  novo. A chave privada Ed25519 permanece confinada ao main (Electron) ou
  ao WebCrypto (dev), como hoje.

## 8. Falhas e recuperação

- Bootstrap P2P com erro (identidade, store local) → tela de erro com
  retry, fluxo já existente — preservar.
- Sem peers online → Home abre normalmente; entrega depende de peer
  online, comportamento P2P já documentado.

## 9. Critérios de aceite

- **CA-01** (RF-01, RF-03): em instalação limpa (sem `prosa_mode`), o app
  abre na Home após `Carregando…`, sem mostrar seletor nem `/login`.
- **CA-02** (RF-02): com `prosa_mode=server` pré-existente, o app ainda
  abre em P2P na Home — o valor antigo não tem efeito.
- **CA-03** (RF-01): nenhuma referência a `ModePicker`, `needsModePick` ou
  `chosenMode` permanece no código ativo.
- **CA-04** (RF-04): Home P2P lista espaços/DMs/contatos restaurados do
  store local (regressão coberta pelos testes existentes).

## 10. Estratégia de testes

- `npm --prefix web test` — suite P2P deve permanecer verde (nenhum
  protocolo muda).
- `npm run build` — garante que imports removidos não deixaram referências.
- `git diff --check` — whitespace.
- Manual (Electron ou Vite dev): deletar `prosa_mode` do localStorage e
  confirmar boot direto na Home; repetir com `prosa_mode=server` e
  confirmar mesmo resultado.

## 11. Riscos e decisões em aberto

- Risco baixo: `services/index.js` exporta `MODE`, `chosenMode`, `setMode`;
  remover os dois últimos exige conferir que nenhum outro import os usa
  (análise indicou que só `stores.js`/`ModePicker` usavam).
- Decisão registrada: código server/AuthView permanece inerte — remoção
  completa seria spec separada se desejado.

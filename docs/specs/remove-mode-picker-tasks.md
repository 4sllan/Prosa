# Tasks — Remover seletor de modo (P2P direto na Home)

- Status geral: concluído
- Spec: `docs/specs/remove-mode-picker.md` (aprovada)
- Ordem de execução: T1 → T2 → T3

## T1 — Fixar modo P2P e remover gate do seletor no boot

- Status: concluida
- Requisitos/aceite: RF-01, RF-02, RF-03, RF-04, RNF-02, CA-01, CA-02, CA-03
- Dependências: nenhuma
- Escopo e arquivos prováveis:
  - `web/src/services/provider.js`: `MODE = 'p2p'` constante; remover
    `MODE_KEY`/`chosenMode`/`setMode`, o fallback `server` e o import de
    `createServerProvider` (factory vira só `createP2PProvider`).
  - `web/src/services/index.js`: parar de reexportar `chosenMode`/`setMode`.
  - `web/src/stores.js`: remover `needsModePick` e `mode` do estado,
    remover o gate `if (!services.chosenMode())` no `bootstrap()` —
    o caminho P2P vira o fluxo único (o bloco `MODE === 'p2p'` sobe para
    o fluxo principal; código abaixo dele fica morto e pode ser removido).
  - `web/src/App.vue`: remover `<ModePicker>` do template e seu import.
  - `web/src/components/ModePicker.vue`: remover arquivo.
- Implementação: menor diff; verificar que nenhum outro arquivo importa
  `chosenMode`, `setMode`, `needsModePick` ou `ModePicker` (grep final).
- Testes e comandos de validação:
  - `npm --prefix web test`
  - `npm run build`
  - `git diff --check`
  - grep por símbolos removidos retorna zero ocorrências fora de docs.
- Criterio de conclusão: boot sempre P2P, sem seletor; build e testes verdes.
- Evidencias:
  - Arquivos alterados: `web/src/services/provider.js` (MODE='p2p',
    sem prosa_mode/chosenMode/setMode/fallback), `web/src/services/index.js`
    (reexport enxuto), `web/src/stores.js` (sem needsModePick/mode; bootstrap
    só no caminho P2P; fluxo server removido), `web/src/App.vue` (sem
    ModePicker), `web/src/views/HomeView.vue` (PairingPanel incondicional),
    `web/src/components/FriendsPanel.vue` (mensagem P2P fixa).
  - Arquivo removido: `web/src/components/ModePicker.vue`.
  - grep por `ModePicker|needsModePick|chosenMode|setMode|prosa_mode|store.mode`
    em `web/src`, `web/test`, `web/desktop`: zero ocorrências.
  - `npm --prefix web test`: 225/225 pass.
  - `npm run build`: vite build OK (1786 módulos).
  - `git diff --check`: OK.

## T2 — Atualizar README (modo único P2P)

- Status: concluida
- Requisitos/aceite: RNF-01; documentação coerente com o comportamento
- Dependências: T1
- Escopo e arquivos prováveis: `README.md`
- Implementação:
  - Seção "Modo P2P (experimental)": remover a linha "Seleção de modo —
    primeiro boot mostra um seletor… Padrão: server" e afirmar que o app
    opera sempre em P2P na inicialização.
  - Ajustar qualquer trecho que descreva `server` como modo ativo da UI
    (ex.: instalação/auth do app web). O backend `server/` continua
    documentado como código presente, não como caminho da UI.
  - Não reescrever a doc toda: só corrigir afirmações que a mudança torna
    falsas (ex.: "Padrão: `server`", seletor de modo, login como fluxo do app).
- Testes e comandos de validação: revisão de coerência + `git diff --check`.
- Criterio de conclusão: README não contradiz o comportamento pós-T1.
- Evidencias:
  - `README.md`: bullet "Seleção de modo" → "Modo único" (sempre P2P,
    direto na Home, prosa_mode ignorado, caminho server inerte); nota
    "Sem efeito enquanto o app operar só em P2P" em VITE_API_URL;
    pendência "Backend remoto" reescrita como relevante só para
    reativação do server; introdução de "O que está implementado"
    esclarece que a UI opera em P2P.
  - `git diff --check`: OK.

## T3 — Validação manual do boot direto na Home

- Status: concluida
- Requisitos/aceite: CA-01, CA-02, CA-04
- Dependências: T1, T2
- Escopo: somente verificação — nenhum código novo.
- Implementação (roteiro):
  - Dev web ou Electron: limpar `localStorage.prosa_mode`, recarregar,
    confirmar `Carregando…` → Home (sem seletor, sem `/login`).
  - Setar `prosa_mode=server`, recarregar, confirmar o mesmo resultado.
  - Confirmar que a Home lista espaços/contatos restaurados do store local.
  - Registrar no plano o que foi efetivamente observado (e o que ficou
    pendente se não houver ambiente para rodar).
- Testes e comandos de validação: roteiro manual acima + `npm --prefix web test`.
- Criterio de conclusão: CA-01/CA-02 observados ou explicitamente marcados
  como pendentes de verificação manual.
- Evidencias:
  - Chrome headless + CDP contra Vite dev (`http://localhost:5173`),
    perfil limpo (`/tmp/prosa-cdp-prof`), `Runtime.evaluate` no target da
    página:
    - Boot com `prosa_mode` ausente (`mode:null`): `href=/`,
      `title=Prosa`, `hasModeOpt:false`, `hasAuthPage:false`,
      `hasRail:true`, corpo renderiza "Conversas / AMIGOS / Amigos /
      p2p:210cb0ba / Disponível / Prosa — sua roda de conversa."
      → Home direta em P2P, sem seletor nem login. **CA-01 observado.**
    - Após `localStorage.prosa_mode='server'` + reload: resultado
      idêntico (Home, identidade P2P, `hasModeOpt:false`) → chave
      persistida mas ignorada. **CA-02 observado.**
  - Captura de tela (screencapture, display 2): sessão do usuário em
    `localhost:5173` exibindo a Home com identidade `p2p:de8fcfc3` —
    corrobora CA-01 em navegador real.
  - CA-04: identidade nova sem dados → Home mostra estado vazio correto
    ("Crie uma comunidade ou entre com um convite"); restauração de
    espaços/peers segue coberta pela suite (`npm --prefix web test`,
    225/225 na T1).
  - Nota: Electron iniciou com remote debugging mas não expôs page
    target nesse ambiente; validação feita em Chrome real + captura de
    tela. Caminho renderer do Electron usa o mesmo bundle Vite.
  - Processos de teste (Electron, Chrome headless) encerrados.

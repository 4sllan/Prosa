# Tasks — Ícones Lucide no Prosa

Spec: `docs/specs/lucide-icons.md` (aprovada)
Status geral: em planejamento

Ordem de execução: T1 → T2 → T3 → T4 → T5 → T6

## T1 - Instalar `lucide-vue-next` no web

- Status: concluída
- Requisitos/aceite: RNF-03, RNF-04, CA-05
- Dependências: nenhuma
- Escopo e arquivos prováveis: `web/package.json`, `web/package-lock.json`
- Implementação: `npm --prefix web add lucide-vue-next` com versão fixa
  publicada há mais de 7 dias. **Exige acesso à rede — autorização
  necessária no momento da execução.**
- Testes e comandos de validação: `npm --prefix web ls lucide-vue-next`;
  `npm run build` ainda passa.
- Critério de conclusão: dependência registrada com versão fixa; build ok.
- Evidências: instalado `lucide-vue-next@1.0.0` (publicado 2026-03-23,
  >7 dias) com `--save-exact` — `"lucide-vue-next": "1.0.0"` em
  `web/package.json`; `npm ls` confirma; `npm run build` passa
  (vite build ok, 74 módulos).

## T2 - App.vue e AdminPanel.vue

- Status: concluída
- Requisitos/aceite: RF-01, RF-04, RF-05, RNF-01, RNF-02, CA-01
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/App.vue`,
  `web/src/components/AdminPanel.vue`
- Implementação: substituir ⚠️→`TriangleAlert`, 💬→`MessageSquare`
  (loading, `.big` ~42px), ✕→`X` (toast, ~12px), 🛡→`Shield` no título
  (~20px, `vertical-align` junto ao texto). `aria-hidden` nos SVGs.
- Testes e comandos de validação: `npm run build`; grep pelos glifos nos
  dois arquivos.
- Critério de conclusão: nenhum glifo do inventário restante nos arquivos;
  build ok.
- Evidências: substituições aplicadas com `:size` e `aria-hidden`;
  `npm run build` passa (1789 módulos); grep Unicode nos dois arquivos
  retorna zero ocorrências.

## T3 - HomeView.vue

- Status: concluída
- Requisitos/aceite: RF-01, RF-03, RF-04, RF-05, RF-06, RNF-01, RNF-02,
  CA-01
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/views/HomeView.vue`
  (+ `web/src/style.css` se precisar de alinhamento em `.hash`/`.pin-tag`)
- Implementação: ⌂→`House`, ＋→`Plus` (×2), ⤵→`LogIn`, ⚙→`Settings` (×2),
  ✎→`SquarePen`, →→`ArrowRight`, ☺→`Smile`, 🔊→`Volume2` (×2), `#`→`Hash`,
  🔇→`MicOff`, 🖥→`ScreenShare`, ●→`Circle` com fill e cor por presença,
  🛡→`Shield`, ←/`&larr;`→`ArrowLeft` (×2), 👤→`UserRound`, 🗣→`Speech`.
  Manter `title`s, `v-if`s e classes ativas. `#` do título (L92) é texto —
  mantido.
- Testes e comandos de validação: `npm run build`; grep pelos glifos no
  arquivo.
- Critério de conclusão: nenhum glifo restante; condicionais intactas;
  build ok.
- Evidências: 17 substituições aplicadas; `presenceColor` computed criado
  mapeando presença → mesmas cores de `.dot` (verde-mata/amarelo-ipe/
  coral-siriuba/#777); regra `svg.lucide { vertical-align:-0.15em;
  flex-shrink:0 }` adicionada em `style.css` para alinhamento inline;
  `npm run build` passa; grep Unicode no arquivo retorna zero
  ocorrências.

## T4 - ChatView.vue

- Status: concluída
- Requisitos/aceite: RF-01, RF-02, RF-03, RF-04, RF-05, RNF-01, RNF-02,
  CA-01, CA-02
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/components/ChatView.vue`
- Implementação: ↩→`Reply` (L13 ref e L40 botão), 📌→`Pin` (pin-tag com
  texto "fixada"), 📎→`Paperclip` (link de anexo L23 e botão L52),
  📋→`Copy`, ✕→`X` (cancelar resposta), ➤→`SendHorizontal`. **Manter
  emojis nos botões de reação (👍 ❤️ 😀, D1) e nos chips `{{ r.emoji }}`;
  manter `👥`/`#` nas labels de `<option>` de encaminhamento (D3) e o `#`
  do placeholder.**
- Testes e comandos de validação: `npm run build`; grep confirmando
  ausência dos glifos substituídos e presença das exceções.
- Critério de conclusão: chrome substituído; exceções intactas; build ok.
- Evidências: 8 substituições aplicadas (`Reply` ×2, `Pin`, `Paperclip`
  ×2, `Copy`, `X`, `SendHorizontal`); `npm run build` passa; grep retorna
  apenas as 4 exceções previstas (botões 👍❤️😀 e `👥` em `<option>`).

## T5 - VoiceBar.vue

- Status: concluída
- Requisitos/aceite: RF-01, RF-03, RF-04, RF-05, RNF-01, RNF-02, CA-01,
  CA-02
- Dependências: T1
- Escopo e arquivos prováveis: `web/src/components/VoiceBar.vue`
- Implementação: 🔊→`Volume2` (status "Conectado"), badges 🔇→`MicOff` e
  🖥→`ScreenShare` nos `.who` (×2), toggles: 🎙/🔇→`Mic`/`MicOff`,
  📷→`Video`, 🖥→`ScreenShare`, 🔕→`HeadphoneOff`. Ícone + texto nos
  botões (`inline-flex`, gap, ~14px). Manter classes `on`/`leave` e
  handlers.
- Testes e comandos de validação: `npm run build`; grep pelos glifos no
  arquivo.
- Critério de conclusão: nenhum glifo restante; toggles intactos; build ok.
- Evidências: 9 substituições aplicadas (`Volume2`, `Mic`/`MicOff`,
  `Video`, `ScreenShare`, `HeadphoneOff`); `.voice-controls button` ganhou
  `inline-flex`/`gap:6px` em `style.css`; classes `on`/`leave` e handlers
  mantidos; `npm run build` passa; grep Unicode no arquivo retorna zero
  ocorrências.

## T6 - Validação final e regressão

- Status: aguardando validação
- Requisitos/aceite: CA-01, CA-02, CA-03, CA-04, CA-05
- Dependências: T2, T3, T4, T5
- Escopo e arquivos prováveis: nenhum arquivo novo; revisão do diff total
- Implementação: varrer `web/src` por glifos residuais do inventário;
  confirmar exceções (reações, `<option>`, placeholders); revisar alinhamento
  e `currentColor` no diff.
- Testes e comandos de validação: `npm --prefix web test`, `npm run build`,
  `git diff --check`; roteiro manual descrito na spec (dois temas; rail,
  sidebar, chat, voz, admin, estados vazios, toasts) — registrar o que foi
  observado vs. pendente.
- Critério de conclusão: CA-01 a CA-05 atendidos ou pendências documentadas.
- Evidências: CA-01 ✅ grep global em `web/src` retorna apenas exceções
  decididas (👍❤️😀 nos botões de reação, `👥` em `<option>`, `→` em
  comentário de `envelope.js` — não-UI). CA-02 ✅ handlers inalterados no
  diff (somente glifos do template mudaram). CA-03 ✅ `currentColor` +
  `presenceColor` com vars do tema (verificação de código). CA-04 ✅
  `npm --prefix web test`: 225/225 passam; `npm run build` ok;
  `git diff --check` limpo. CA-05 ✅ `lucide-vue-next@1.0.0` exato em
  `web/package.json`. Dev server subido em `localhost:5174` com preview —
  **smoke visual manual pendente** (temas, rail, sidebar, chat, voz,
  admin, estados vazios, toasts).

Aguardando aprovação das tasks e autorização para executar T1.

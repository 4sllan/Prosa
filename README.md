# Prosa

Plataforma própria de comunicação e comunidades (inspirada funcionalmente no Discord) — **100% independente**: API, banco, realtime e voz/vídeo próprios. Nenhuma dependência do Discord.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 24 + Express + `ws` |
| Banco | `node:sqlite` (SQLite, WAL) — sem servidor de banco |
| Realtime | WebSocket (`/ws`) — mensagens, presença, typing, sinalização |
| Voz/Vídeo | WebRTC mesh real (P2P) + sinalização via WS |
| Frontend | Vue 3 + Vite + vue-router |
| Auth | Sessão em cookie httpOnly + Bearer token, bcrypt |

## Instalação

```bash
cd prosa
npm --prefix server install
npm --prefix web install
npm run build        # gera web/dist
cp .env.example .env # opcional
npm start            # http://localhost:4000
```

Dev com hot-reload do front:
```bash
npm run dev          # API em :4000
npm run dev:web      # Vite em :5173 (proxy para a API)
```

## Testes

```bash
npm test             # 12 testes: auth, permissões, mensagens, convites, DM, WS, busca
```

## O que está implementado

- **Contas:** registro, login, logout, recuperação de senha (token; SMTP opcional), perfil (avatar, bio, status), troca de senha
- **Presença:** online/ausente/ocupado/invisível em tempo real
- **Comunidades:** criar/editar/excluir, convites (uso/expiração), entrar/sair, cargos (owner/admin/moderator/member), permissões **verificadas no servidor**, kick/ban/unban, categorias e canais (texto/voz), audit log
- **Mensagens:** tempo real via WS, persistência, edição, exclusão, respostas, reações, pins, anexos (upload autenticado, tipos permitidos, 25 MB), menções com notificação, typing, histórico paginado, modo lento
- **DMs:** 1:1 e grupos; bloqueio impede DM
- **Voz/vídeo:** canais de voz com WebRTC mesh — microfone, câmera, compartilhamento de tela, ensurdecer, estado de participantes em tempo real
- **Busca:** mensagens (escopo global ou por canal), usuários, comunidades
- **Admin:** usuários, suspensão, denúncias, estatísticas
- **Segurança:** bcrypt, sessões revogáveis, rate limit em auth e envio de mensagens, validação de upload, headers de segurança, verificação de autorização em toda rota sensível

## Voz/vídeo — infraestrutura

- **Mesh P2P:** cada par de participantes abre um `RTCPeerConnection`; sinalização relayed pelo WS (`SIGNAL`). Real, sem simulação.
- **STUN:** configurado via `ICE_SERVERS_JSON` (padrão: stun.l.google.com).
- **TURN:** necessário em produção para NATs simétricos/firewalls corporativos. Recomendado: [coturn](https://github.com/coturn/coturn) próprio. Configure em `.env`.
- **Limite prático do mesh:** confortável até ~6–8 participantes por sala; acima disso, avaliar SFU (ex.: LiveKit, mediasoup) — a camada de sinalização já está isolada em `server/src/realtime.js`.

## Deploy

1. Build do front (`npm run build`) e `NODE_ENV=production`.
2. Suba `node server/src/index.js` atrás de um reverse proxy com TLS (Caddy/Nginx) — WS funciona no mesmo host/porta.
3. Configure `ICE_SERVERS_JSON` com seu TURN.
4. `DATA_DIR` persistente (volume/disco) — contém SQLite + uploads.
5. Configure SMTP_* para e-mails de recuperação de senha reais.

## Estrutura

```
server/src/
  index.js        express + http + ws wiring
  config.js       env
  db.js           schema SQLite + migração
  auth.js         sessões, registro, login, reset
  permissions.js  cargos/permissões verificadas no servidor
  realtime.js     hub WS, presença, voz, sinalização WebRTC
  routes/         users, communities, messages, dms, misc, admin
web/src/
  views/          AuthView, HomeView (shell do app)
  components/     ChatView, VoiceBar, FriendsPanel, AdminPanel, Settings
  rtc.js          motor WebRTC mesh
  stores.js       estado + cliente WS
```

## Limitações conhecidas

- Voz/vídeo em mesh (não SFU) — ver acima.
- Reset de senha por email requer SMTP configurado; sem ele, token só no log do servidor (dev).
- Push notifications dependem da aba aberta (Notification API); push nativo (Web Push/APNs) não implementado.
- Migrações: schema idempotente na inicialização; evolução futura via tabela `migrations`.

## App desktop (Electron)

O frontend Vue é empacotado em um app desktop próprio — sem dependência do Discord.

**Desenvolvimento**
```bash
cd web
npm run dev                                    # Vite em :5173 (1º terminal)
npm run desktop:dev                            # Electron apontando ao Vite (2º terminal)
npm run electron:dev                           # Electron carregando dist/ já buildado
```

**Distribuição (.dmg)**
```bash
cd web
VITE_API_URL=http://localhost:4000 npm run dist:universal   # ou dist:arm64 / dist:x64
# assinar ad-hoc (necessário no arm64 sem Developer ID):
codesign --deep --force --sign - --entitlements build/entitlements.plist \
  ../release/mac-universal/Prosa.app
# regerar o dmg a partir do app assinado:
npx electron-builder --prepackaged ../release/mac-universal/Prosa.app --mac dmg
```

Artefato: `release/Prosa-<versão>-universal.dmg` — abrir e arrastar o Prosa para Aplicativos.

**Windows (.exe)**
```bash
cd web
VITE_API_URL=http://localhost:4000 npm run dist:win:x64     # instalador NSIS x64
VITE_API_URL=http://localhost:4000 npm run dist:win:arm64   # instalador NSIS arm64 (Windows on ARM)
```
Artefatos: `release/Prosa-<versão>-x64-Setup.exe` e `Prosa-<versão>-arm64-Setup.exe` — instalador NSIS com escolha de pasta e atalho no Menu Iniciar. Build cruzado funciona no macOS (electron-builder embute o Wine para editar metadados do exe).

**Linux (.deb)**
```bash
cd web
VITE_API_URL=http://localhost:4000 npm run dist:linux:x64    # .deb amd64
VITE_API_URL=http://localhost:4000 npm run dist:linux:arm64  # .deb arm64
```
Artefatos: `release/Prosa-<versão>-amd64.deb` e `Prosa-<versão>-arm64.deb`. Instalação: `sudo dpkg -i Prosa-*.deb` (ou `sudo apt install ./Prosa-*.deb` para resolver as dependências gtk3/nss3 automaticamente). Cria entrada no menu de aplicativos.

**Configuração**
- `VITE_API_URL` (build) ou `PROSA_API_URL` (runtime) define o backend; padrão do build atual: `http://localhost:4000`.
- `PROSA_DEV_URL` aponta o Electron ao servidor Vite em dev.
- Segurança: `contextIsolation: true`, `nodeIntegration: false`, sandbox ativo; renderer acessa apenas `window.prosaDesktop` (preload + IPC `app:info`).
- Ícone: `web/build/icon.icns` (logo da identidade Prosa).

**Pendências para distribuição pública**
- Assinatura Developer ID + notarização Apple (o build atual é ad-hoc: em outra máquina, `xattr -cr /Applications/Prosa.app` se o Gatekeeper reclamar).
- Windows: os `.exe` não são assinados — o SmartScreen exibirá aviso ("Mais informações → Executar assim mesmo"). Para suprimir: certificado de code-signing (EV ou OV com reputação).
- Backend remoto público para que o app funcione fora da máquina de dev.

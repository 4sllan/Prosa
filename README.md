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
npm test             # 13 testes: auth, permissões, mensagens, convites, DM, WS, busca
```

## O que está implementado

Capacidades do backend `server/` + frontend. A UI hoje opera exclusivamente em P2P (ver seção abaixo); o caminho de login/servidor permanece no código, inerte.

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

`mac.identity: null` desativa a assinatura automática do electron-builder.
O arquivo `build/entitlements.plist` é configurado para o app e seus helpers
e inclui entrada de áudio. No fluxo ad-hoc acima, a etapa manual de assinatura
continua necessária. Confira o pacote assinado antes de distribuí-lo:

```bash
codesign --verify --deep --strict --verbose=2 ../release/mac-universal/Prosa.app
codesign -d --entitlements :- ../release/mac-universal/Prosa.app
plutil -extract NSMicrophoneUsageDescription raw \
  ../release/mac-universal/Prosa.app/Contents/Info.plist
```

Confira também `com.apple.security.device.audio-input` nos executáveis
`Prosa Helper*.app` em `Contents/Frameworks`, não apenas no app principal.
O build do Vite sozinho não gera nem valida um aplicativo macOS assinado.

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
- `VITE_API_URL` (build) ou `PROSA_API_URL` (runtime) define o backend; padrão do build atual: `http://localhost:4000`. Sem efeito enquanto o app operar só em P2P.
- `PROSA_DEV_URL` aponta o Electron ao servidor Vite em dev.
- Segurança: `contextIsolation: true`, `nodeIntegration: false`, sandbox ativo; renderer acessa apenas `window.prosaDesktop` (preload + IPC `app:info`).
- Ícone: `web/build/icon.icns` (logo da identidade Prosa).

**Microfone e permissões**
- No macOS empacotado, o Prosa consulta a autorização do sistema ao entrar em voz. Na primeira solicitação, aguarda a escolha antes de iniciar a captura; clicar em **Permitir** deve continuar a mesma tentativa.
- A interface distingue autorização pendente, inicialização, negativa, dispositivo ausente e falha de captura. Consentimento concedido não garante que o dispositivo esteja disponível.
- **Cancelar entrada** cancela a tentativa local, mas não fecha um prompt do sistema já aberto. Se a captura terminar depois do cancelamento, suas faixas são encerradas sem entrar no canal.
- Após falha, use **Tentar novamente**. Se o acesso foi negado/restrito no macOS, confira **Ajustes do Sistema > Privacidade e Segurança > Microfone**; uma política do sistema pode impedir alterações. Após alterar uma negativa anterior, pode ser necessário encerrar e reabrir o Prosa.
- Se a captura for interrompida durante a chamada, o microfone fica indisponível: saia da chamada e entre novamente. Silenciar o microfone não equivale a revogar a permissão.
- No navegador, as permissões continuam sob controle do navegador; use HTTPS ou localhost. Electron dev e app empacotado podem ter identidades/permissões diferentes no macOS: valide no pacote que será usado, sem resetar permissões ou apagar perfis para testar.
- Testes simulados e build web não comprovam consentimento nativo, captura física ou transmissão para outro participante.

**Pendências para distribuição pública**
- Assinatura Developer ID + notarização Apple (o build atual é ad-hoc: em outra máquina, `xattr -cr /Applications/Prosa.app` se o Gatekeeper reclamar).
- Windows: os `.exe` não são assinados — o SmartScreen exibirá aviso ("Mais informações → Executar assim mesmo"). Para suprimir: certificado de code-signing (EV ou OV com reputação).
- Backend remoto público — só relevante se o modo `server` for reativado; em P2P o app não depende de backend.

## Modo P2P (experimental)

Arquitetura e plano completos: `docs/specs/p2p-architecture.md` e `docs/specs/p2p-architecture-tasks.md`.

- **Modo único** — o app inicia sempre em P2P, direto na Home; não há seletor de modo nem login. `localStorage.prosa_mode` deixou de ser lido (valor antigo é ignorado). O caminho `server` (`AuthView`, `providers/server.js`, `realtime.js`, backend `server/`) permanece no código, inerte, para reativação futura.
- **Identidade** — Ed25519 por instalação. No Electron a chave privada fica no processo main (`web/desktop/identity.cjs`, arquivo `identity.key` em `userData/p2p/` com modo `0600`); o renderer só recebe pubkey/assinaturas via IPC (`p2p:pubkey`, `p2p:sign`, `p2p:fingerprint`). No navegador em dev, cai para WebCrypto + `localStorage` (marcado `devOnly` — não é armazenamento de produção).
- **Persistência local** — `web/desktop/store.cjs` com backend `node:sqlite` → `sql.js` → journal JSON, acessado pelo renderer via IPC tipada `p2p:store` (ops nomeadas, nunca SQL arbitrário). Tabelas: `events`, `projections`, `contacts`, `files`, `kv`.
- **Eventos assinados** — envelope `{v,id,spaceId,author,seq,type,ts,body,sig}` com `id = spaceId:author:seq` e assinatura Ed25519 sobre JSON canônico. Seq monotônica por autor/espaço dá dedupe e ordenação; regras LWW/permissões em `p2p/converge.js` (só o autor edita; só admin remove membro/canal).
- **Pareamento guiado** — no painel "Rede P2P" (visão Amigos), um lado usa **Criar convite** → **Copiar convite**; o outro cola em "Cole o link recebido" e escolhe **Continuar**, depois usa **Copiar resposta**; o criador cola a resposta e escolhe **Continuar**. Os links continuam `prosa://pair/<payload>` (`offer`/`answer`), com validação antes de operar no WebRTC, tolerância a espaços/quebras de linha e alternativa "Ver link" para copia manual. "Peer conectado" indica só rede: após o handshake, o criador do convite envia a solicitação; ele aparece em "Enviadas" e o amigo em "Recebidas". Aceitar a amizade move ambos para "Amigos", sem confundir isso com aceitar o pareamento.
- **Chave e detalhes** — "Detalhes da conexão" recolhe chave pública completa, fingerprint, peers conhecidos e adição manual por chave. **Copiar chave** copia a chave integral com confirmação/erro e não exige leitura do clipboard.
- **Cancelamento** — cada item em "Enviadas" permite **Cancelar convite**, sem desconectar o peer nem revogar um link SDP já copiado. No P2P, o tombstone local é persistido e `contact_remove` é enviado pela fila de controle existente.
- **Transporte** — `p2p/transport.js`: fan-out por espaço, dedupe por event-id, ACKs com `waitAcks`, fila offline reenviada ao reconectar. Canais: controle efêmero (`presence`, `typing`, `voice_state`, `signal`) e eventos assinados persistidos. A fila de controle é em memória: após reiniciar o app ainda offline, um cancelamento removido localmente pode deixar a pendência antiga no outro lado; a UI não afirma entrega remota confirmada nesse caso.
- **Sync** — ao conectar, cada lado troca `maxSeq` por autor/espaço (`sync_req`/`sync_event`/`sync_done`); eventos faltantes são revalidados (assinatura + seq) antes de entrar no log.
- **Espaços** — DM 1:1 (`dm:`), grupo e comunidade (`cm:`) com `space.genesis` assinado; convite = genesis codificado em base64 (`communities.createInvite`/`acceptInvite`).
- **Voz/vídeo/tela** — mesmo mesh WebRTC; `voice_state`/`signal` trafegam no canal de controle P2P e o provider sintetiza `VOICE_STATE` para o `rtc.js` existente.
- **Busca** — `misc.search` itera as projeções locais; admin global e busca central lançam erro tipado (sem backend).
- **Config ICE** — precedência: `localStorage.prosa_ice` > `VITE_ICE_SERVERS_JSON` (build) > default `stun:stun.l.google.com:19302`. Formato: array JSON de `RTCIceServer` (aceita `turn:` com `username`/`credential`). Exemplo e instruções em `.env.example`. TURN é opcional — só necessário onde conexão direta é inviável (NAT simétrico/CGNAT/UDP bloqueado).
- **Diagnóstico** — telemetria de pareamento via `localStorage.prosa_debug = '1'` (ou build dev): logs `[p2p:diag]` com tipos de candidato ICE (sem IPs), estados de conexão, `hello` e keepalive.
- **Conexão** — `hello` assinado (Ed25519, prova de posse), fingerprint conferível no painel, keepalive `ping`/`pong` a cada 25 s mantendo NAT mapping, `restartIce` automático em queda transitória e lista de peers conhecidos persistida para re-pareamento.
- **Testes** — `cd web && npm test` (envelope, dedupe/fan-out/ack, eventlog/LWW, spaces, sync, pareamento/keepalive, hub Supabase).

### Hub Supabase (rendezvous + histórico)

O Supabase hospedado é uma **camada auxiliar** do P2P — não transporta mensagens entre usuários (isso continua no `RTCDataChannel`). Ele fornece:

- **Presença** — cada nó publica `track` em `prosa:presence:<pubkey>` e assina o canal dos contatos (`supabase/presence.js`).
- **Sinalização WebRTC** — `prosa:user:<pubkey>` carrega `signal` (SDP + ICE trickle) e `notify` (convites/relacionamento). Pareamento automático: contato online + sem DataChannel → o lado de **menor pubkey** oferece (`p2p/pairing-hub.js`, perfect negotiation para renegociação/`restartIce`). O link manual `prosa://pair/` segue intacto como fallback.
- **Espelho no Postgres** — profiles, relationships, invites, conversations, conversation_members e messages espelham os eventos P2P já aplicados (idempotente por `event_id`; remetente **e** receptores gravam). `messages.list` mescla o histórico do Postgres com o log local.
- **Inbox de convites** — no boot, convites `pending` endereçados à minha pubkey são recuperados do Postgres (quem me convidou offline vira "Recebidas").

**Sem hub, nada quebra** — sem `VITE_SUPABASE_URL`/key o nó roda 100% P2P manual, e qualquer falha do hub é absorvida em best-effort.

**Setup (dev):**
```bash
# 1. crie um projeto free em supabase.com e habilite Realtime
#    (Settings → Realtime)
# 2. .env (já gitignored):
#    VITE_SUPABASE_URL=https://<ref>.supabase.co
#    VITE_SUPABASE_ANON_KEY=<publishable key — Settings → API Keys>
#    SUPABASE_DB_URL=postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres
# 3. aplique o schema:
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_initial_schema.sql
```

**Teste entre dois clientes:** abra duas instâncias do app (ou Vite + Electron) com a mesma config → contatos se veem online via presença, pareiam sem link, trocam mensagens pelo DataChannel e o histórico aparece em `GET /rest/v1/messages?conversation_id=eq.<spaceId>`.

**Segurança — importante:** RLS está **permissivo para `anon`** (dev-only, ver `supabase/migrations/0001_initial_schema.sql`); qualquer portador da publishable key lê/escreve tudo, e mensagens espelhadas ficam em claro no Postgres. Use um projeto **exclusivamente de dev/descartável, só com dados de teste**. `SUPABASE_DB_URL`/`SUPABASE_SECRET_KEY` são privilegiadas — nunca em `VITE_*` nem no app. Detalhes e decisões: `docs/specs/supabase-local-backend.md`.

Limitações do experimental: sem relay/mailbox de **mensagens** para peers offline (convites são recuperados do Postgres no boot; mensagens exigem ambos online), convites de comunidade via link compartilhado manualmente, fila de controle offline não persistente após reinício e sem TURN embutido (configure o seu via `prosa_ice`/`VITE_ICE_SERVERS_JSON`).

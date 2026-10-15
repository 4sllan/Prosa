# Relatório de diagnóstico — conectividade P2P direta

**Spec:** `docs/specs/investigate-pure-p2p-connectivity.md`
**Tasks:** `docs/specs/investigate-pure-p2p-connectivity-tasks.md`
**Status:** concluído — cenários de campo (LAN com 2ª máquina, redes distintas, CGNAT, queda) pendentes de execução pelo usuário via roteiro T9

---

## T1 — Mapa do fluxo de conexão

### Cadeia completa (com referências)

```
LADO A (quem gera o convite)                    LADO B (quem aceita)
─────────────────────────                     ─────────────────────
PairingPanel.vue:88-97  makeOffer()
  └─> pairing.js:28-38  createPairingOffer()
        pc = RTCPeerConnection({iceServers})   ← localconfig.js:4,6-13
        dc = pc.createDataChannel('prosa')
        setLocalDescription(offer)
        waitIce(pc, 8000)                      ← pairing.js:70-78 (parcial!)
        link = 'prosa://pair/' + b64({t:'offer', sdp, v:1})
  └─> PairingPanel.vue:94  wirePeer(pc, dc)    ← handlers hello

        ───────── link copiado manualmente ─────────>

                                                PairingPanel.vue:99-108 answerOffer()
                                                  └─> pairing.js:41-56 acceptPairingOffer(link)
                                                        decodePairPayload        ← pairing.js:16-25
                                                        pc = RTCPeerConnection({iceServers})
                                                        dcPromise = ondatachannel ← pairing.js:47
                                                        setRemoteDescription(offer)
                                                        setLocalDescription(answer)
                                                        waitIce(pc, 8000)
                                                        link = 'prosa://pair/' + b64({t:'answer', sdp, v:1})
                                                  └─> dcPromise.then(dc => wirePeer(pc, dc))

        <───────── link de resposta copiado ─────────

PairingPanel.vue:110-116 finish()
  └─> pairing.js:59-68  completePairing(pc, answerLink)
        valida t==='answer'
        normaliza a=setup:* → a=setup:active   ← pairing.js:66
        setRemoteDescription(answer)

        ════ ICE connectivity + DTLS + SCTP (interno do browser) ════

dc.onopen (ambos os lados)
  └─> PairingPanel.vue:72-74  envia hello
        { v:1, id:'hello:<ts>', type:'hello', from:<pubKeyHex>, body:{} }
        ⚠ autodeclarado — sem assinatura nem prova de posse da chave

dc.onmessage com type==='hello'
  └─> PairingPanel.vue:75-85
        se !isOnline(m.from): node.attachPeer(m.from, pc, dc)

attachPeer
  └─> node.js:30-43 → pairing.js:80-91 attachChannel
        onOpen → transport.js:40-46 addPeer(peerId, dc)
                   presences[peerId]='online'; flushPending()
        para cada espaço comum: sync.js:9-14 sendSyncReq(peerId, spaceId)
        contacts.broadcastProfile(identity)

        ════ canal estabelecido ════

Tráfego de dados (peer-a-peer direto, sem servidor)
  └─> transport.js:66-83 send/broadcast  →  channel.send(JSON.stringify(env))
  └─> transport.js:86-103 receive        →  dedupe + ack + dispatch
  └─> envelopes assinados                →  envelope.js {v,id,spaceId,author,seq,type,ts,body,sig}
  └─> sync incremental                   →  sync.js:17-30 handleSyncReq / 33-41 handleSyncEvent
  └─> voz/vídeo                          →  rtc.js:20-43 makePc (mesma config ICE de store.iceServers)
        sinalização de mídia             →  providers/p2p.js:331-343 events.signal → p2pTransport.signal
```

### Pontos de falha identificados (por etapa)

| # | Etapa | O que falha | Evidência no código |
|---|-------|-------------|---------------------|
| F1 | ICE gathering | STUN inalcançável → só host/mDNS candidates; `waitIce` de 8 s pode gerar link **parcial** sem aviso | `pairing.js:70-78` |
| F2 | Resolução de candidatos | Host candidates podem ser publicados como `.local` (mDNS) — irresolúveis entre redes, e até em LAN sem suporte a mDNS | ausência de `getUserMedia` antes do pareamento; comportamento padrão Chromium |
| F3 | ICE connectivity | NAT simétrico/CGNAT/UDP bloqueado → sem relay candidates, checks falham | `localconfig.js:4` (só STUN) |
| F4 | DTLS/SCTP | Falha de handshake após candidatos aparentemente válidos | etapa interna; só diagnosticável por `iceConnectionState`/`getStats` — **não capturada** |
| F5 | DataChannel | `dc.onopen` nunca dispara → `hello` nunca é enviado → peer nunca é registrado; **silencioso** | `PairingPanel.vue:68-86` |
| F6 | Handshake `hello` | `peerId` autodeclarado sem assinatura — sem prova de posse da chave; fingerprint não aparece no link nem é verificado | `PairingPanel.vue:73,78-79`; spec `p2p-architecture.md` §4.2.4 previa autenticação |
| F7 | Reconexão | Peers não persistem; `dropPeer` não tenta reconectar — queda exige novo pareamento manual | `transport.js:47-52`, `node.js:30-43` |
| F8 | Config | `prosa_ice`/`VITE_ICE_SERVERS_JSON` não documentados em `.env.example`/`vite.config.js` | `localconfig.js:9`, `.env.example:18-20` |
| F9 | Observabilidade | Nenhum handler de `onicecandidate`/`oniceconnectionstatechange`/`onconnectionstatechange`/`onicecandidateerror` no pareamento — impossível saber onde morreu | `pairing.js`, `PairingPanel.vue` |

### Divergências spec × código (`p2p-architecture.md` §4.2)

| Previsto na spec | Implementado |
|---|---|
| Link `prosa://connect` com `{pubkey, sdp_offer, ice_hints}` | `prosa://pair/` com `{t, sdp, v:1}` — sem pubkey/fingerprint (`pairing.js:36,54`) |
| Handshake `hello` autenticado com prova de posse da chave | `hello` autodeclarado, sem assinatura (`PairingPanel.vue:73`) |
| Candidatos de conexão cacheados para reconexão futura | Não persistidos; re-pareamento manual obrigatório |
| Verificação de fingerprint recomendada na UI | Ausente — `PairingPanel` exibe só a chave local |

### Conclusão T1

A arquitetura realiza transporte de dados **genuinamente direto** (DataChannel peer-a-peer, sem relay implementado), mas a conexão **só sobe se ICE completar com candidatos utilizáveis**. As condições que impedem isso em redes reais — ausência de TURN, candidatos parciais/mDNS, nenhuma observabilidade de ICE — estão concentradas em `pairing.js`, `localconfig.js` e `PairingPanel.vue`. As etapas seguintes da investigação devem confirmar em qual cenário de rede cada causa predomina.

---

## T2 — Inventário de dependências externas e intermediários

### Chamadas de rede no caminho P2P

Busca por `fetch(`, `WebSocket`, `XMLHttpRequest`, `http://`, `https://` em `web/src/services/p2p/` e `web/src/services/providers/p2p.js`: **zero ocorrências** — o provider P2P não faz nenhuma chamada HTTP/WS. O `api.js`/`realtime.js` (provider `server`) não é usado quando `MODE === 'p2p'` (`provider.js:13-26`, `stores.js:145-151`).

### Dependências externas

| Dependência | Finalidade | Iniciar ou manter? | Configuração | Obrigatória? |
|---|---|---|---|---|
| **Google STUN** `stun.l.google.com:19302` (UDP) | Descobrir candidatos srflx (IP/porta públicos) para ICE | Somente no **início** da conexão (gathering) | Default em `localconfig.js:4`; override por `localStorage.prosa_ice` ou `VITE_ICE_SERVERS_JSON` (`localconfig.js:9-11`) | Sim, exceto em LAN/IP público direto — **única infra externa do caminho P2P** |
| **Canal externo** (qualquer meio de copiar/colar) | Sinalização: troca dos links `prosa://pair/` offer e answer | Somente no **início** | N/A — manual | Sim, em toda sessão (sem persistência/reconexão) |
| **TURN** | Relay quando conexão direta é impossível | Manter (transporte de dados) | Não configurado; aceito via `prosa_ice`/`VITE_ICE_SERVERS_JSON` | **Inexistente** — exigido apenas onde ICE direto falha |
| **Relay/mailbox/rendezvous** | Entrega de sinalização ou de mensagens a peer offline | Iniciar (sinalização) | — | **Inexistente** |
| **Servidor Prosa** (`server/`, `/api/config`) | Backend do provider `server` | — | — | **Não usado** em modo P2P |

### Fluxo dos dados por tipo de payload (conexão estabelecida)

| Payload | Canal | Passa por intermediário? |
|---|---|---|
| Envelopes de domínio (mensagens, edições, reações, pins, espaços) | DataChannel `'prosa'` via `transport.send/broadcast` → `channel.send` (`transport.js:66-83,161-170`) | **Não** — direto peer-a-peer, cifrado por DTLS |
| Controle (presence, typing, voice_state, sync, contact, profile, space_invite) | Mesmo DataChannel via `sendToPeer`/`spaceEvent` (`transport.js:121-144`) | **Não** |
| ACKs e fila offline | Mesmo DataChannel (`transport.js:89-100,172-185`) | **Não** — fila é local, reenviada ao reconectar |
| Arquivos | `file_meta`/`file_chunk` (64 KB base64/chunk) no mesmo canal (`files.js:24-30,45-64`) | **Não** — direto, verificado por SHA-256 |
| Sinalização de mídia (SDP/ICE da chamada de voz) | Envelope `signal` no DataChannel de controle (`providers/p2p.js:331-343` → `transport.js:142-144`) | **Não** — usa o canal já aberto |
| Áudio/vídeo/tela | `RTCPeerConnection` de mídia separada por par (`rtc.js:20-43`), mesma config ICE (`store.iceServers`) | **Não** — mesh peer-a-peer; mesmas limitações de NAT do canal de dados |

### Conclusão T2

- **Iniciar a conexão exige**: Google STUN (descoberta de srflx) + canal externo manual (troca de links). Nenhum outro serviço externo existe.
- **Manter a conexão não exige nada além do canal direto** — dados, controle, arquivos, sinalização de mídia e mídia trafegam peer-a-peer.
- **Não há relay de dados implementado** — quando o ICE não produz um par de candidatos funcional, não existe fallback: a conexão simplesmente não sobe. Isso converte a ausência de TURN (C1) de "limitação opcional" em **ponto único de falha** para NAT simétrico/CGNAT.

---

## T3 — Auditoria de observabilidade e instrumentação proposta

### Telemetria existente (catalogo completo)

| Local | Evento/sinal | Uso atual | Visível ao usuário? |
|---|---|---|---|
| `pairing.js:74-76` | `pc.onicegatheringstatechange` | Apenas resolve `waitIce` — não loga estado nem candidatos | Não |
| `pairing.js:47` | `pc.ondatachannel` | Entrega o canal a B (funcional) | Não |
| `PairingPanel.vue:72-74` | `dc.onopen` | Envia `hello` | Indireto (só se completar) |
| `PairingPanel.vue:95,106,114` | `err.value` | Exibe **apenas exceções lançadas** (link inválido, `setRemoteDescription`) | Sim — mas falhas de ICE não lançam exceção |
| `rtc.js:28-30` | `pc.onicecandidate` | Reencaminha candidato ao peer (funcional) — não loga | Não |
| `rtc.js:37-39` | `pc.onconnectionstatechange` | `dropPeer` em `failed`/`closed` — não loga | Indireto (peer some) |
| `rtc.js:79` | `console.warn('rtc signal', e)` | Único log do fluxo de sinalização de mídia | Console dev apenas |
| `transport.js:19,169` | `log('send fail')` | Logger configurável, único call site — não ligado a nada | Não |
| `stores.js:167-168` | `console.error('[prosa] bootstrap falhou')` + `store.bootError` | Erro de boot do nó | Console + UI de erro de boot |
| `main.cjs:81` | `console.log('[p2p] storage backend:')` | Backend de storage escolhido | Console do main apenas |

### Faltante — nenhum ponto de observabilidade em:

- `pc.iceGatheringState` e quantidade/tipos de candidatos coletados (host/srflx/relay, IP literal vs `.local`) — **o dado-chave do diagnóstico**.
- `pc.onicecandidateerror` (falhas de STUN: host unreachable, timeout, 4xx).
- `pc.oniceconnectionstatechange` / `pc.onconnectionstatechange` no **pareamento** (existe só em `rtc.js` para mídia).
- `dc.readyState` e timeouts de abertura do DataChannel.
- `pc.getStats()` (pares de candidatos, selecionado, bytes, RTT).
- Resultado do `waitIce`: completou ou expirou — hoje indistinguível.
- Recebimento/envio do `hello` e resultado de `attachPeer`/`sync_req`.

**Consequência (confirma C4):** uma conexão que falha em ICE connectivity é indistinguível de "o amigo não colou o link certo" — a UI fica eternamente no estado "aguardando" e nenhum log explica o motivo.

### Instrumentação mínima proposta (documentada — não implementada)

| Ponto | O que capturar | Propósito | Privacidade |
|---|---|---|---|
| `pc.onicecandidate` + `null` final | Contagem por tipo (`host`/`srflx`/`relay`), flag `mDNS` (`.local`) | Saber se srflx existiu (STUN funcionou) | Não gravar IP:porta literal — só tipo e contagem |
| `pc.onicegatheringstatechange` | Transição `new→gathering→complete` + flag "completou ou expirou" | Medir `waitIce` parcial | Seguro |
| `pc.onicecandidateerror` | `errorCode`, `errorText`, `url` (servidor STUN) | Falha de STUN explícita | Sem credenciais no `errorText` — logar só código |
| `pc.oniceconnectionstatechange` + `pc.onconnectionstatechange` | Transições até `connected`/`failed`/`disconnected` | Etapa exata da morte (checks vs DTLS vs SCTP) | Seguro |
| `dc.onopen`/`onclose`/`onerror` + `readyState` | Estado do canal + tempo até open | Diferenciar ICE ok × canal que não abre | Seguro |
| `pc.getStats()` sob demanda | Par de candidatos selecionado (tipo local/remoto), `candidate-pair.state`, bytes | Confirmar caminho direto vs relay | Logar tipos/estados; IP só em debug local explícito |
| Envio/recebimento do `hello` | `type:'hello'` + fingerprint (nunca chave completa) | Confirmar handshake | `peerId.slice(0,16)` já usado na UI |
| `dropPeer`/`addPeer` | Timestamp + motivo | Histórico de quedas para T7 | Seguro |
| Superfície de saída | `console.debug('[p2p:diag]', …)` opt-in + futura IPC `p2p:diag` para o main persistir | Diagnóstico sem poluir produção | Nunca chaves privadas, tokens, payloads, SDP ou conteúdo de mensagens |

### Forma de uso durante T4–T7

O plano de testes usa `chrome://webrtc-internals` (Electron/Chrome) como ferramenta externa equivalente quando a instrumentação ainda não existir: `ice-candidate` grid, `iceConnectionState`, e `stats` por `pc`. A proposta acima cobre o que a ferramenta externa **não** registra: decisões da aplicação (`waitIce` parcial, hello, quedas) e a persistência do diagnóstico no app empacotado.

### Conclusão T3

A implementação tem **observabilidade praticamente nula no caminho de pareamento**: os únicos logs são de boot e de sinalização de mídia. Isso explica por que o usuário percebe apenas "não conectou" sem nenhuma pista de causa. A instrumentação proposta é pequena, localizada em `pairing.js`/`PairingPanel.vue` (mais `transport.js` para keepalive futuro), e é pré-requisito para transformar as hipóteses H1–H4 em causas confirmadas durante os testes de campo.

---

## T4 — Teste T1 (mesmo host): harness Electron com o fluxo real de `pairing.js`

**Método:** harness descartável em `/tmp/p2p-ice-test/main.js` rodando no Electron v33.4.11 do projeto — duas `RTCPeerConnection` reproduzindo exatamente `createPairingOffer`/`acceptPairingOffer`/`completePairing`/`wirePeer`, com instrumentação de candidatos, estados ICE e DataChannel.

### Evidência coletada

```
A.candidates = host=8 srflx=1 relay=0 mdns=0     (IPs literais — sem .local)
B.candidates = host=4 srflx=1 relay=0 mdns=0
A.waitIce = timeout                             (8s — gathering completou só em ~8,4s)
B.waitIce = complete
A.icestate  : checking@8432ms → connected@8437ms
B.icestate  : checking@8395ms → connected@8434ms
dc.open     : 8439ms  |  hellos trocados: B←A e A←B @8441ms
A.pair      : nominated host/udp <-> host/udp   (par local — mesmo host)
resumo      : ice=connected conn=connected sig=stable, dcA.readyState=open
```

### Conclusões T4

- **T1 do plano: PASSA** — o fluxo de pareamento funciona no mesmo host; DataChannel abre em ~8,4 s e o handshake `hello` ocorre.
- **C3 (mDNS) — refutada para o Electron desktop**: candidatos host foram publicados como IP literal sem `getUserMedia` (`mdns=0`). Na LAN o app desktop tende a conectar normalmente. **Ressalva**: no modo browser dev (fallback WebCrypto), o Chromium padrão ainda pode ofuscar com `.local` — hipótese que segue para teste em navegador, sem impacto no empacotado.
- **C2 (ICE parcial) — confirmada e marginal**: `waitIce` expirou em A mesmo numa rede saudável (timeout aos 8,0 s vs. `gather=complete` aos ~8,4 s). O link gerado continha srflx só porque o STUN respondeu dentro da janela — em STUN mais lento, o link sai **host-only** e o pareamento remoto falha. Causa real e reproduzida.
- **H1 (STUN alcançável) — confirmado nesta rede**: srflx produzido pelos dois lados.
- **Sem TURN — confirmado**: `relay=0` nos dois lados; só existem host+srflx.
- **Timing total**: ~8,4 s para `dc.open` — o usuário percebe uma espera longa e, sem logs, não sabe se está funcionando.

---

## T8 — Consolidação: causas × hipóteses × limitações

### Causas (da spec) — status final

| ID | Causa | Status | Evidência |
|---|---|---|---|
| **C1** | Sem TURN → falha em NAT simétrico/CGNAT | **Confirmada** (estrutural; impacto por cenário depende do NAT real) | `localconfig.js:4` (só STUN); `relay=0` no harness T4; sem fallback de relay em todo o caminho P2P |
| **C2** | ICE parcial no link (timeout 8 s, sem trickle) | **Confirmada e reproduzida** | `pairing.js:70-78`; `A.waitIce=timeout` no harness — gathering completou ~400 ms depois do prazo |
| **C3** | mDNS em host candidates | **Refutada para Electron desktop**; hipótese residual só no modo browser dev | Harness T4: `mdns=0`, host candidates saem como IP literal sem `getUserMedia` |
| **C4** | Falha silenciosa (sem observabilidade) | **Confirmada** | Auditoria T3: zero handlers/logs de estado ICE no pareamento |
| **C5** | `hello` sem autenticação | **Confirmada** | `PairingPanel.vue:73` — peerId autodeclarado; spec §4.2.4 previa prova de posse |
| **C6** | Sem reconexão/keepalive | **Confirmada** (código); comportamento em queda real pendente de campo | `transport.js:47-52`, `node.js:30-43`; peers não persistem |
| **C7** | Config ICE não documentada | **Confirmada** | `.env.example`/`vite.config.js` omitem `prosa_ice`/`VITE_ICE_SERVERS_JSON` |

### Hipóteses (da spec) — status final

| ID | Hipótese | Status | Observação |
|---|---|---|---|
| **H1** | STUN público alcançável | **Confirmada nesta rede** (srflx nos dois lados) | Generalização por rede fica para o plano de campo (T5/T6) |
| **H2** | NAT simétrico/CGNAT nos ISPs de teste | **Não testada** | Requer pareamento real em redes distintas |
| **H3** | mDNS no Electron | **Refutada** | `mdns=0` no Electron 33; segue como hipótese apenas para browser dev |
| **H4** | Sub-etapa exata da falha por cenário | **Parcialmente respondida** | No mesmo host a cadeia completa funciona; falha remota converge para ICE connectivity — qual sub-etapa exata depende de campo |

### Limitações inerentes (não são bugs)

- **NAT simétrico bilateral, CGNAT bilateral ou UDP totalmente bloqueado** impedem conexão direta — só relay (TURN) resolve, e passa a não ser "direto".
- **Entrega offline impossível** sem peer online — sinalização e dados não têm nenhum transporte intermediário.
- **Sem relay, a promessa "sem intermediário" tem uma lacuna de cobertura** que só se fecha com TURN como exceção documentada.

### Síntese — por que a conexão remota não sobe

Para dois computadores em redes diferentes, o único caminho viável é **srflx×srflx ou host-público×srflx**. As falhas se concentram em três grupos, por ordem de probabilidade para o cenário típico:

1. **Link com candidatos insuficientes** (C2): `waitIce` de 8 s pode fechar o SDP antes de srflx — reproduzido em rede saudável.
2. **ICE connectivity sem par válido** (C1 + H2): NAT simétrico/CGNAT/UDP bloqueado, sem TURN — ponto único de falha.
3. **Impossível diagnosticar** (C4): nenhum log distingue os dois casos acima de erro de uso — o usuário não sabe em qual etapa morreu.

Em NAT comum (full-cone/restrito não-simétrico) e STUN alcançável, a conexão direta **deve funcionar** — o que falha hoje é a margem de erro (C2) e a visibilidade (C4), além dos cenários estruturalmente impossíveis sem relay (C1).

---

## T9 — Diagnóstico final, propostas e roteiro de validação de campo

### Recomendações de correção (propostas — nada implementado)

Ordenadas por custo × benefício. Nenhuma é pré-requisito da outra.

| # | Correção | Resolve | Esforço | Prós | Contras / dependências |
|---|---|---|---|---|---|
| **F1** | Esperar `iceGatheringState==='complete'` sem cap de 8 s (ou cap alto, ex. 20 s) **+ indicador de progresso** | C2 | Baixo | Link sempre com candidatos completos; UX honesta | Em STUN inalcançável, espera parece "travada" — mitigar com timeout longo + log |
| **F2** | Telemetria mínima de pareamento (seção T3): estados ICE, tipos de candidato, `onicecandidateerror`, estado do canal | C4 | Baixo | Transforma diagnóstico de campo em evidência; desbloqueia validação de H2/H4 | Só observabilidade |
| **F3** | Documentar `prosa_ice`/`VITE_ICE_SERVERS_JSON` em `.env.example` + `README` | C7 | Baixo | Usuário pode apontar STUN/TURN próprio já hoje | Só documentação |
| **F4** | `hello` assinado (Ed25519) + fingerprint exibido no `PairingPanel` e conferível fora de banda | C5 | Médio | Prova de posse da chave; detecta link adulterado | Bump de protocolo (`v:2` do envelope `hello`) |
| **F5** | Keepalive de aplicação (`ping` no controle a cada N s) + persistência de peers/candidatos para reconexão | C6 | Médio | Menos re-pareamentos; conexão sobrevive a blips | Candidatos podem expirar; reconexão sem novo SDP nem sempre é possível |
| **F6** | ICE trickle via canal auxiliar mínimo (mailbox/rendezvous opcional) | C2 + UX | Alto | Sinalização automática; link só carrega SDP base | **Novo serviço** — viola "sem intermediário" para a etapa de sinalização; justificar como opt-in |
| **F7** | TURN próprio (coturn) **opcional e configurável**, apresentado na UI como "modo compatibilidade" | C1 | Alto (infra) | Cobre NAT simétrico/CGNAT | Dados via relay — deixa de ser estritamente direto; custo de servidor/credenciais |
| **F8** | UPnP/NAT-PMP/PCP no main process para hole-punching | C1 parcial | Alto | Conexão direta sem TURN em roteadores compatíveis | Cobertura irregular; muitos roteadores desligam UPnP |

**Ordem sugerida:** F1 + F2 + F3 primeiro (resolvem a maioria dos casos de falha silenciosa e candidatos incompletos, sem nova infraestrutura). F7 (TURN) só entra como exceção documentada **depois** que os testes de campo (H2/H4) mostrarem onde a conexão direta é inviável — conforme a regra de não presumir necessidade de relay.

### Roteiro de coleta de campo (para o usuário executar)

Para cada pareamento real, registrar em cada lado:

1. `chrome://webrtc-internals` → a `pc` do pareamento: tabela `ice-candidate` (tipos e se há `.local`), `iceConnectionState` ao longo do tempo, `candidate-pair` nomeado.
2. Resultado final: `dc.open` aconteceu? `hello` foi enviado/recebido? `attachPeer`/`peers online` na UI?
3. Cenário: tipo de rede de cada lado (residencial, corporativa, celular/CGNAT) e se UDP 19302 responde (`ping` não testa UDP; usar `nc -u -v stun.l.google.com 19302` com timeout, ou observar `onicecandidateerror`).

| Cenário | Comando/ação | Evidência a colher |
|---|---|---|
| LAN (2ª máquina) | Parear normal | Confirmar conexão direta host↔host |
| Redes distintas | Parear entre duas residências | srflx em ambos? `candidate-pair` srflx↔srflx? |
| STUN lento | `prosa_ice` com STUN distante | `waitIce` timeout → link host-only? (reproduz C2) |
| Corporativo | Rede com UDP bloqueado | `onicecandidateerror` vs. falha silenciosa |
| CGNAT | Tethering 4G de um lado | Documentar impossibilidade (H2) |
| Queda | Fechar um app após conectar | Peer marcado offline? Só re-pareamento recupera? (C6) |

### Arquivos que precisarão de alteração (etapa futura)

- `web/src/services/p2p/pairing.js` — F1 (espera completa), F2 (telemetria), F4 (hello assinado).
- `web/src/services/p2p/localconfig.js` — F3 (documentação da config) e futura F7 (TURN).
- `web/src/components/PairingPanel.vue` — F1/F2 (estado visível), F4 (fingerprint).
- `web/src/services/p2p/transport.js`, `node.js` — F5 (keepalive, peers persistidos).
- `web/src/services/p2p/identity.js` — F4 (assinatura do `hello`).
- `web/src/rtc.js`, `providers/p2p.js` — mesma config ICE aplicada à mídia.
- `web/test/p2p.test.js` — testes do handshake/estado.
- `.env.example`, `README.md` — F3 (documentação).

### Status dos critérios de aceite (spec §12)

- Arquitetura e componentes mapeados (T1/T2) — **feito**.
- Fluxo sinalização → conexão → dados analisado (T1) — **feito**.
- Causas confirmadas com evidência (T4/T8: C1, C2, C4, C5, C6, C7) — **feito**.
- Hipóteses separadas de confirmados (T8) — **feito**.
- Dependências externas documentadas (T2) — **feito**.
- Viabilidade por cenário avaliada (T4/T8) — **feito** (com campo pendente).
- Cenários de teste definidos (spec §9 + roteiro T9) — **feito**.
- Alternativas documentadas (T9) — **feito**.
- Cenários T2-do-plano/T3–T7 de campo — **pendentes**: requerem ambientes reais (LAN com 2ª máquina, redes distintas, CGNAT); roteiro de coleta pronto para execução pelo usuário.
- Nenhuma implementação; nenhuma task de correção criada — **respeitado**.

### Conclusão geral

O Prosa implementa transporte de dados genuinamente direto, mas a conexão remota falha porque **a sinalização por link pode fechar com candidatos incompletos (C2)**, **não existe fallback de relay onde ICE direto é inviável (C1)** e **nada é registrado sobre onde a cadeia morre (C4)** — somados à fragilidade operacional de `hello` autodeclarado (C5) e ausência de reconexão (C6). As correções baratas (F1–F3) resolvem a maior parte do problema observado; TURN deve ser introduzido como exceção opt-in somente onde os testes de campo demonstrarem conexão direta impossível.

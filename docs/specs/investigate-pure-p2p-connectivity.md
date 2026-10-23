# Spec: Investigar falhas na conexão P2P direta entre computadores remotos

**Nome da spec:** `investigate-pure-p2p-connectivity`
**Tipo:** investigação/diagnóstico — nenhuma implementação nesta etapa
**Status:** aguardando aprovação
**Data:** 2026-10-15

---

## 1. Contexto

O Prosa precisa permitir que dois computadores estabeleçam uma **conexão direta pela internet**, mesmo em redes diferentes e locais distintos, sem depender de servidor intermediário para retransmitir dados durante a conexão.

Atualmente, a conexão P2P entre computadores **não está funcionando como esperado**. Esta spec define a investigação técnica para identificar as causas, mapear a arquitetura real implementada e separar falhas de implementação, limitações de configuração e limitações inerentes à conectividade P2P (NAT, firewall, CGNAT).

A investigação considera: NAT, CGNAT, firewall, roteadores, descoberta de endereços, negociação, sinalização, protocolos de transporte e dependências de serviços externos — priorizando sempre a conexão P2P **direta** (dados peer-a-peer, sem retransmissão).

**Esta spec é de diagnóstico.** Nenhum código, configuração, dependência ou infraestrutura será alterado durante a investigação. Correções propostas aguardam spec/aprovação posterior.

---

## 2. Arquitetura atual (confirmada pelo código)

| Camada | Implementação | Arquivos |
|---|---|---|
| Transporte P2P | `RTCPeerConnection` + `RTCDataChannel` (`"prosa"`, ordered/reliable) | `web/src/services/p2p/pairing.js` |
| Sinalização | **Manual**: SDP offer/answer embutido em links `prosa://pair/` (base64url), copy-paste ida e volta. **Não existe servidor de sinalização.** | `pairing.js`, `PairingPanel.vue` |
| ICE | `RTCPeerConnection({ iceServers })` com default `[{ urls: 'stun:stun.l.google.com:19302' }]`; override via `localStorage.prosa_ice` ou `VITE_ICE_SERVERS_JSON`. **Não há TURN configurável por padrão.** | `p2p/localconfig.js` |
| ICE gathering | `waitIce(pc, 8000)` resolve com **candidatos parciais** se o gathering não completar em 8 s — o link pode conter só host candidates. | `pairing.js:33,51,70-78` |
| Handshake | Ao abrir o canal, cada lado envia `{type:'hello', from:pubkey}` **autodeclarado, sem assinatura**; o `peerId` do transporte é o `from` recebido. | `PairingPanel.vue:68-86` |
| Transporte de dados | Envelopes JSON assinados Ed25519 `{v,id,spaceId,author,seq,type,ts,body,sig}` direto no DataChannel: fan-out por espaço, dedupe, ACKs, fila offline. **Dados trafegam peer-a-peer — não há retransmissão por servidor implementada.** | `p2p/transport.js`, `p2p/envelope.js`, `p2p/node.js` |
| Voz/vídeo | Mesmo `rtc.js` do modo server; sinalização `signal`/`voice_state` vai pelo DataChannel já aberto; ICE servers = `store.iceServers` (mesma config). | `web/src/rtc.js`, `providers/p2p.js` |
| Reconexão | **Inexistente**: peers não são persistidos; `dropPeer` não tenta reconectar — queda exige novo pareamento manual. | `node.js`, `transport.js` |
| Observabilidade | **Ausente no pareamento**: sem handlers de `onicecandidate`/`oniceconnectionstatechange`/`onconnectionstatechange`/`onicecandidateerror`; falha é silenciosa para o usuário. | `pairing.js`, `PairingPanel.vue` |
| Identidade | Ed25519 no Electron main (`web/desktop/identity.cjs`, IPC `p2p:pubkey/sign/verify`); no browser dev, WebCrypto + `localStorage` (`devOnly`). | `p2p/identity.js`, `web/desktop/*.cjs` |
| Modo | `localStorage.prosa_mode` = `server` \| `p2p`; P2P é experimental. Provider `server` usa WS `/ws` + `/api/config` (não é o caminho investigado). | `services/provider.js`, `providers/` |

### Divergência spec × código

`docs/specs/p2p-architecture.md` previa (§4.2): link `prosa://connect` com `{pubkey, sdp_offer, ice_hints}` + handshake `hello` autenticado + candidatos cacheados para reconexão. O código implementa `prosa://pair` com apenas `{t, sdp, v}` — **sem pubkey, sem fingerprint, sem autenticação do hello, sem cache de candidatos**.

### Dependências externas

- **Google STUN** (`stun.l.google.com:19302`) — único serviço externo no caminho P2P; necessário para srflx candidates na maioria dos NATs.
- **Canal externo** para troca dos links (a própria "sinalização").
- **Nenhum** relay, mailbox, rendezvous ou TURN existe no projeto.

---

## 3. Objetivo

Produzir um **diagnóstico técnico documentado** que explique por que o Prosa não estabelece conexão P2P direta entre computadores em locais diferentes, determinando:

1. Em qual etapa exata o estabelecimento da conexão falha (ICE gathering → connectivity checks → DTLS → DataChannel open → `hello` → `sync_req`).
2. Se os dispositivos conseguem descobrir e alcançar uns aos outros pela internet.
3. Se há falhas na negociação, na sinalização (troca de links) ou no estabelecimento do canal.
4. A dependência real de servidores/serviços intermediários e sua finalidade.
5. Limitações de rede que impedem conexão direta em cada ambiente.
6. Correções necessárias para viabilizar conexão direta — como proposta, sem implementar.

---

## 4. Escopo

### Incluído

- Mapear todos os componentes da comunicação entre dispositivos (arquivos, módulos, IPC, bridge Electron).
- Investigar a implementação P2P e os protocolos usados (WebRTC/ICE/STUN/DataChannel; presença/ausência de TURN, TCP, UDP, WebSocket no caminho P2P).
- Verificar como cada lado descobre endereços (ICE candidates: host, srflx, relay; mDNS) e inicia a comunicação.
- Analisar negociação (troca de SDP/candidatos) e estabelecimento dos canais.
- Comportamento em: mesma máquina, mesma LAN, redes diferentes com IP público, atrás de NAT, CGNAT, firewalls restritivos, UDP bloqueado.
- Confirmar se mensagens, arquivos, áudio e vídeo trafegam direto ou passam por intermediários.
- Examinar o que os logs atuais (console renderer/main) permitem inferir sobre falhas.
- Verificar dependência de site remoto, API centralizada ou infra externa para iniciar/manter a conexão.
- Compatibilidade macOS e demais SOs suportados (Windows NSIS, Linux deb).
- Apresentar soluções possíveis com limitações e dependências — **sem implementar**.

### Fora de escopo (nesta etapa)

- Implementar qualquer correção (TURN, keepalive, reconexão, hello assinado, UI de diagnóstico, config de ICE).
- Instalar/rodar servidores STUN/TURN/sinalização.
- Mudar UI, identidade visual ou arquitetura não relacionada ao diagnóstico.
- Criar tasks de implementação.

---

## 5. Requisitos

- **R1 — Diagnóstico da conexão:** identificar a etapa exata da falha (gathering, connectivity checks, DTLS, DataChannel, handshake, sync).
- **R2 — Arquitetura:** mapear o fluxo completo dispositivo-a-dispositivo, da descoberta à transmissão, com referências a arquivo:símbolo.
- **R3 — Dependências:** listar todos os servidores/serviços/protocolos necessários para iniciar e manter a conexão.
- **R4 — P2P direto:** verificar se os dados trafegam diretamente entre computadores quando a conexão sobe.
- **R5 — Rede:** investigar impactos de NAT, NAT simétrico, CGNAT, firewalls, portas, roteadores e políticas de ISP.
- **R6 — Sinalização:** verificar como SDP/candidatos são trocados e se o processo é robusto (completude de candidatos, timeout, formato do link).
- **R7 — Protocolos:** verificar configuração de ICE/STUN/TURN e comportamento dos candidatos (host, srflx, mDNS `.local`, relay).
- **R8 — Observabilidade:** verificar se logs atuais permitem identificar falha, transporte e desconexão; definir a instrumentação mínima necessária (proposta).
- **R9 — Testabilidade:** definir cenários de teste reproduzíveis para mesma máquina, LAN, redes distintas e redes restritivas.
- **R10 — Recomendações:** apresentar causas, evidências, limitações e alternativas de correção com dependências — antes de qualquer implementação.

---

## 6. Regras

1. Priorizar conexão P2P direta entre dispositivos.
2. Não presumir causa (NAT, firewall, protocolo) sem evidência do projeto ou de teste.
3. Não modificar código, configurações, dependências ou infraestrutura durante a investigação.
4. Não implementar/sugerir TURN, STUN ou sinalização como solução automática antes de verificar o que existe e justificar tecnicamente.
5. Não considerar a conexão funcional só porque os pares se identificam ou trocam sinalização.
6. Diferenciar claramente: sinalização → estabelecimento da conexão → transmissão efetiva de dados.
7. Não confundir ausência de relay com garantia de conectividade direta em todas as redes.
8. TURN não é solução automática: primeiro verificar se conexão direta é possível; documentar onde é inviável.
9. Documentar limitações de rede sem descaracterizar o objetivo P2P do projeto.
10. Não alterar UI, funcionalidades ou arquitetura fora do diagnóstico.
11. Preservar privacidade: não registrar credenciais, chaves privadas, tokens ou conteúdo sensível em logs/artefatos da investigação.
12. Não criar tasks nesta etapa.

---

## 7. Análise obrigatória (execução da investigação)

Antes de propor qualquer implementação, a investigação deve:

- Analisar a estrutura e a tecnologia de comunicação entre dispositivos.
- Identificar arquivos/módulos/serviços/componentes responsáveis pela conexão P2P.
- Verificar como a conexão é iniciada, negociada, estabelecida, mantida e encerrada.
- Identificar quais informações são trocadas e por qual canal.
- Verificar se existe servidor de sinalização e seu estado operacional (concluído: **não existe — sinalização é manual por link**).
- Verificar protocolos: ICE, STUN, TURN, WebRTC DataChannel, WebSocket, TCP, UDP.
- Examinar configuração de STUN/TURN, candidatos ICE, endereços, portas, timeouts e tratamento de erros.
- Verificar se a negociação cobre candidatos locais, públicos (srflx) e retransmitidos (relay).
- Analisar NAT simétrico, CGNAT, bloqueio de UDP, firewalls e restrições de ISP.
- Verificar dependências de serviços externos/APIs centralizadas/servidores de dados.
- Examinar logs disponíveis para localizar a etapa da falha, sem presumir causa.
- Identificar padrões/bibliotecas do projeto reaproveitáveis.
- Avaliar riscos de segurança: autenticação dos participantes (o `hello` hoje é autodeclarado), confidencialidade, exposição de portas.
- Separar: **causas confirmadas** (com evidência), **hipóteses** (dependem de teste real) e **limitações inerentes** a P2P.
- Apresentar proposta de correção com alternativas, vantagens, desvantagens e dependências — aguardando aprovação.

---

## 8. Resultado esperado

Documento de diagnóstico contendo:

- Descrição da arquitetura atual de comunicação.
- Mapeamento do fluxo de conexão entre dispositivos.
- Identificação dos arquivos e componentes envolvidos.
- Causas confirmadas das falhas, com evidências.
- Hipóteses que dependem de testes em ambiente real.
- Dependências de servidores/serviços externos e finalidade de cada uma.
- Avaliação da viabilidade de conexão P2P direta.
- Cenários onde a conexão direta funciona ou falha.
- Recomendações técnicas para correção.
- Plano de testes para validar a conexão entre computadores remotos.
- Lista de arquivos/áreas que podem precisar de alteração em etapa posterior.

### Causas já confirmadas pelo código (a documentar na investigação)

- **C1 — Sem TURN**: config ICE contém só `stun:stun.l.google.com:19302`; em NAT simétrico ou CGNAT não há par de candidatos válido → falha garantida nesses cenários.
- **C2 — Candidatos parciais**: `waitIce` (8 s) pode gerar link só com host candidates; não há ICE trickle — candidatos tardios nunca chegam ao par.
- **C3 — mDNS em host candidates**: sem `getUserMedia` antes do pareamento, hosts aparecem como `.local` não resolvíveis entre redes (e até dentro de LAN sem mDNS no par).
- **C4 — Falha silenciosa**: ausência de handlers/telemetria de ICE impede diagnosticar onde morre (gathering, checks, DTLS).
- **C5 — `hello` sem autenticação**: peerId autodeclarado sem assinatura — ausência de prova de posse de chave prevista na spec P2P.
- **C6 — Sem reconexão/keepalive**: peers não persistem; queda exige re-pareamento; mappings de NAT podem expirar sem tráfego de aplicação.
- **C7 — Config não documentada**: `prosa_ice`/`VITE_ICE_SERVERS_JSON` não aparecem em `.env.example`/`vite.config.js` — usuário sem caminho oficial para configurar ICE/TURN.

### Hipóteses a confirmar em rede real

- **H1**: Alcance do STUN público (UDP 19302 pode ser bloqueado por firewall corporativo).
- **H2**: Presença de CGNAT/NAT simétrico nos ISPs dos usuários de teste.
- **H3**: Comportamento mDNS específico do Electron empacotado vs. dev e vs. navegador.
- **H4**: Em qual sub-etapa o ICE falha em cada cenário — a confirmar via `chrome://webrtc-internals` / `RTCPeerConnection.getStats` / handlers de estado.

### Limitações inerentes a P2P (não são bugs)

- NAT simétrico dos dois lados, CGNAT bilateral ou UDP totalmente bloqueado **impedem conexão direta** — só relay (TURN) resolve, e deixa de ser "direto".
- Sem peer online, não há entrega nem pareamento — a sinalização é manual por natureza nesta versão.

---

## 9. Plano de testes (proposto, a detalhar na investigação)

| Cenário | Objetivo | Resultado esperado |
|---|---|---|
| T1 — Mesma máquina (2 instâncias) | Validar fluxo offer/answer/DataChannel/`hello` | Conecta sempre |
| T2 — Mesma LAN, 2 computadores | Host candidates funcionam; medir efeito mDNS | Conecta; expõe falha se `.local` não resolve |
| T3 — Redes diferentes, NAT full-cone/restrito | srflx via STUN basta | Conecta se STUN alcançável |
| T4 — NAT simétrico de um lado | Verificar se host+srflx falham | Falha prevista (C1) — documentar |
| T5 — CGNAT (4G/ISP) | Confirmar bloqueio estrutural | Falha prevista — documentar |
| T6 — UDP bloqueado / firewall corporativo | STUN inalcançável; link só com host | Falha prevista — documentar |
| T7 — Reconexão após queda | Canal cai e não volta sozinho | Confirma C6 |

Instrumentação de diagnóstico proposta (a especificar, sem implementar agora): captura de `iceGatheringState`, `iceConnectionState`, `connectionState`, `onicecandidateerror`, resumo de candidatos coletados (tipo/contagem por `host`/`srflx`/`relay`), estado do DataChannel e `getStats` — sem dados sensíveis.

---

## 10. Alternativas de correção (preliminar — a detalhar com evidências)

| Alternativa | Resolve | Vantagem | Desvantagem/dependência |
|---|---|---|---|
| TURN próprio (coturn) configurável | C1, T4, T5 | Conectividade quase universal | Dados via relay (não direto); infra + credenciais |
| ICE trickle via canal auxiliar | C2 | Candidatos completos sem esperar 8 s | Requer canal de sinalização extra (mailbox/rendezvous) |
| `getUserMedia` pré-pareamento / filtrar `.local` | C3 | Host candidates literais na LAN | Permissão de mídia só para IP local; UX |
| Telemetria/log de ICE e estado do canal | C4, R8 | Diagnóstico objetivo | Apenas observabilidade; cuidado com privacidade |
| `hello` assinado + fingerprint no link | C5 | Prova de posse de chave; previne MITM no pareamento | Mudança de protocolo (versão do envelope) |
| Keepalive (ping) + reconexão com candidatos persistidos | C6 | Menos re-pareamentos | NAT pode ter mudado de perfil; candidatos podem expirar |
| Rendezvous/mailbox opcional | C2 + UX de sinalização | Troca de offer/answer automática | Infra auxiliar (explicitamente não-transporte) |
| Documentar/configurar ICE no app (`prosa_ice`/UI) | C7 | Usuário pode apontar STUN/TURN próprio | Só configuração |
| UPnP/NAT-PMP/PCP hole-punching | C1 parcial | Conexão direta sem TURN em roteadores compatíveis | Cobertura irregular; desligado por padrão em muitos roteadores; acesso ao main process |

A escolha final depende de qual etapa falha nos cenários reais (R1, R9) — a investigação deve produzir a evidência antes de qualquer recomendação de implementação.

---

## 11. Arquivos e áreas prováveis de alteração (etapas futuras)

- `web/src/services/p2p/pairing.js` — ICE gathering, trickle, handlers de estado, formato do link.
- `web/src/services/p2p/localconfig.js` — defaults, config de ICE/TURN documentada.
- `web/src/services/p2p/transport.js`, `node.js` — keepalive, reconexão, persistência de peers.
- `web/src/components/PairingPanel.vue` — fingerprint, estado de conexão, diagnóstico na UI.
- `web/src/rtc.js`, `providers/p2p.js` — mesma config ICE aplicada à mídia.
- `web/src/services/p2p/identity.js` — `hello` assinado.
- `web/desktop/main.cjs`, `preload.cjs`, `store.cjs` — IPC de diagnóstico/peers persistidos; eventual auxiliar de rede (mDNS/UPnP).
- `web/test/p2p.test.js` — testes de handshake/estado.
- `.env.example`, `README.md` — documentação de configuração ICE/TURN e limitações.

---

## 12. Critérios de aceite da investigação

- [ ] Arquitetura atual de comunicação identificada e documentada.
- [ ] Componentes responsáveis pela conexão P2P localizados (arquivo:símbolo).
- [ ] Fluxo de sinalização, negociação e transmissão analisado.
- [ ] Causas confirmadas das falhas identificadas com evidências técnicas.
- [ ] Hipóteses não comprovadas separadas dos problemas confirmados.
- [ ] Dependência de servidores/serviços intermediários documentada com finalidade.
- [ ] Viabilidade de conexão direta entre redes distintas avaliada por cenário.
- [ ] Cenários de teste definidos para diferentes ambientes de rede.
- [ ] Alternativas de correção documentadas com limitações e dependências.
- [ ] Nenhuma implementação realizada; nenhuma task criada.

---

## 13. Fora de escopo declarado

- Implementação de TURN/STUN/sinalização/mailbox próprios.
- Auto-descoberta de peers (DHT, trackers, diretório público).
- Mudanças de UX/UI, marca ou arquitetura de domínio (eventos, espaços, permissões).
- Suporte a plataformas fora do escopo atual (mobile nativo).

# Tasks: Investigar falhas na conexão P2P direta entre computadores remotos

**Spec:** `docs/specs/investigate-pure-p2p-connectivity.md`
**Tipo:** investigação/diagnóstico — **nenhuma task implementa correção de código**
**Regra:** cada task é executada somente após autorização explícita (`/execute-task N` ou equivalente). Nenhuma task altera código, configuração, dependências ou infraestrutura.

---

## T1 — Mapa do fluxo de conexão (artefato de investigação)

Documentar, com referências `arquivo:linha`, a cadeia completa: `PairingPanel.vue` (makeOffer/answerOffer/finish) → `pairing.js` (offer/answer SDP, `waitIce`) → link `prosa://pair/` → `RTCPeerConnection` → `RTCDataChannel` → `hello` → `attachPeer` → `sync_req` → envelopes por `transport.js`.

- **Inclui:** diagrama da cadeia; pontos onde a conexão pode morrer (gathering, checks, DTLS, dc open, hello); comparação com a spec `p2p-architecture.md` §4.2 (divergências `prosa://pair` vs `prosa://connect`, `hello` não autenticado).
- **Validação:** documento contém cada etapa e cada ponto de falha com referência ao código; revisado contra os arquivos reais.
- **Entrega:** seção "Fluxo de conexão" do relatório de diagnóstico.

## T2 — Inventário de dependências externas e intermediários

Listar todo serviço/servidor no caminho P2P: Google STUN (UDP 19302), canal externo para troca de links, ausência de TURN/relay/mailbox/sinalização; confirmar que dados trafegam direto no DataChannel (sem retransmissão) quando ICE completa. Incluir o caminho paralelo de voz (`rtc.js` + `signal` sobre o canal de controle).

- **Inclui:** para cada dependência — finalidade, se é iniciar-only (sinalização/STUN) ou transporte (nenhum), e como é configurada (`localconfig.js`, `prosa_ice`, `VITE_ICE_SERVERS_JSON`).
- **Validação:** tabela de dependências completa; nenhum intermediário de dados encontrado além do STUN para discovery.
- **Entrega:** seção "Dependências" do relatório.

## T3 — Auditoria de observabilidade e instrumentação de diagnóstico (proposta)

Catalogar o que o código hoje reporta ao usuário/logs (handlers ausentes de `onicecandidate*`, `oniceconnectionstatechange`, `onconnectionstatechange`, `ondatachannel`, estado do `pc`) e o que `console`/renderer/main expõem. Definir a instrumentação **mínima** que a fase de testes precisa: estado de ICE gathering/connection, contagem e tipos de candidatos coletados, `onicecandidateerror`, estado do DataChannel, `getStats` — proposta documentada, não implementada.

- **Validação:** lista exaustiva de pontos de telemetria disponíveis hoje vs. faltantes; a proposta evita dados sensíveis (sem chaves, payloads ou IPs além dos tipos de candidato e endpoint observável).
- **Entrega:** seção "Observabilidade" + spec da instrumentação no relatório.

## T4 — Validação T1/T2: mesmo host e mesma LAN

- **T1:** duas instâncias na mesma máquina (duas pastas/perfil) — oferta, resposta, canal abre, `hello`, peers online.
- **T2:** dois computadores na mesma LAN — verificar se host candidates resolvem; observar presença de `.local` (mDNS) nos candidatos e efeito de `getUserMedia` ausente.

Para cada cenário, registrar: estado final do `pc`, tipos de candidatos no link, tempo até `dc open`, e se `hello`/sync ocorreu.

- **Validação:** evidência registrada por cenário (estado ICE, candidatos, resultado da conexão); T2 deve revelar se mDNS obfuscation impede mesmo a LAN.
- **Entrega:** resultados T1/T2 no relatório.

## T5 — Validação T3/T6: redes diferentes com NAT "comum" e STUN bloqueado

- **T3:** dois computadores em redes distintas com NAT não-simétrico — verificar se srflx candidates aparecem e se a conexão sobe via STUN.
- **T6:** ambiente com UDP/STUN bloqueado (firewall corporativo ou regra local) — confirmar que o link contém só host candidates e a conexão falha; registrar como falha silenciosa hoje.

- **Validação:** evidência de candidatos coletados por lado, resultado da conexão, e comportamento da UI na falha (sem aviso — confirma C4).
- **Entrega:** resultados T3/T6 no relatório.

## T6 — Validação T4/T5: NAT simétrico e CGNAT

- **T4:** um dos lados em NAT simétrico — confirmar que host+srflx falham sem TURN.
- **T5:** cenário CGNAT (ex.: tethering 4G) — confirmar bloqueio estrutural.

Onde acesso a esses ambientes não for possível, registrar como hipótese não verificada com a evidência que existe (ausência de TURN + tipo de NAT conhecido).

- **Validação:** por cenário — falha reproduzida com estado ICE registrado, ou marcado como não testado com justificativa.
- **Entrega:** resultados T4/T5 no relatório.

## T7 — Validação T7: queda e reconexão

Com uma conexão estabelecida (mesmo host ou LAN): derrubar o canal (fechar app, cortar rede, `pc.close()`) e observar se há qualquer tentativa de reconexão; medir se o peer é marcado offline e se o pareamento manual é a única saída. Verificar expiração de NAT mapping sem keepalive (observar se canal "morre" após idle prolongado ou se ICE keepalive interno sustenta).

- **Validação:** comportamento documentado; confirma/refina C6 (sem reconexão, sem keepalive de aplicação).
- **Entrega:** resultados T7 no relatório.

## T8 — Consolidação: causas × hipóteses × limitações

Cruzar os resultados de T1–T7 com as causas C1–C7 e hipóteses H1–H4 da spec: promover hipóteses confirmadas a causas, marcar não testadas com a evidência disponível, e classificar limitações inerentes (NAT simétrico bilateral, UDP bloqueado, entrega offline).

- **Validação:** cada item da spec tem status (confirmado com evidência / hipótese / limitação) e referência ao teste que o comprovou.
- **Entrega:** tabela final de diagnóstico no relatório.

## T9 — Relatório final + proposta de correções

Produzir o documento de diagnóstico em `docs/specs/investigate-pure-p2p-connectivity-report.md` (ou seção final da spec), contendo: arquitetura, fluxo, componentes, causas confirmadas com evidências, hipóteses pendentes, dependências externas, viabilidade de P2P direto por cenário, plano de testes executado, alternativas de correção com prós/contras/dependências, e lista de arquivos que precisarão de alteração.

- **Validação:** checklist §12 da spec completo; separação clara sinalização/conexão/dados; nenhuma recomendação de implementação automática (TURN só onde a evidência mostrar conexão direta inviável).
- **Entrega:** relatório aprovável pelo usuário; só depois dele tasks de implementação podem ser especificadas.

---

## Ordem e dependências

```
T1 ─┐
T2 ─┼─> T4 ──> T5 ──> T6 ──> T7 ──> T8 ──> T9
T3 ─┘        (testes reais)      (consolidação)
```

- T1–T3 são análise de código/documentos — podem rodar em qualquer ordem.
- T4–T7 exigem acesso a ambientes de rede reais; cada um só roda quando o cenário estiver disponível.
- T8 depende de T4–T7; T9 depende de T8.

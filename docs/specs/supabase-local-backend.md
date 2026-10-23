# Spec: Supabase (hospedado) — PostgreSQL, Realtime e integração com o nó P2P

**Nome da spec:** `supabase-local-backend`
**Status:** em revisão (R2 — backend hospedado)
**Data:** 2026-10-22
**Origem:** documento de escopo "Prosa — Implementação do Supabase Local, PostgreSQL e Comunicação em Tempo Real", após análise Fase 1 aprovada.
**Aprovação R1:** "continuar" em 2026-10-22. Opções recomendadas adotadas: D1(a) RLS permissivo de dev documentado; D2 pareamento automático quando ambos online; D3 espelho por remetente+receptores; D4 entrega 100% efêmera. D5 autorizada e executada em T7: `docker compose down` + `docker volume rm prosa_prosa-pgdata` + `docker-compose.yml` removido.
**Revisão R2:** pedido do usuário em 2026-10-22 — usar **Supabase hospedado** (projeto na nuvem) em vez do stack local em Docker. Demais requisitos preservados.
**Aprovação R2:** implícita e confirmada pelo fornecimento das credenciais do projeto hospedado (`db.bveprzynkfsqrgyomrzn.supabase.co`, Postgres 17.11, conexão direta validada em 2026-10-22). D6 resolvida como (c) `psql` direto via `SUPABASE_DB_URL` — sem CLI nem dashboard intermediário obrigatório.

---

## 1. Objetivo e contexto

Preparar a infraestrutura do Prosa sobre **Supabase hospedado** (projeto na nuvem supabase.com), com PostgreSQL versionado por migrações e Supabase Realtime para presença, eventos e sinalização WebRTC — preservando o transporte P2P existente (DataChannel) como via de dados.

O Supabase entra como **camada auxiliar de rendezvous e persistência**, não como transporte de mensagens. O projeto hospedado é de **desenvolvimento/descartável**; a estrutura fica pronta para produção posterior. Esta etapa **não implementa** login, cadastro ou Supabase Auth.

### Fatos da análise (base desta spec)

- A UI opera exclusivamente em `MODE='p2p'` (`web/src/services/provider.js`); o provider `server` e o backend Express estão inertes.
- `docker-compose.yml` sobe um Postgres isolado ao qual **nada se conecta**; o container `prosa-postgres` está atualmente em restart loop (`exec format error`) — não funciona nesta máquina.
- A sinalização WebRTC é manual (links `prosa://pair/`, SDP único, sem ICE trickle); não existe servidor de sinalização.
- O nó P2P já produz envelopes assinados com id determinístico (`spaceId:author:seq`), log local por espaço, contatos/amizade por mensagens de controle e presença efêmera.
- Supabase CLI **não está instalada** (instalação interrompida após a decisão por backend hospedado); Docker 29.9.2 funciona, mas o stack local deixa de ser necessário.

---

## 2. Escopo

### Incluído

- Projeto **Supabase hospedado de desenvolvimento** (criado no dashboard supabase.com pelo usuário) + credenciais (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) configuradas no ambiente.
- Migrações versionadas em `supabase/migrations/` criando a estrutura inicial de dados (§5), aplicadas ao projeto hospedado por `supabase link` + `supabase db push` **ou** pelo SQL editor do dashboard (D6).
- `docker-compose.yml` atual deixa de ser necessário — **sem dois Postgres** (remoção segue D5).
- Supabase Realtime para: presença, eventos de relacionamento/convites, e **sinalização WebRTC** (offer/answer/ICE com trickle).
- Camada de integração `web/src/services/supabase/` consumida pelo nó P2P: client, sinalização, presença, persistência (espelho no Postgres).
- Pareamento automático via sinalização Realtime **em adição ao** link manual, que permanece como fallback.
- Variáveis de ambiente documentadas (`.env.example`, `web/`), README com comandos de operação do ambiente.
- Testes de regressão do código novo + roteiro de verificação manual entre dois clientes.

### Fora de escopo (nesta etapa)

- Login, cadastro, Supabase Auth, recuperação de senha, sessões autenticadas, login social.
- Stack Supabase **local** (Docker/CLI para dev offline) — substituído pelo projeto hospedado; pode ser reintroduzido depois para trabalho offline.
- Migração definitiva para produção (o projeto hospedado é de dev).
- Substituição do transporte P2P por transporte via servidor; mensagens de chat **não** trafegam pelo Realtime.
- Backend Express (`server/`): preservado intocado, sem novas responsabilidades.
- Alterações visuais nas telas de amizades, conversas e configurações P2P — a não ser indicador discreto de conexão com o hub, se aprovado na implementação.
- Migração de dados do SQLite (`data/prosa.db`) ou do store local P2P para o Postgres — dados de dev, Postgres nasce limpo.
- Mailbox de sinalização para peer **offline** (sinalização exige os dois lados online — ver §7).
- TURN próprio, UPnP, discovery automático (permanece fora do escopo, como em `p2p-peer-reconnect`).

---

## 3. Regras de negócio

1. **Separação de planos:** dados de chat trafegam por DataChannel assinado; Realtime carrega presença, eventos de controle leve e sinalização. Realtime nunca substitui persistência: tudo que deve sobreviver a restart vai ao Postgres.
2. **Fonte de verdade:** o log de eventos local do nó (`store.cjs`/localstore) continua autoritativo para o estado do espaço; o Postgres é **espelho consultável** (histórico, índice, rendezvous), escrito de forma idempotente.
3. **Identidade:** usuário = chave pública Ed25519 (hex), como hoje. A tabela de perfis usa a pubkey como PK — sem contas, senhas ou unicidade de username.
4. **Convites:** os estados seguem a semântica de `friend-invitation-flow.md` e `contacts.js` (`pending` enviado/recebido → `accepted` | `declined` | `cancelled`). Um convite de pareamento não cria amizade por si só.
5. **Presença:** efêmera via Realtime Presence; nenhuma tabela representa "online". `profiles.last_seen_at` é atualizada best-effort apenas como referência histórica.
6. **Sinalização:** ofertas/respostas/candidatos ICE são efêmeros (broadcast), nunca persistidos.
7. **Autorização local:** sem auth, os clientes compartilham a anon key; as políticas de acesso são de dev local e documentadas (§6). A chave `service_role` **nunca** entra no app.
8. **Compatibilidade de fio:** o protocolo P2P (envelopes, `hello`, tipos de controle) não muda; a sinalização Realtime é um transporte alternativo de SDP/ICE para o mesmo `RTCPeerConnection`.

---

## 4. Requisitos

### Funcionais

- **RF-01** Projeto Supabase hospedado acessível; API/PostgREST/Realtime respondendo com as credenciais configuradas; dados persistem (intrínseco ao serviço).
- **RF-02** Migrações em `supabase/migrations/` criam o schema do §5 e são aplicadas ao projeto hospedado de forma reproduzível.
- **RF-03** Tabelas: `profiles`, `relationships`, `invites`, `conversations`, `conversation_members`, `messages` — nos campos definidos em §5.
- **RF-04** Cliente conecta ao Realtime local e publica/recebe presença nos canais definidos em §6.
- **RF-05** Convites e mudanças de relacionamento disparam eventos Realtime recebidos pelo destinatário online.
- **RF-06** Dois clientes online pareiam por sinalização Realtime (offer → answer → ICE trickle) e abrem DataChannel **sem troca manual de links**.
- **RF-07** O pareamento manual por link continua funcionando (fallback e quando um lado está sem hub).
- **RF-08** Mensagens enviadas são espelhadas em `messages` (idempotente, melhor-esforço); histórico consultável via PostgREST independente de eventos.
- **RF-09** Desconexão do hub não derruba peers já conectados; reconexão do Realtime retoma presença e sinalização.
- **RF-10** Documentação: criação do projeto, variáveis de ambiente, aplicação das migrações e roteiro de teste entre dois clientes.

### Não funcionais

- **RNF-01** Nenhuma credencial privilegiada no app: somente `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (anon key do projeto — feita para ser exposta; `service_role` e a senha do banco nunca entram no app nem no repositório).
- **RNF-02** O Postgres hospedado não é acessado diretamente pelo app — apenas via API (PostgREST/Realtime) com a anon key; a porta do banco e a senha ficam restritas à aplicação de migrações (CLI/dashboard).
- **RNF-03** Migrações versionadas em `supabase/`; segredos reais nunca commitados — `.env.example` com placeholders.
- **RNF-04** Única dependência nova no renderer: `@supabase/supabase-js`. Nenhuma mudança necessária no Electron main/preload.
- **RNF-05** Falha do hub degrada graciosamente: app continua P2P manual; espelhamento de mensagens é assíncrono e nunca bloqueia envio.
- **RNF-06** Suites existentes (`npm test`, `npm --prefix web test`) permanecem verdes.

---

## 5. Estado, persistência e migrações

### Schema inicial (schema `public`, uma migração `0001_initial`)

| Tabela | Campos principais | Observações |
|---|---|---|
| `profiles` | `pubkey` text PK, `display_name` text, `avatar_url` text, `bio` text, `status_text` text, `fingerprint` text, `last_seen_at` timestamptz, `created_at` timestamptz default now() | Identificação mínima; espelho do perfil assinado local |
| `relationships` | `owner` text → profiles, `peer` text → profiles, `state` text check in (`outgoing`,`incoming`,`friend`,`blocked`,`removed`), `updated_at`, PK `(owner, peer)` | Espelho dos estados de `contacts.js` |
| `invites` | `id` uuid PK, `kind` text (`friend` por ora), `from_pubkey`, `to_pubkey` → profiles, `status` (`pending`,`accepted`,`declined`,`cancelled`), `created_at`, `resolved_at` | Registro de convites enviados/recebidos/aceitos/recusados/cancelados |
| `conversations` | `id` text PK (= `spaceId` P2P), `type` (`dm`,`group`,`community`), `name`, `created_by` → profiles, `created_at` | Espaços/conversas conhecidos |
| `conversation_members` | `conversation_id` → conversations, `pubkey` → profiles, `role` (`owner`,`member`), `joined_at`, PK composta | Membros do espaço |
| `messages` | `id` text PK (id da mensagem no evento), `event_id` text unique (`spaceId:author:seq`), `conversation_id`, `channel_id` text, `author` → profiles, `content` text, `reply_to` → messages nullable, `attachments` jsonb, `created_at`, `edited_at`, `deleted_at` | Espelho; upsert idempotente por `event_id` |

- **Não persistidos:** presença, typing, sinalização SDP/ICE, `voice_state` — efêmeros por definição.
- **Estado de entrega:** ACKs permanecem efêmeros no transporte; nenhuma coluna de entrega nesta etapa (ver D4).
- Índices: `messages(conversation_id, created_at)`, `relationships(peer)`, `invites(to_pubkey, status)`, `conversation_members(pubkey)`.
- Integridade: FKs simples; dados de dev — nenhuma migração destrutiva sobre dados reais é necessária (Postgres novo).

---

## 6. Contratos afetados

### Canais Realtime (convenção)

| Canal | Tipo | Conteúdo |
|---|---|---|
| `prosa:presence:<pubkey>` | presence | `{displayName, ts}` — quem me conhece assina meu canal; contatos/amigos são assinados individualmente |
| `prosa:user:<pubkey>` | broadcast | `invite`, `relationship`, `signal` (offer/answer/ice — inclui `channelId` quando for mídia), `pair` |
| `prosa:space:<spaceId>` | broadcast | `typing`, `voice_state`, notificações leves — apenas quando DC indisponível |

- Payloads de sinalização: `{kind:'offer'|'answer'|'ice', from, to, data}` — ICE trickle encaminha candidatos incrementalmente (corrige a causa C2 do diagnóstico de conectividade).
- Sem `postgres_changes` nesta etapa: eventos de domínio via broadcast explícito; o Postgres é consultado por REST.

### Frontend (novo módulo `web/src/services/supabase/`)

- `client.js` — cria `supabase-js` (url/anon key com precedência `localStorage.prosa_supabase` → `VITE_*` → default local `http://localhost:54321`).
- `presence.js` — publica/assina canais `prosa:presence:*` de contatos.
- `signaling.js` — canais `prosa:user:*`; API `sendSignal(to, payload)` + `onSignal(fn)`; coordena pareamento automático (iniciador determinístico = pubkey menor, evita glare).
- `persistence.js` — upserts idempotentes para `profiles`, `relationships`, `invites`, `conversations`, `conversation_members`, `messages`; `messages.history(conversationId, before, limit)` via PostgREST.

### P2P (pontos de contato, sem mudança de protocolo)

- `node.js` — após `initP2PNode`, conecta ao hub se disponível; hooks `onSignal`/`onPresence`; espelha eventos aplicados.
- `pairing.js`/`pairing-flow.js` — caminho "via hub": offer/answer/trickle pelo canal em vez do link; fallback manual preservado.
- `contacts.js`/`providers/p2p.js` — espelham convites/relacionamentos/mensagens no Postgres (fire-and-forget).
- `providers/p2p.js` — contrato da UI **inalterado**; `messages.list` pode consultar o Postgres como fonte complementar (decisão de implementação — local continua funcional offline).

### Variáveis de ambiente

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co   # API do projeto hospedado
VITE_SUPABASE_ANON_KEY=<anon public key>              # Dashboard → Settings → API Keys

# SOMENTE dev local (migrações) — credencial privilegiada, nunca VITE_* nem no app
SUPABASE_DB_URL=postgresql://postgres:<senha>@db.<project-ref>.supabase.co:5432/postgres
```

A anon key é pública por natureza, mas no projeto hospedado ela dá acesso real — ver §8. `SUPABASE_DB_URL` existe só no `.env` local para aplicar migrações via `psql`.

### Env/infra

- `docker-compose.yml` e `POSTGRES_*`/`DATABASE_URL` saem de uso — remoção do arquivo e do volume `prosa_prosa-pgdata` é **operação destrutiva** pendente de autorização específica (D5).

---

## 7. Falhas e recuperação

- **Hub inalcançável (sem internet, projeto pausado, credenciais inválidas):** app funciona 100% em P2P manual; presença e convites remotos ficam indisponíveis; espelhos falham silenciosamente (log + retry leve opcional). O backend hospedado introduz dependência de internet que não existia no modo manual.
- **Sinalização para peer offline:** não há mailbox — oferta só quando o destinatário está presente (presence no canal do usuário). Reconexão automática entre contatos online: ambos online → iniciador determinístico cria oferta via `prosa:user:<peer>`.
- **Realtime cai e volta:** `supabase-js` reconecta; re-inscreve canais e re-publica presença; peers DC existentes seguem intactos.
- **Dupla escrita de mensagem:** remetente e destinatários podem upsertar a mesma `event_id` — `ON CONFLICT DO NOTHING`/update igual → idempotente.
- **Glare de pareamento:** dois lados iniciam simultaneamente → resolvido por comparação de pubkey (mesma técnica do `rtc.js`).

---

## 8. Autenticação, autorização e privacidade

- **Sem auth nesta etapa.** Todos os clientes usam a `anon` key do projeto hospedado.
- **RLS habilitado** nas tabelas novas com políticas permissivas de dev (`true` para `anon`), **documentadas como limitação ampliada**: num projeto hospedado, qualquer portador da anon key lê/escreve tudo — a chave é distribuída no app e vaza facilmente. Mitigação aceita para esta etapa: **projeto exclusivamente de dev/descartável, sem dados reais**, e revisão obrigatória antes de qualquer uso além do desenvolvimento.
- Alternativa avaliada (D1): RPC com verificação de assinatura Ed25519 por escrita — robusta, porém adiciona complexidade; permanece recomendável quando o projeto deixar de ser descartável.
- Canais Realtime públicos (autorização por canal privado exige RLS sobre JWT que a anon key compartilhada não distingue) — payloads de sinalização não contêm dados sensíveis além de SDP/candidatos, mas trafegam por serviço externo.
- **Conteúdo de chat no Postgres hospedado em claro** (espelho de dev): mensagens de teste saem do dispositivo para a nuvem — avisar quem testar; E2E sobre o espelho fica para etapa de auth.
- O app acessa somente a API HTTPS; a porta 5432 do banco e a senha ficam fora do app.

---

## 9. Modos, plataformas e UI

- Modo `p2p` (único ativo): hub é **opcional e aditivo** — com Supabase ligado, sinalização automática + espelho; sem ele, comportamento atual integral.
- Provider `server` e backend Express: não se aplica — permanecem inertes/intocados (justificativa: nenhuma responsabilidade nova requer backend; PostgREST cobre o acesso a dados).
- UI: sem mudanças obrigatórias; opcional discreto indicador "hub" em Detalhes da conexão (a decidir na implementação).
- Electron desktop e browser dev suportados; Realtime roda no renderer (WebSocket para `localhost:54321`), sem novos IPCs.

---

## 10. Estratégia de testes

**Automatizados**

- `web/test/`: codec/fluxo de sinalização (payloads offer/answer/ice, glare), mapeamento espaço→linhas do espelho, resolução de config (`prosa_supabase`/env/default).
- Migrações verificadas aplicando-as ao projeto de dev e consultando o schema via API/dashboard.
- Suites existentes intactas (`npm test`, `npm --prefix web test`, `npm run build`, `git diff --check`).

**Manual/integração (dois clientes)**

- Dois clientes online pareiam **sem colar link** pelo Realtime hospedado: DC abre, `hello`, sync, mensagens fluem peer-a-peer. Bônus da R2: permite testar clientes **em redes/máquinas realmente distintas** (NAT real), o que o stack local não alcançava.
- Histórico em `messages` consultável via PostgREST após envio e sobrevive a reinício do app.
- Fallback manual: cliente sem hub pareia por link normalmente.
- Queda do hub com DC aberto: chat continua; volta do hub restaura presença.

---

## 11. Riscos e decisões em aberto

### Riscos

- **Sem isolamento de acesso** até a fase de auth — **mais crítico hospedado**: anon key vaza → banco aberto. Mitigação: projeto dev/descartável; não deve ir a produção assim.
- **Dupla fonte de mensagens** (log local × Postgres) pode divergir se espelho falhar — mitigado por idempotência e status "melhor esforço" explícito.
- **Criação do projeto hospedado** é passo manual do usuário (conta/dashboard ou access token) — bloqueio externo para T1.
- **Exigência de internet** para rendezvous/espelho — aceito; fallback manual preservado.
- **Dados de chat na nuvem** — usar apenas dados de teste até a etapa de auth.

### Decisões em aberto (requerem posição antes/durante implementação)

- **D1 — Estratégia de permissões:** (a) RLS permissivo documentado [adotado p/ dev descartável]; (b) RPC com prova Ed25519 por escrita — recomendável antes de dados reais.
- **D2 — Pareamento automático:** sempre que ambos online [adotado].
- **D3 — Espelho de mensagens:** remetente+receptores, redundância idempotente [adotado].
- **D4 — Entrega persistida:** entrega 100% efêmera [adotado].
- **D5 — Remoção do `docker-compose.yml` + volume `prosa_prosa-pgdata`** (destrutivo; o volume não contém dados úteis — a imagem nem executa nesta máquina) — **executado em T7** após autorização.
- **D6 — Ferramenta de migrações:** resolvida — (c) `psql` direto via `SUPABASE_DB_URL` aplicando os arquivos de `supabase/migrations/` em ordem [adotado em 2026-10-22]. Alternativas mantidas como fallback: (a) Supabase CLI `link`/`db push`; (b) SQL editor do dashboard.

---

## 12. Critérios de aceite

- **CA-01** Projeto hospedado responde: `GET /rest/v1/` e Realtime conectam com `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` configuradas.
- **CA-02** O schema do §5 é criado no projeto apenas pelas migrações versionadas.
- **CA-03** Um cliente publica presença e contatos a recebem via Realtime.
- **CA-04** Dois clientes pareiam por sinalização Realtime sem troca manual; DC abre e mensagens fluem P2P.
- **CA-05** `invites`/`relationships` refletem enviado→aceito/recusado/cancelado com evento Realtime no destinatário.
- **CA-06** Mensagem enviada aparece em `messages` e é consultável via PostgREST sem evento Realtime.
- **CA-07** Sem hub: pareamento manual e chat P2P funcionam como hoje (sem regressão).
- **CA-08** `service_role`/segredos fora do app; `.env.example` só com placeholders.
- **CA-09** README documenta criação do projeto, credenciais, aplicação de migrações e o roteiro de teste entre clientes.
- **CA-10** Nenhuma implementação de login/cadastro/Supabase Auth.

---

## 13. Resumo

Supabase hospedado substitui o Postgres local isolado (quebrado e sem consumidores): Postgres versionado por migrações, Realtime para presença/convites/sinalização WebRTC com ICE trickle e PostgREST para histórico — agora alcançável de qualquer rede, o que permite testar dois clientes em locais realmente distintos. O nó P2P permanece o transporte de dados — o hub só apresenta os peers e guarda o espelho consultável. Sem auth nesta etapa; permissões permissivas documentadas para projeto de dev/descartável.

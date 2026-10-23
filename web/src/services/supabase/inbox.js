// supabase/inbox.js — convergencia de boot via mailbox (RF-09).
// Para cada conversa onde sou membro: espaco desconhecido e reconstruido pelo
// genesis assinado espelhado; depois puxa os envelopes que faltam (seq > have
// por autor) e reaplica no log local — sem depender do peer estar online.
import { logDiag } from '../p2p/diag.js';

// deps injetadas pelo no: persistence (PostgREST), getSpace, maxSeqOf(local),
// acceptGenesis (mesmo caminho de acceptSpaceInvite), ingest (= receiveRelayed)
export async function convergeInbox({ persistence, pubkey, getSpace, maxSeqOf, acceptGenesis, ingest } = {}) {
  if (!persistence || !pubkey) return;
  for (const spaceId of await persistence.listMemberships(pubkey)) {
    try {
      if (!getSpace(spaceId)) {
        const genesis = await persistence.getGenesis(spaceId);
        if (!genesis) { logDiag('inbox.nogenesis', spaceId.slice(0, 24)); continue; }
        await acceptGenesis(genesis);
      }
      const have = await maxSeqOf(spaceId);
      for (const env of await persistence.spaceEventsSince(spaceId, { have })) {
        await ingest(env);
      }
    } catch (e) {
      logDiag('inbox.space', e?.message || 'err'); // um espaco ruim nao aborta o boot
    }
  }
}

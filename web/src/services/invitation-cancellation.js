export function createInvitationCancellation({
  remove, reload, onChange = () => {}, successMessage = 'Convite cancelado.',
}) {
  const pending = new Set();
  let state = { pendingIds: [], refreshing: false, needsReload: false, error: '', notice: '' };
  let disposed = false;
  const update = patch => {
    state = { ...state, ...patch, pendingIds: [...pending] };
    if (!disposed) onChange(state);
  };
  async function cancel(userId) {
    if (disposed || pending.has(userId) || state.needsReload) return false;
    pending.add(userId);
    update({ error: '', notice: '' });
    let removed = false;
    try {
      await remove(userId);
      removed = true;
      await reload();
      update({ notice: successMessage });
      return true;
    } catch {
      update({
        needsReload: state.needsReload || removed,
        error: removed
          ? 'Convite cancelado, mas a lista nao foi atualizada. Use Atualizar lista antes de tentar novamente.'
          : 'Nao foi possivel cancelar o convite. Tente novamente.',
      });
      return false;
    } finally {
      pending.delete(userId);
      update({});
    }
  }
  async function refresh() {
    if (disposed || state.refreshing || !state.needsReload) return false;
    update({ refreshing: true, error: '' });
    try {
      await reload();
      update({ needsReload: false, notice: 'Lista atualizada.' });
      return true;
    } catch {
      update({ error: 'Nao foi possivel atualizar a lista. Tente novamente.' });
      return false;
    } finally { update({ refreshing: false }); }
  }
  onChange(state);
  return { get state() { return state; }, cancel, refresh, dispose() { disposed = true; } };
}

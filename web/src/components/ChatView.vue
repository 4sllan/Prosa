<template>
  <div class="chat">
    <div ref="listEl" class="msgs" @scroll="onScroll">
      <div v-if="loadingMore" style="text-align:center;color:var(--fg-dim);font-size:12px;padding:8px">Carregando…</div>
      <div v-for="(m, i) in messages" :key="m.id" class="msg" :class="{ compact: isCompact(i) }"
           @contextmenu.prevent="msgMenu(m, $event)">
        <span class="avatar" v-if="!isCompact(i)">
          <img v-if="m.author.avatarUrl" :src="fullUrl(m.author.avatarUrl)">
          <template v-else>{{ m.author.displayName.slice(0, 2).toUpperCase() }}</template>
        </span>
        <span v-else class="avatar" style="visibility:hidden"></span>
        <div style="flex:1;min-width:0">
          <div v-if="m.replyTo" class="reply-ref">↩ {{ m.replyTo.author }}: {{ m.replyTo.content }}</div>
          <div v-if="!isCompact(i)" class="msg-head">
            <span class="author">{{ m.author.displayName }}</span>{{ fmtTime(m.createdAt) }}
            <span v-if="m.editedAt" style="font-size:11px">(editada)</span>
            <span v-if="m.pinned" class="pin-tag">📌 fixada</span>
          </div>
          <div class="msg-body" v-if="editing !== m.id">{{ m.content }}
            <template v-for="a in m.attachments" :key="a.id">
              <img v-if="a.mime?.startsWith('image/')" :src="fullUrl(a.url)" class="att" :alt="a.filename">
              <video v-else-if="a.mime?.startsWith('video/')" :src="fullUrl(a.url)" class="att" controls></video>
              <a v-else :href="fullUrl(a.url)" class="att" target="_blank">📎 {{ a.filename }} ({{ fmtSize(a.size) }})</a>
            </template>
          </div>
          <div v-else style="display:flex;gap:6px;margin-top:4px">
            <input v-model="editText" @keydown.enter="saveEdit(m)" @keydown.esc="editing = null" style="flex:1;padding:6px">
            <button class="btn primary" style="padding:6px 12px" @click="saveEdit(m)">Salvar</button>
          </div>
          <div class="reactions">
            <button v-for="r in m.reactions" :key="r.emoji" class="reaction" :class="{ mine: r.users.includes(store.user.id) }"
                    @click="toggleReaction(m, r.emoji)">{{ r.emoji }} {{ r.count }}</button>
          </div>
        </div>
        <div class="tools">
          <button @click="react(m, '👍')" title="Reagir">👍</button>
          <button @click="react(m, '❤️')" title="Reagir">❤️</button>
          <button @click="customReact(m)" title="Emoji">😀</button>
          <button @click="copyMessage(m)" title="Copiar texto">📋</button>
          <button @click="replyTo = m; focusComposer()" title="Responder">↩</button>
        </div>
      </div>
    </div>

    <div class="typing">{{ typingText }}</div>
    <div v-if="replyTo" class="replying">
      Respondendo a <b>&nbsp;{{ replyTo.author.displayName }}</b>: {{ replyTo.content.slice(0, 60) }}
      <button @click="replyTo = null">✕</button>
    </div>
    <div class="composer">
      <div class="composer-box">
        <button @click="fileInput.click()" title="Anexar">📎</button>
        <input ref="fileInput" type="file" multiple hidden @change="files = [...$event.target.files]">
        <textarea ref="composer" v-model="draft" rows="1" :placeholder="'Conversar em ' + channelLabel"
                  @keydown.enter.exact.prevent="send" @input="notifyTyping"></textarea>
        <button @click="send" class="btn primary" style="padding:8px 16px">➤</button>
      </div>
      <div v-if="files.length" style="font-size:12px;color:var(--fg-dim);padding-top:6px">
        {{ files.length }} arquivo(s) anexado(s) <button @click="files = []">remover</button>
      </div>
    </div>

    <ContextMenu v-if="menu.open" :x="menu.x" :y="menu.y" :items="menuItems"
                 @select="onMenuSelect" @close="menu.open = false" />

    <div v-if="forwardMsg" class="modal-bg" @click.self="forwardMsg = null">
      <div class="modal">
        <h2>Encaminhar mensagem</h2>
        <div class="row">
          <label>Mensagem</label>
          <div style="font-size:13px;color:var(--fg-dim)">{{ forwardMsg.content?.slice(0, 140) || `${forwardMsg.attachments?.length} anexo(s)` }}</div>
        </div>
        <div class="row">
          <label>Destino</label>
          <select v-model="forwardTarget">
            <option value="" disabled>Escolha uma conversa</option>
            <option v-for="t in forwardTargets" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
        </div>
        <div class="actions">
          <button class="btn ghost" @click="forwardMsg = null">Cancelar</button>
          <button class="btn primary" :disabled="!forwardTarget" @click="confirmForward">Encaminhar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { store, sendMessage, fullUrl } from '../stores.js';
import { messages as messagesService } from '../services/index.js';
import { messageTime } from '../services/datetime.js';
import { copyText } from '../services/copy-text.js';
import ContextMenu from './ContextMenu.vue';

const props = defineProps({ channel: Object });
const draft = ref(''); const files = ref([]); const replyTo = ref(null);
const editing = ref(null); const editText = ref('');
const listEl = ref(null); const composer = ref(null); const fileInput = ref(null);
const loadingMore = ref(false);

const messages = computed(() => store.messages[props.channel.id] || []);
const channelLabel = computed(() => props.channel.type === 'dm' ? 'DM' : '#' + props.channel.name);
const canModerate = computed(() => ['owner', 'admin', 'moderator'].includes(store.currentCommunity?.myRole));
const typingText = computed(() => {
  const t = store.typing[props.channel.id] || {};
  const names = Object.entries(t).filter(([, ts]) => Date.now() - ts < 5000).map(([uid]) => nameOf(uid));
  if (!names.length) return '';
  return names.join(', ') + (names.length > 1 ? ' estão digitando…' : ' está digitando…');
});

function nameOf(uid) {
  const m = store.members.find(m => m.user.id === uid);
  const dm = store.dms.flatMap(d => d.recipients).find(u => u.id === uid);
  return m?.user.displayName || dm?.displayName || 'alguém';
}
function isCompact(i) {
  if (i === 0) return false;
  const a = messages.value[i - 1], b = messages.value[i];
  const dt = b.createdAt - a.createdAt;
  return a.author.id === b.author.id && Number.isFinite(dt) && dt < 300_000 && !b.replyTo;
}
function fmtTime(ts) { return messageTime(ts); }
function fmtSize(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB'; }
function focusComposer() { nextTick(() => composer.value?.focus()); }

async function scrollBottom() { await nextTick(); if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight; }

async function send() {
  const content = draft.value.trim();
  if (!content && !files.value.length) return;
  const f = files.value; files.value = [];
  draft.value = '';
  try {
    await sendMessage(props.channel.id, content, { replyTo: replyTo.value?.id, files: f });
    replyTo.value = null;
    scrollBottom();
  } catch (e) { alert(e.message); }
}

let typingAt = 0;
function notifyTyping() {
  if (Date.now() - typingAt > 3000) { typingAt = Date.now(); messagesService.typing(props.channel.id); }
}

async function saveEdit(m) {
  await messagesService.edit(props.channel.id, m.id, { content: editText.value });
  editing.value = null;
}
async function del(m) {
  if (!confirm('Excluir esta mensagem?')) return;
  await messagesService.delete(props.channel.id, m.id);
}
async function pin(m) {
  if (m.pinned) await messagesService.unpin(props.channel.id, m.id);
  else await messagesService.pin(props.channel.id, m.id);
}
function react(m, emoji) { toggleReaction(m, emoji); }
function copyMessage(m) { copyText(m.content); }

const menu = ref({ open: false, x: 0, y: 0, msg: null });
const forwardMsg = ref(null); const forwardTarget = ref('');

const forwardTargets = computed(() => [
  ...store.dms.map(d => ({ id: d.id, label: d.type === 'group_dm' ? `👥 ${d.name}` : (d.recipients[0]?.displayName || d.name || 'DM') })),
  ...store.channels.filter(c => c.type === 'text').map(c => ({ id: c.id, label: `# ${c.name}` })),
]);

const menuItems = computed(() => {
  const m = menu.value.msg;
  if (!m) return [];
  const items = [
    { label: 'Responder', value: 'reply' },
    { label: 'Encaminhar', value: 'forward' },
    { label: 'Copiar texto', value: 'copy' },
  ];
  if (m.author.id === store.user.id) items.push({ label: 'Editar', value: 'edit' });
  if (canModerate.value || String(props.channel.type).includes('dm')) {
    items.push({ label: m.pinned ? 'Desafixar' : 'Fixar', value: 'pin' });
  }
  if (m.author.id === store.user.id || canModerate.value) {
    items.push({ label: 'Excluir mensagem', value: 'delete', danger: true });
  }
  return items;
});

function msgMenu(m, e) {
  if (e.target.closest('input, textarea, select, a')) return;
  menu.value = { open: true, x: e.clientX, y: e.clientY, msg: m };
}

function onMenuSelect(item) {
  const m = menu.value.msg;
  if (!m) return;
  if (item.value === 'reply') { replyTo.value = m; focusComposer(); }
  else if (item.value === 'forward') { forwardMsg.value = m; forwardTarget.value = ''; }
  else if (item.value === 'copy') copyMessage(m);
  else if (item.value === 'edit') { editing.value = m.id; editText.value = m.content; }
  else if (item.value === 'pin') pin(m);
  else if (item.value === 'delete') del(m);
}

async function confirmForward() {
  const m = forwardMsg.value;
  if (!m || !forwardTarget.value) return;
  const attachments = (m.attachments || []).map(a => ({ url: a.url, filename: a.filename, mime: a.mime, size: a.size }));
  try {
    await sendMessage(forwardTarget.value, m.content, { attachments });
    forwardMsg.value = null;
  } catch (e) { alert(e.message); }
}
function customReact(m) {
  const e = prompt('Emoji:');
  if (e) toggleReaction(m, e.trim());
}
async function toggleReaction(m, emoji) {
  const mine = m.reactions.find(r => r.emoji === emoji && r.users.includes(store.user.id));
  if (mine) await messagesService.unreact(props.channel.id, m.id, emoji);
  else await messagesService.react(props.channel.id, m.id, emoji);
}

async function onScroll() {
  if (listEl.value.scrollTop < 60 && !loadingMore.value && messages.value.length >= 50) {
    loadingMore.value = true;
    const oldest = messages.value[0];
    try {
      const r = await messagesService.list(props.channel.id, { before: oldest.id, limit: 50 });
      store.messages[props.channel.id] = [...r.messages, ...messages.value];
    } catch {}
    loadingMore.value = false;
  }
}

watch(() => props.channel.id, () => { replyTo.value = null; editing.value = null; menu.value.open = false; forwardMsg.value = null; scrollBottom(); });
watch(() => messages.value.length, () => scrollBottom());
onMounted(scrollBottom);
</script>

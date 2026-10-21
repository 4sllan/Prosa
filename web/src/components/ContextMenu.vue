<template>
  <div class="ctx-backdrop" @pointerdown="close" @contextmenu.prevent="close"></div>
  <div ref="menuEl" class="ctx-menu" role="menu" :style="menuStyle" @keydown="onMenuKeydown">
    <template v-for="(item, i) in items" :key="item.label || `sep${i}`">
      <div v-if="item.divider" class="ctx-sep" role="separator"></div>
      <button v-else role="menuitem" class="ctx-item" :class="{ danger: item.danger }" @click="pick(item)">
        {{ item.label }}
        <component :is="item.icon" v-if="item.icon" :size="16" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { menuPosition } from '../services/context-menu.js';

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  items: { type: Array, required: true }, // [{ label, danger?, value?, icon?, divider? }]
});
const emit = defineEmits(['close', 'select']);

const menuEl = ref(null);
const pos = ref(null);
const menuStyle = computed(() => pos.value
  ? { left: pos.value.x + 'px', top: pos.value.y + 'px' }
  : { left: '-9999px', top: '-9999px' });

function clamp() {
  const el = menuEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  pos.value = menuPosition({
    x: props.x, y: props.y, width: r.width, height: r.height,
    viewportW: window.innerWidth, viewportH: window.innerHeight,
  });
}

function close() { emit('close'); }
function pick(item) { emit('select', item); emit('close'); }

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); close(); }
}
function onMenuKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const els = [...menuEl.value.querySelectorAll('[role="menuitem"]')];
  if (!els.length) return;
  e.preventDefault();
  const i = els.indexOf(document.activeElement);
  const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
  els[next].focus();
}

onMounted(() => {
  clamp();
  menuEl.value?.querySelector('[role="menuitem"]')?.focus();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', close);
  window.removeEventListener('scroll', close, true);
});
</script>

<style scoped>
.ctx-backdrop { position: fixed; inset: 0; z-index: 60; }
.ctx-menu {
  position: fixed; z-index: 61; min-width: 268px; padding: 8px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  box-shadow: 0 20px 50px 0 rgba(0, 0, 0, 0.50);
  backdrop-filter: blur(12px);
  display: flex; flex-direction: column; gap: 2px;
}
.ctx-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  text-align: left; padding: 11px 12px; border-radius: 9px; font-size: 14px; color: var(--fg);
}
.ctx-item:hover, .ctx-item:focus-visible { background: var(--bg-input); outline: none; }
.ctx-item.danger { color: #F14A4A; }
.ctx-item.danger:hover, .ctx-item.danger:focus-visible { background: #f14a4a1a; color: #F14A4A; }
.ctx-sep { border-top: 1px solid var(--border); margin: 6px 4px; }
[data-theme="light"] .ctx-menu { background: rgba(255, 255, 255, 0.75); border-color: rgba(0, 0, 0, 0.08); }
</style>

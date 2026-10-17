<template>
  <div class="ctx-backdrop" @pointerdown="close" @contextmenu.prevent="close"></div>
  <div ref="menuEl" class="ctx-menu" role="menu" :style="menuStyle" @keydown="onMenuKeydown">
    <button v-for="item in items" :key="item.label" role="menuitem" class="ctx-item"
            :class="{ danger: item.danger }" @click="pick(item)">{{ item.label }}</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { menuPosition } from '../services/context-menu.js';

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  items: { type: Array, required: true }, // [{ label, danger?, value? }]
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
  position: fixed; z-index: 61; min-width: 160px; padding: 6px;
  background: var(--bg-side); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 16px 40px #0008; display: flex; flex-direction: column; gap: 2px;
}
.ctx-item { text-align: left; padding: 8px 10px; border-radius: 6px; font-size: 13px; color: var(--fg); }
.ctx-item:hover, .ctx-item:focus-visible { background: var(--accent); color: #fff; outline: none; }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover, .ctx-item.danger:focus-visible { background: var(--danger); color: #fff; }
</style>

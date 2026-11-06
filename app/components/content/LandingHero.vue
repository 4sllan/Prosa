<script setup lang="ts">
const hero = useTemplateRef<HTMLElement>('hero')
useLandingReveal(hero)

const { data: releases } = await useAsyncData('landing-releases', () =>
  queryCollection('releases').order('date', 'DESC').all()
)

const latestRelease = computed(() => releases.value?.find(release =>
  release.prerelease !== true
  && release.tag?.trim()
  && release.date
  && Number.isFinite(new Date(release.date).getTime())
))
</script>

<template>
  <section ref="hero" class="landing-hero" aria-labelledby="landing-title">
    <div class="hero-stage">
      <div class="hero-copy">
        <NuxtLink
          v-if="latestRelease"
          :to="latestRelease.path"
          class="version-badge"
          data-landing-reveal
        >
          <span class="version-dot" aria-hidden="true" />
          Versão {{ latestRelease.tag }} disponível
        </NuxtLink>
        <h1 id="landing-title" data-landing-reveal style="--landing-reveal-delay: 60ms">
          Onde a conversa<br>
          <span>acontece.</span>
        </h1>
        <p class="hero-description" data-landing-reveal style="--landing-reveal-delay: 120ms">
          Acompanhe cada evolução do Prosa. Melhorias contínuas para
          uma experiência de comunidade sem barreiras.
        </p>
        <div class="hero-actions" data-landing-reveal style="--landing-reveal-delay: 180ms">
          <DownloadButton class="hero-download" />
          <NuxtLink to="/introducao" class="hero-introduction">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M3 4.5h5.5A1.5 1.5 0 0 1 10 6v10a2 2 0 0 0-2-2H3V4.5Zm14 0h-5.5A1.5 1.5 0 0 0 10 6v10a2 2 0 0 1 2-2h5V4.5Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
            </svg>
            Introdução
          </NuxtLink>
        </div>
      </div>

      <div class="floating-message" aria-hidden="true" data-landing-reveal="art" style="--landing-reveal-delay: 240ms">
        <span class="message-avatar">P</span>
        <span class="message-line" />
        <span class="message-line wide" />
        <span class="message-line short" />
      </div>

      <div class="chat-preview" aria-hidden="true" data-landing-reveal="art" style="--landing-reveal-delay: 240ms">
        <div class="preview-toolbar">
          <div class="window-controls">
            <i /><i /><i />
          </div>
          <span class="toolbar-line" />
        </div>
        <div class="preview-body">
          <div class="preview-sidebar">
            <span class="sidebar-line" />
            <span class="sidebar-line" />
            <span class="sidebar-line selected" />
            <span class="sidebar-line" />
          </div>
          <div class="preview-messages">
            <div v-for="item in 3" :key="item" class="preview-message">
              <span class="preview-avatar" />
              <div class="preview-lines">
                <span /><span /><span />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.landing-hero {
  --hero-accent: #a12cf1;
  --hero-text: #f5f3f7;
  --hero-muted: #a1a0ab;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding-inline: max(24px, calc((100% - 1280px) / 2));
  color: var(--hero-text);
  background:
    radial-gradient(ellipse at 0 100%, #461169 0, transparent 32%),
    radial-gradient(ellipse at 100% 100%, #461169 0, transparent 32%),
    #000;
}

.hero-stage {
  position: relative;
  min-height: 845px;
  overflow: hidden;
  padding: 40px 32px 0;
  background:
    radial-gradient(ellipse at 32% 0, #271137 0, transparent 52%),
    radial-gradient(ellipse at 70% 95%, #1c1029 0, transparent 45%),
    #09090b;
}

.hero-copy {
  position: relative;
  z-index: 2;
  max-width: 760px;
  margin-inline: auto;
  text-align: center;
}

.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 6px 17px;
  border: 1px solid #70339a80;
  border-radius: 999px;
  color: #c575ff;
  background: #21102e80;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  line-height: 1.4;
  text-transform: uppercase;
}

.version-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 10px #a12cf180;
}

h1 {
  margin: 26px 0 0;
  color: #e8dfef;
  font-size: clamp(44px, 5.1vw, 74px);
  font-weight: 800;
  letter-spacing: -3.5px;
  line-height: 1.07;
}

h1 span { color: var(--hero-accent); }

.hero-description {
  max-width: 610px;
  margin: 36px auto 0;
  color: var(--hero-muted);
  font-size: 20px;
  line-height: 1.65;
  text-wrap: pretty;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  margin-top: 48px;
}

.hero-download,
.hero-introduction {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 60px;
  padding: 16px 38px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.4;
  text-decoration: none;
  transition: background-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.hero-download {
  color: #fff;
  background: var(--hero-accent);
  box-shadow: 0 0 25px #a12cf130;
}

.hero-download:hover {
  background: #b14bf8;
  box-shadow: 0 0 30px #a12cf150;
}

.hero-introduction {
  border-color: #414045;
  color: var(--hero-text);
  background: #ffffff08;
}

.hero-introduction:hover { background: #ffffff12; }
.hero-introduction svg { width: 18px; height: 18px; }

@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .hero-download:hover, .hero-introduction:hover { transform: translateY(-3px); }
}

@media (prefers-reduced-motion: no-preference) {
  .hero-download:active, .hero-introduction:active { transform: scale(.98); }
}

.version-badge:focus-visible,
.hero-download:focus-visible,
.hero-introduction:focus-visible {
  outline: 3px solid #d4a0ff;
  outline-offset: 5px;
}

.floating-message {
  position: absolute;
  z-index: 1;
  top: 30px;
  right: 18%;
  display: grid;
  grid-template-columns: 32px 1fr;
  align-items: center;
  gap: 10px;
  width: 193px;
  padding: 16px;
  border: 1px solid #ffffff14;
  border-radius: 18px;
  background: linear-gradient(135deg, #ffffff08, #19161c);
  box-shadow: 0 16px 40px #0003;
}

.message-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 2px solid #b08bdd;
  border-radius: 50%;
  color: #ece1ff;
  background: linear-gradient(135deg, #9673b6, #30233f);
  font-size: 13px;
  font-weight: 700;
}

.message-line {
  width: 65%;
  height: 7px;
  border-radius: 8px;
  background: #ffffff30;
}

.message-line.wide { grid-column: 1 / -1; width: 100%; opacity: .5; }
.message-line.short { grid-column: 1 / -1; width: 75%; opacity: .4; }

.chat-preview {
  position: relative;
  width: min(100%, 736px);
  height: 365px;
  margin: 80px auto -80px;
  overflow: hidden;
  border: 1px solid #ffffff1c;
  border-radius: 26px 26px 0 0;
  background: linear-gradient(140deg, #131315, #0c0c0f);
  mask-image: linear-gradient(#000 45%, transparent);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding-inline: 32px;
  border-bottom: 1px solid #ffffff08;
}

.window-controls { display: flex; gap: 12px; }
.window-controls i { width: 12px; height: 12px; border-radius: 50%; background: #8d3037; }
.window-controls i:nth-child(2) { background: #8e720e; }
.window-controls i:nth-child(3) { background: #1f7544; }
.toolbar-line { width: 128px; height: 12px; border-radius: 8px; background: #ffffff0d; }
.preview-body { display: grid; grid-template-columns: 30% 1fr; padding: 24px 32px; }
.preview-sidebar { display: flex; flex-direction: column; gap: 16px; padding-right: 24px; border-right: 1px solid #ffffff08; }
.sidebar-line { width: 100%; height: 16px; border-radius: 10px; background: #ffffff1a; }
.sidebar-line:nth-child(2) { width: 84%; opacity: .6; }
.sidebar-line.selected { border: 1px solid #a12cf150; background: #a12cf133; }
.sidebar-line:last-child { width: 66%; opacity: .4; }
.preview-messages { display: grid; gap: 24px; padding-left: 24px; }
.preview-message { display: flex; gap: 16px; }
.preview-avatar { flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; background: #ffffff1a; }
.preview-lines { display: grid; flex: 1; gap: 8px; padding-top: 3px; }
.preview-lines span { height: 12px; border-radius: 8px; background: #ffffff0e; }
.preview-lines span:first-child { width: 25%; background: #ffffff30; }
.preview-lines span:last-child { width: 67%; opacity: .7; }

@media (max-width: 1023px) {
  .floating-message { right: 4%; opacity: .45; }
  .hero-copy { z-index: 2; }
  h1 { letter-spacing: -2.5px; }
}

@media (max-width: 600px) {
  .landing-hero { padding-inline: 16px; }
  .hero-stage { min-height: 730px; padding: 36px 16px 0; }
  .floating-message { display: none; }
  .version-badge { padding-inline: 12px; font-size: 9px; letter-spacing: 1px; }
  h1 { margin-top: 30px; font-size: clamp(36px, 9.6vw, 56px); letter-spacing: -1.8px; }
  .hero-description { margin-top: 26px; font-size: 16px; }
  .hero-actions { gap: 12px; margin-top: 32px; }
  .hero-download, .hero-introduction { min-height: 52px; padding: 14px 24px; font-size: 15px; }
  .chat-preview { height: 280px; margin-top: 56px; border-radius: 18px 18px 0 0; }
  .preview-toolbar { height: 48px; padding-inline: 18px; }
  .toolbar-line { width: 70px; }
  .window-controls { gap: 7px; }
  .window-controls i { width: 8px; height: 8px; }
  .preview-body { padding: 20px 18px; }
  .preview-sidebar { gap: 12px; padding-right: 14px; }
  .sidebar-line { height: 12px; }
  .preview-messages { padding-left: 14px; gap: 22px; }
  .preview-message { gap: 10px; }
  .preview-avatar { width: 26px; height: 26px; }
  .preview-lines { gap: 6px; }
  .preview-lines span { height: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-download, .hero-introduction { transition: none; }
}
</style>

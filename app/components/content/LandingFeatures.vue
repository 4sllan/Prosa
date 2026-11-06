<script setup lang="ts">
const features = useTemplateRef<HTMLElement>('features')
useLandingReveal(features)
</script>

<template>
  <div ref="features" class="landing-features">
    <section class="feature-section" aria-labelledby="releases-heading">
      <div class="feature-grid">
        <div class="feature-copy">
          <span class="feature-badge" data-landing-reveal>Sempre evoluindo</span>
          <h2 id="releases-heading" data-landing-reveal style="--landing-reveal-delay: 60ms">
            Cada novidade do Prosa,<br>em um s&oacute; lugar
          </h2>
          <p class="section-description" data-landing-reveal style="--landing-reveal-delay: 120ms">
            Melhorias, corre&ccedil;&otilde;es e novas possibilidades para suas
            conversas. Acompanhe o que mudou no Prosa, direto da fonte e
            a cada nova vers&atilde;o.
          </p>
          <ul class="feature-list compact">
            <li data-landing-reveal style="--landing-reveal-delay: 160ms">
              <span class="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="m12 3 2.6 5.4 6 .9-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2 6-.9L12 3Z" />
                </svg>
              </span>
              <div>
                <h3>Uma p&aacute;gina por vers&atilde;o</h3>
                <p>Novidades e corre&ccedil;&otilde;es com todos os detalhes.</p>
              </div>
            </li>
            <li data-landing-reveal style="--landing-reveal-delay: 200ms">
              <span class="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 5h10v4H4zM10 15h10v4H10zM7 9v8h3M17 15V7h-3" />
                </svg>
              </span>
              <div>
                <h3>Todo o hist&oacute;rico, conectado</h3>
                <p>Compare vers&otilde;es e acompanhe a evolu&ccedil;&atilde;o.</p>
              </div>
            </li>
          </ul>
        </div>
        <div class="community-visual" aria-hidden="true" data-landing-reveal="art" style="--landing-reveal-delay: 120ms">
          <LandingCommunityArt />
          <div class="activity-card">
            <span class="activity-symbol">+</span>
            <div>
              <span>A cada nova release</span>
              <strong>Mais uma boa novidade</strong>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="feature-section workspace-section" aria-labelledby="updates-heading">
      <div class="feature-grid">
        <div class="feature-copy">
          <h2 id="updates-heading" class="secondary-title" data-landing-reveal>
            Atualizar ficou mais simples
          </h2>
          <p class="section-description secondary-description" data-landing-reveal style="--landing-reveal-delay: 80ms">
            Tudo o que importa para acompanhar o seu Prosa.
          </p>
          <ul class="feature-list spacious">
            <li data-landing-reveal style="--landing-reveal-delay: 120ms">
              <span class="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01" />
                </svg>
              </span>
              <div>
                <h3>Notas organizadas</h3>
                <p>
                  Melhorias, corre&ccedil;&otilde;es e contribuidores.
                  Cada mudan&ccedil;a no seu devido lugar.
                </p>
              </div>
            </li>
            <li data-landing-reveal style="--landing-reveal-delay: 160ms">
              <span class="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h5V4Z" />
                </svg>
              </span>
              <div>
                <h3>Documenta&ccedil;&atilde;o sempre &agrave; m&atilde;o</h3>
                <p>
                  Encontre a introdu&ccedil;&atilde;o, navegue pelas vers&otilde;es
                  e conhe&ccedil;a cada atualiza&ccedil;&atilde;o.
                </p>
              </div>
            </li>
            <li data-landing-reveal style="--landing-reveal-delay: 200ms">
              <span class="feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
                </svg>
              </span>
              <div>
                <h3>Downloads direto da fonte</h3>
                <p>
                  Acesse os instaladores dispon&iacute;veis para macOS,
                  Windows e Linux nas releases oficiais.
                </p>
              </div>
            </li>
          </ul>
        </div>
        <div class="workspace-visual" aria-hidden="true" data-landing-reveal="art" style="--landing-reveal-delay: 120ms">
          <LandingWorkspaceArt />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing-features {
  --feature-accent: #a12cf1;
  --feature-muted: #a1a0ab;
  overflow: clip;
  color: #f6f5f7;
  background: var(--prosa-background);
}

.feature-section { padding: 120px 32px; }

.feature-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 80px;
  max-width: 1280px;
  margin-inline: auto;
}

.feature-badge {
  display: inline-block;
  margin-bottom: 26px;
  padding: 6px 16px;
  border: 1px solid #a12cf138;
  border-radius: 999px;
  color: #c575ff;
  background: #a12cf10c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #f6f5f7;
  font-size: clamp(32px, 3.4vw, 48px);
  font-weight: 750;
  letter-spacing: -1.2px;
  line-height: 1.16;
  text-wrap: balance;
}

.section-description {
  margin: 26px 0 0;
  color: var(--feature-muted);
  font-size: 20px;
  line-height: 1.65;
  text-wrap: pretty;
}

.feature-list {
  display: grid;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;
}

.feature-list li { display: flex; align-items: flex-start; gap: 16px; }
.compact { gap: 22px; }
.spacious { gap: 38px; margin-top: 52px; }
.feature-list h3 { margin: 0; color: #f3f2f5; font-size: 17px; font-weight: 600; line-height: 1.5; }
.feature-list p { margin: 6px 0 0; color: var(--feature-muted); font-size: 16px; line-height: 1.6; }
.compact p { margin-top: 2px; font-size: 14px; }

.feature-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 42px;
  height: 46px;
  border: 1px solid #ffffff0e;
  border-radius: 9px;
  color: var(--feature-accent);
  background: #ffffff04;
}

.compact .feature-icon { width: 40px; height: 40px; background: #a12cf111; border-color: #a12cf12a; }
.feature-icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.secondary-title { font-size: 36px; letter-spacing: -.8px; }
.secondary-description { font-size: 18px; margin-top: 22px; }

.community-visual,
.workspace-visual {
  position: relative;
  min-width: 0;
  isolation: isolate;
}

.community-visual::before,
.workspace-visual::before {
  position: absolute;
  z-index: -1;
  inset: -80px -50px;
  background: radial-gradient(ellipse, #620c802b, transparent 68%);
  content: '';
  pointer-events: none;
}

.community-visual > :first-child { display: block; width: 100%; height: auto; border: 1px solid #ffffff1c; border-radius: 32px; }
.workspace-visual > :first-child { display: block; width: 100%; height: auto; }

.activity-card {
  position: absolute;
  right: -24px;
  bottom: -22px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 18px;
  border: 1px solid #a12cf150;
  border-radius: 16px;
  background: #1b191e;
  box-shadow: 0 12px 40px #0008;
}

.activity-symbol { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; background: linear-gradient(135deg, #c676ff, #9530e6); font-size: 24px; }
.activity-card div { display: grid; gap: 3px; }
.activity-card span:not(.activity-symbol) { color: #b3afbc; font-size: 11px; }
.activity-card strong { color: #f6f5f7; font-size: 14px; font-weight: 600; }

@media (max-width: 1100px) {
  .feature-grid { gap: 48px; }
  .feature-section { padding-block: 90px; }
  .section-description { font-size: 18px; }
  .secondary-title { font-size: 30px; }
  .feature-list p { font-size: 15px; }
  .spacious { gap: 28px; margin-top: 36px; }
  .activity-card { right: -12px; }
}

@media (max-width: 767px) {
  .feature-section { padding: 76px 24px; }
  .feature-grid { grid-template-columns: minmax(0, 1fr); gap: 48px; }
  h2 { font-size: 34px; letter-spacing: -.8px; }
  .secondary-title { font-size: 30px; }
  .feature-badge { margin-bottom: 22px; }
  .section-description { margin-top: 22px; font-size: 17px; }
  .feature-list { margin-top: 30px; }
  .community-visual, .workspace-visual { max-width: 600px; width: 100%; margin-inline: auto; }
  .community-visual::before, .workspace-visual::before { inset: -40px -20px; }
  .community-visual > :first-child { border-radius: 22px; }
  .activity-card { right: -8px; bottom: -18px; padding: 12px; }
  .activity-symbol { width: 34px; height: 34px; }
  .activity-card strong { font-size: 12px; }
}
</style>

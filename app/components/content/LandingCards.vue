<script setup lang="ts">
const cards = useTemplateRef<HTMLElement>('cards')
useLandingReveal(cards)
</script>

<template>
  <section ref="cards" class="landing-cards" aria-labelledby="cards-heading">
    <div class="cards-container">
      <div class="cards-heading">
        <h2 id="cards-heading" data-landing-reveal>Tudo para acompanhar o Prosa</h2>
        <p data-landing-reveal style="--landing-reveal-delay: 80ms">
          Cada melhoria tem uma hist&oacute;ria. Explore as novidades,
          acompanhe as vers&otilde;es e encontre tudo direto da fonte.
        </p>
      </div>
      <div class="cards-grid">
        <article class="technology-card" data-landing-reveal>
          <span class="card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m14 3-9 11h7l-2 7 9-11h-7l2-7Z" />
            </svg>
          </span>
          <h3>Sempre atualizado</h3>
          <p>
            As notas chegam a cada release publicada no GitHub.
            Novidades, melhorias e corre&ccedil;&otilde;es, sem perder nada.
          </p>
        </article>
        <article class="technology-card" data-landing-reveal style="--landing-reveal-delay: 90ms">
          <span class="card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 11a9 9 0 1 1 2.7 7.4M3 4v7h7M12 7v5l3 2" />
            </svg>
          </span>
          <h3>Hist&oacute;rico completo</h3>
          <p>
            Uma p&aacute;gina para cada vers&atilde;o. Consulte as mudan&ccedil;as,
            compare releases e acompanhe o caminho que nos trouxe at&eacute; aqui.
          </p>
        </article>
        <article class="technology-card" data-landing-reveal style="--landing-reveal-delay: 180ms">
          <span class="card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M8 6h8M12 6v12m-4 0h8M5 6h.01M19 6h.01M5 18h.01M19 18h.01" />
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
            </svg>
          </span>
          <h3>Direto da fonte</h3>
          <p>
            Acesse a release oficial no GitHub, com as notas,
            os instaladores dispon&iacute;veis e todos os detalhes da atualiza&ccedil;&atilde;o.
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.landing-cards {
  padding: 120px 32px 140px;
  color: #f5f3f7;
  background: #000;
}

.cards-container { max-width: 1280px; margin-inline: auto; }
.cards-heading { max-width: 680px; margin-inline: auto; text-align: center; }
.cards-heading h2 { margin: 0; color: #f5f3f7; font-size: 36px; font-weight: 700; letter-spacing: -.7px; line-height: 1.25; text-wrap: balance; }
.cards-heading p { margin: 28px 0 0; color: #a1a0ab; font-size: 17px; line-height: 1.6; text-wrap: pretty; }
.cards-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; margin-top: 80px; }

.technology-card {
  min-width: 0;
  min-height: 308px;
  padding: 40px;
  border: 1px solid #ffffff12;
  border-radius: 24px;
  background: linear-gradient(145deg, #0c0b0e, #090909 70%);
}

@media (prefers-reduced-motion: no-preference) {
  .technology-card { transition: translate 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
}

@media (hover: hover) and (pointer: fine) {
  .technology-card:hover { border-color: #a12cf160; box-shadow: 0 12px 30px #a12cf10c; }
}

@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  /* Keep hover translation independent of the entry animation's transform. */
  .technology-card:hover { translate: 0 -4px; }
}

.card-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 16px; color: #ad3bfa; background: #a12cf112; }
.card-icon svg { width: 30px; height: 30px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.technology-card:first-child svg { fill: currentColor; stroke: none; }
.technology-card h3 { margin: 36px 0 0; color: #f5f3f7; font-size: 23px; font-weight: 650; letter-spacing: -.3px; line-height: 1.3; }
.technology-card p { margin: 18px 0 0; color: #a1a0ab; font-size: 16px; line-height: 1.65; }

@media (max-width: 1100px) {
  .landing-cards { padding-block: 90px 100px; }
  .cards-grid { gap: 20px; margin-top: 60px; }
  .technology-card { padding: 28px; }
  .technology-card h3 { font-size: 21px; }
}

@media (max-width: 767px) {
  .landing-cards { padding: 70px 24px 80px; }
  .cards-heading h2 { font-size: 30px; }
  .cards-heading p { margin-top: 22px; font-size: 16px; }
  .cards-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; margin-top: 40px; }
  .technology-card { min-height: 0; padding: 32px; }
  .technology-card h3 { margin-top: 28px; font-size: 23px; }
}
</style>

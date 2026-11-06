<script setup lang="ts">
const { footer } = useAppConfig()
const logoSrc = `${useRuntimeConfig().app.baseURL}logotipo-prosa.png`
</script>

<template>
  <footer class="landing-footer">
    <div class="footer-container">
      <div class="footer-grid">
        <div class="footer-brand">
          <NuxtLink to="/" class="brand-link" aria-label="Prosa - P&aacute;gina inicial">
            <img :src="logoSrc" alt="" width="40" height="40" loading="lazy" decoding="async">
            <span>Prosa</span>
          </NuxtLink>
          <p>
            Cada conversa, uma nova possibilidade.
            Acompanhe as novidades, conhe&ccedil;a as vers&otilde;es e
            fa&ccedil;a parte da evolu&ccedil;&atilde;o do Prosa.
          </p>
          <div class="footer-socials">
            <a
              href="https://github.com/4sllan/Prosa"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Prosa no GitHub (abre em nova aba)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.61-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
            </a>
            <span class="social-pending" role="img" aria-label="X: em breve" title="X: em breve">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m4 3 12 18h4L8 3H4Zm0 18L20 3" fill="none" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </span>
            <span class="social-pending" role="img" aria-label="LinkedIn: em breve" title="LinkedIn: em breve">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 9v12M5 3v1m6 17V9m0 5c0-6 8-6 8 0v7" fill="none" stroke="currentColor" stroke-width="3" />
              </svg>
            </span>
          </div>
        </div>

        <nav aria-labelledby="footer-platform">
          <h2 id="footer-platform">Plataforma</h2>
          <ul>
            <li><NuxtLink to="/releases">Recursos</NuxtLink></li>
            <li><span class="footer-pending">Seguran&ccedil;a <small>Em breve</small></span></li>
            <li><span class="footer-pending">Pre&ccedil;os <small>Em breve</small></span></li>
            <li><NuxtLink to="/download">Download</NuxtLink></li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-resources">
          <h2 id="footer-resources">Recursos</h2>
          <ul>
            <li><NuxtLink to="/introducao">Documenta&ccedil;&atilde;o</NuxtLink></li>
            <li><span class="footer-pending">Blog <small>Em breve</small></span></li>
            <li><NuxtLink to="/releases">Notas de vers&atilde;o</NuxtLink></li>
            <li>
              <a
                href="https://github.com/4sllan/Prosa/issues"
                target="_blank"
                rel="noopener noreferrer"
              >Suporte<span class="sr-only"> (abre em nova aba)</span></a>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-legal">
          <h2 id="footer-legal">Legal</h2>
          <ul>
            <li><span class="footer-pending">Privacidade <small>Em breve</small></span></li>
            <li><span class="footer-pending">Termos <small>Em breve</small></span></li>
            <li><span class="footer-pending">Cookies <small>Em breve</small></span></li>
          </ul>
        </nav>
      </div>
      <div class="footer-bottom">
        <p>{{ footer.credits }}. Todos os direitos reservados.</p>
        <p>Feito com paix&atilde;o por boas conversas.</p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.landing-footer { padding: 80px 32px 0; color: #a1a0ab; background: #000; }
.footer-container { max-width: 1280px; margin-inline: auto; }
.footer-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 80px; padding-bottom: 80px; }
.brand-link { display: inline-flex; align-items: center; gap: 9px; border-radius: 6px; color: #f5f3f7; font-size: 20px; font-weight: 700; text-decoration: none; }
.brand-link img { width: 36px; height: 36px; object-fit: contain; }
.footer-brand > p { max-width: 245px; margin: 24px 0 0; font-size: 14px; line-height: 1.75; }
.footer-socials { display: flex; gap: 14px; margin-top: 24px; }
.footer-socials a, .social-pending { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid #ffffff12; border-radius: 50%; color: #a1a0ab; background: #ffffff03; }
.footer-socials svg { width: 17px; height: 17px; fill: currentColor; }
.social-pending { color: #66646f; }
nav h2 { margin: 5px 0 28px; color: #f5f3f7; font-size: 16px; font-weight: 600; line-height: 1.4; }
nav ul { display: grid; gap: 20px; margin: 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.5; }
nav a { color: #a1a0ab; text-decoration: none; }
nav a:hover, .footer-socials a:hover { color: #e3beff; }
.footer-pending { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; color: #8c8995; }
.footer-pending small { color: #8c8995; font-size: 10px; white-space: nowrap; }
.landing-footer a:focus-visible { outline: 3px solid #d4a0ff; outline-offset: 5px; border-radius: 4px; }
.footer-bottom { display: flex; justify-content: space-between; gap: 24px; padding-block: 32px 38px; border-top: 1px solid #ffffff0d; }
.footer-bottom p { margin: 0; font-size: 12px; line-height: 1.6; }

@media (max-width: 1100px) {
  .footer-grid { gap: 40px; }
}

@media (max-width: 767px) {
  .landing-footer { padding: 40px 24px 0; }
  .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px 24px; padding-bottom: 48px; }
  .footer-brand { grid-column: 1 / -1; }
  .footer-brand > p { max-width: 320px; }
  nav h2 { margin-bottom: 22px; }
  nav ul { gap: 18px; }
  .footer-bottom { flex-direction: column; gap: 12px; padding-block: 24px 32px; }
}
</style>

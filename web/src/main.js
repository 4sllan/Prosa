import { createApp } from 'vue';
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import AuthView from './views/AuthView.vue';
import HomeView from './views/HomeView.vue';
import { store, bootstrap } from './stores.js';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './style.css';

const router = createRouter({
  // file:// (Electron empacotado) precisa de hash history; web dev/prod usa history normal
  history: location.protocol === 'file:' ? createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/login', component: AuthView, meta: { public: true } },
    { path: '/', component: HomeView },
    { path: '/channels/:channelId', component: HomeView },
  ],
});

router.beforeEach((to) => {
  if (!store.ready) return true; // resolved after bootstrap in App
  if (!store.user && !to.meta.public) return '/login';
  if (store.user && to.path === '/login') return '/';
});

createApp(App).use(router).mount('#app');

// após o bootstrap, reconcilia a rota com o estado de sessão —
// o guard só roda em navegações, então um hash antigo (ex.: #/login)
// deixaria a tela errada visível mesmo com identidade válida.
bootstrap().then(() => {
  const to = router.currentRoute.value;
  if (store.user && to.path === '/login') router.replace('/');
  else if (!store.user && !to.meta.public) router.replace('/login');
});

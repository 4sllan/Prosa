import { createApp } from 'vue';
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import AuthView from './views/AuthView.vue';
import HomeView from './views/HomeView.vue';
import { store, bootstrap } from './stores.js';
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

bootstrap();

createApp(App).use(router).mount('#app');

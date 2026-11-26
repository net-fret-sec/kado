import { localAdminToolsEnabled } from '../local-admin-tools'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ExchangesView from '../views/ExchangesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    if (to.name === 'terms' || to.name === 'privacy') return savedPosition ?? { top: 0 }
  },
  routes: [
    {
      path: '/conditions-utilisation',
      name: 'terms',
      component: () => import('../views/LegalView.vue'),
      props: { document: 'conditions-utilisation' },
    },
    {
      path: '/confidentialite',
      name: 'privacy',
      component: () => import('../views/LegalView.vue'),
      props: { document: 'confidentialite' },
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/exchanges',
      name: 'exchanges',
      component: ExchangesView,
      beforeEnter: () => (localAdminToolsEnabled ? true : { name: 'home' }),
    },
    {
      path: '/exchanges/:id',
      name: 'exchange-detail',
      component: () => import('../views/ExchangeDetailView.vue'),
      props: true,
    },
    {
      path: '/p/:token',
      name: 'participant-self',
      component: () => import('../views/ParticipantSelfView.vue'),
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
})

export default router

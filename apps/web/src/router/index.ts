import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ExchangesView from '../views/ExchangesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/exchanges',
      name: 'exchanges',
      component: ExchangesView,
    },
    {
      path: '/exchanges/:id',
      name: 'exchange-detail',
      component: () => import('../views/ExchangeDetailView.vue'),
      props: true,
    },
  ],
})

export default router

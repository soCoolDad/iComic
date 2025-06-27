import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/download',
    name: 'download',
    component: () => import('../views/download.vue')
  },
  {
    path: '/download_task',
    name: 'download_task',
    component: () => import('../views/download_task.vue')
  },
  {
    path: '/update',
    name: 'update',
    component: () => import('../views/update.vue')
  },
  {
    path: "/",
    name: "home",
    component: () => import("../views/library.vue")
  },
  {
    path: "/library",
    name: "library",
    component: () => import("../views/library.vue")
  },
  {
    path: "/plugin",
    name: "plugin",
    component: () => import("../views/plugin.vue")
  },
  {
    path: "/setting",
    name: "setting",
    component: () => import("../views/setting.vue")
  },
  {
    path: "/reader",
    name: "reader",
    component: () => import("../views/reader.vue")
  }

  // 可继续添加其他路由
]

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router
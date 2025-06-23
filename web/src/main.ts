import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/display.css'
import router from './router'
import pinia from './store'
import { createI18n } from 'vue-i18n';

import g from './units/public'

const app = createApp(App)

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || 'lang_zh_cn', // 默认语言
  messages: {}
});

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component as any);
}

app.use(ElementPlus)
app.use(router)
app.use(pinia)
app.use(g)
app.use(i18n as any);
app.mount('#app')

export { i18n }; 
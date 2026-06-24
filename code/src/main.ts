import { createApp } from 'vue'
import './index.css'
import App from './App.vue'
import { registerSW } from 'virtual:pwa-register'

// Enregistrement automatique du Service Worker de la PWA
registerSW({ immediate: true })

createApp(App).mount('#app')

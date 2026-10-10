import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { SEEK_MATCHES } from './src/core/seek-url';
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    minimum_chrome_version: '116',
    permissions: ['storage', 'sidePanel', 'alarms'],
    host_permissions: [...SEEK_MATCHES, 'https://data.nzaei.zemo.bio/*'],
    action: { default_title: '__MSG_openSettings__' },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src 'self' https://data.nzaei.zemo.bio",
    },
  },
});

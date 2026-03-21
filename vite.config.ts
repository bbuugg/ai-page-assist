import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const wrapContentIIFE = () => ({
  name: 'wrap-content-iife',
  closeBundle() {
    const path = 'plugin/content.js';
    const code = readFileSync(path, 'utf-8');
    writeFileSync(path, `(()=>{${code}})();`);
  },
});

const copyIcons = () => ({
  name: 'copy-icons',
  closeBundle() {
    mkdirSync('plugin/icons', { recursive: true });
    for (const size of [16, 32, 48, 128]) {
      copyFileSync(`icons/${size}.png`, `plugin/icons/${size}.png`);
    }
    copyFileSync('manifest.json', 'plugin/manifest.json');
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), wrapContentIIFE(), copyIcons()],
  base: './',
  resolve: {
    alias: {
      '@/components/ui': resolve(__dirname, 'src/overlay/components/ui'),
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'plugin',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, 'overlay.html'),
        content: resolve(__dirname, 'src/content/content.ts'),
        background: resolve(__dirname, 'src/background/background.ts'),
        'content-style': resolve(__dirname, 'src/content/content.css'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (['content', 'background'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'content-style.css') return 'content.css';
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});

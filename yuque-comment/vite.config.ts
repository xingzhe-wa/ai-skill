import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(projectRoot, 'popup.html'),
        options: resolve(projectRoot, 'options.html'),
        background: resolve(projectRoot, 'src/background.ts'),
        content: resolve(projectRoot, 'src/content-script.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') {
            return 'background.js';
          }
          if (chunk.name === 'content') {
            return 'content-script.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});

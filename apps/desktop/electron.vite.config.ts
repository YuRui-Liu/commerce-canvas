import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: { build: { outDir: 'dist/main', rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts'), utility: resolve(__dirname, 'src/main/utility.ts') }, external: ['sharp'] } } },
  preload: { build: { outDir: 'dist/preload', rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } } },
  renderer: { root: 'src/renderer', plugins: [react()], build: { outDir: resolve(__dirname, 'dist/renderer'), rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } } },
});

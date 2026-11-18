import { datadogVitePlugin } from '@datadog/electron-sdk/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  logLevel: 'info',
  plugins: [datadogVitePlugin({ copyRuntimeDependencies: true })],
  build: {
    ssr: 'src/main.mjs',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'main.mjs' } },
  },
});

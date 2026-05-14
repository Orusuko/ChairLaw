import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub project pages: https://<user>.github.io/<repo>/
// CI establece BASE_PATH (ver .github/workflows). En local: / en dev, /ChairLaw/ en build.
export default defineConfig(({ command, mode }) => {
  const isDevServer = command === 'serve' && mode === 'development';
  const raw =
    process.env.BASE_PATH ||
    (isDevServer ? '/' : '/ChairLaw/');
  const base = raw.endsWith('/') ? raw : `${raw}/`;

  return {
    base,
    plugins: [react()],
  };
});

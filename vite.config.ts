import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relativ base gör att bygget fungerar på GitHub Pages oavsett reponamn
// (https://<användare>.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
});

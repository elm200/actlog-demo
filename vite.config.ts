import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': at('.') },
  },

  build: {
    // 入口のHTMLは index.html の1枚(記録と集計はreact-routerがクライアント側で切り替える)。
    // 代わりに vercel.json の rewrite が `/dashboard` に index.html を返す。
    // **クライアント側のルートを増やしたら、あちらにも1行足すこと**
    // (足さないと直接開いた・リロードしたときだけ404になる)
    rollupOptions: {
      input: {
        main: at('index.html'),
      },
    },
  },
});

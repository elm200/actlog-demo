import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { App } from './App';

// エントリは5行に保つこと。ここにURLの解釈や初期化のロジックを書き始めると、
// 構成を変えたくなったときに行き場を失う(ルーティングは src/App.tsx の担当)。
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

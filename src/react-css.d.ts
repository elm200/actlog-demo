import 'react';

/**
 * CSSカスタムプロパティ(`--cat-color`)をstyle属性で渡すため。
 * Reactは実行時には受け付けるが、既定の型定義には含まれていない。
 */
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

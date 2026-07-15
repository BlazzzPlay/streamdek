import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/plugin.ts',
  output: {
    file: 'com.streamdek.controller.sdPlugin/bin/plugin.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    resolve(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      outDir: undefined,
      declaration: false,
    }),
  ],
  external: [
    '@elgato/streamdeck',
  ],
};

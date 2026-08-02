import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // @anthropic-ai/claude-agent-sdk ships ESM-only (sdk.mjs); it can't be
    // left as an external require() in the CJS main bundle, so bundle it in.
    plugins: [externalizeDepsPlugin({ exclude: ['@anthropic-ai/claude-agent-sdk'] })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})

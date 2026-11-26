import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

test('选择四星连续点亮前四颗，保留五个可访问的评分选项', async (t) => {
  const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  t.after(() => server.close())
  const { default: StarRating } = await server.ssrLoadModule('/src/components/common/StarRating.vue')
  const html = await renderToString(createSSRApp(StarRating, { modelValue: 4, name: 'rating' }))
  assert.equal([...html.matchAll(/class="[^"]*\blit\b[^"]*"/g)].length, 4)
  assert.equal([...html.matchAll(/type="radio"/g)].length, 5)
  assert.match(html, /aria-label="4 星"/)
  assert.match(html, /4 \/ 5/)
  const empty = await renderToString(createSSRApp(StarRating, { name: 'empty' }))
  assert.doesNotMatch(empty, /class="[^"]*\blit\b/)
  assert.match(empty, /未评分/)
  const disabled = await renderToString(createSSRApp(StarRating, { name: 'closed', modelValue: 3, disabled: true }))
  assert.equal([...disabled.matchAll(/<input[^>]*disabled/g)].length, 5)
})

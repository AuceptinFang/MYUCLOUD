import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFileUrl, buildPreviewUrl, isVideoResource } from './ucloud.js'

test('MP4 with an encoded Chinese download name uses the file proxy without changing its query', () => {
  const path = '/ucloud/video/cad0ff6026c752b9bc13ce986e958329.mp4'
  const query = '?response-content-disposition=attachment%3bfilename%3d%e5%bc%a0%e5%ae%87%e7%90%9b%e7%bb%84-rust.mp4'
  const previewUrl = `https://fileucloud.bupt.edu.cn${path}${query}`
  assert.equal(isVideoResource({ previewUrl }), true)
  assert.equal(buildFileUrl(previewUrl), `/file${path}${query}`)
})

test('video metadata and uppercase URL suffixes identify videos without relying on the download filename', () => {
  for (const resource of [
    { mimeType: 'video/mp4', previewUrl: 'https://example.com/opaque-id' },
    { ext: '.MP4' },
    { name: '课堂录像.webm' },
    { previewUrl: '/file/ucloud/video/lecture.MOV?token=123#play' },
  ]) {
    assert.equal(isVideoResource(resource), true)
  }
})

test('documents still use Office even if a query value looks like a video filename', () => {
  const previewUrl = 'https://fileucloud.bupt.edu.cn/ucloud/document/slides.pdf?name=video.mp4'
  assert.equal(isVideoResource({ previewUrl, ext: 'pdf' }), false)
  assert.equal(isVideoResource(), false)
  assert.equal(buildPreviewUrl({ previewUrl }), `/office/?ssl=1&n=1&bclr=000&furl=${encodeURIComponent(previewUrl)}`)
})

test('file proxy conversion leaves other origins and existing proxy URLs intact', () => {
  for (const url of [
    'https://example.com/video.mp4',
    'https://fileucloud.bupt.edu.cn.example.com/video.mp4',
    '/file/ucloud/video/video.mp4?signature=a%2Fb%3D',
  ]) {
    assert.equal(buildFileUrl(url), url)
  }
})

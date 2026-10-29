// The cover generator is optional and deployed separately from this frontend.
export function normalizeReportCoverUrl(value = '') {
  const url = value.trim()
  if (!url) return ''
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return url

  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.href
      : ''
  } catch {
    return ''
  }
}

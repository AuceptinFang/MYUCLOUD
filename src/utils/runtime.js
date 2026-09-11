import { normalizeBackendOrigin, resolveBackendUrl } from './backend-url.js'

export const BACKEND_ORIGIN = normalizeBackendOrigin(import.meta.env?.VITE_BACKEND_URL || '')
export const STATIC_PREVIEW = import.meta.env?.MODE === 'pages' && !BACKEND_ORIGIN
export const PREVIEW_MESSAGE = '此预览未连接后端，登录及同步暂不可用。'
export const backendUrl = (path) => resolveBackendUrl(path, BACKEND_ORIGIN)

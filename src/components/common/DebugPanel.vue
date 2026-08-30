<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  loginUrl: { type: String, default: '' },
  username: { type: String, default: '' },
  password: { type: String, default: '' },
  token: { type: String, default: '' },
  apiUrl: { type: String, default: '' },
  logs: { type: Array, default: () => [] },
  loggingIn: { type: Boolean, default: false },
  requesting: { type: Boolean, default: false },
  loadingData: { type: Boolean, default: false },
  authPreview: { type: Object, default: () => ({}) },
})

const emit = defineEmits([
  'update:loginUrl',
  'update:username',
  'update:password',
  'update:token',
  'update:apiUrl',
  'blade-auth-login',
  'login',
  'request',
  'clear-token',
  'clear-logs',
])

const selectedKey = ref('')
const activeTab = ref('response')
const showSecrets = ref(false)

const callNames = {
  'login': '统一认证登录',
  'api': '手动请求',
  'study:user-info': '用户信息',
  'study:courses': '课程列表',
  'study:assignments': '作业列表',
  'study:assignment-course-map': '作业课程映射',
  'study:course-resources': '课程资料',
  'study:course-assignments': '课程作业',
  'study:assignment-submit-view': '作业提交状态',
  'study:assignment-resource-details': '附件信息',
  'study:submit-attachment-resource': '提交附件',
  'study:assignment-detail': '作业详情',
  'study:attachment-upload': '文件上传',
  'study:assignment-submit': '提交作业',
  'study:assignments-after-submit': '提交后刷新',
}

const apiCalls = computed(() => {
  const calls = []
  const pending = new Map()
  let sequence = 0

  for (const item of [...props.logs].reverse()) {
    const match = String(item.label || '').match(/^(.*):(start|response|error)$/)
    if (!match) continue

    const [, base, phase] = match
    const waiting = pending.get(base) || []

    if (phase === 'start') {
      const call = {
        key: `${item.time}-${base}-${sequence++}`,
        base,
        startedAt: item.time,
        completedAt: '',
        request: item.data || null,
        response: null,
        error: null,
      }
      calls.push(call)
      waiting.push(call)
      pending.set(base, waiting)
      continue
    }

    const call = waiting.pop()
    if (call) {
      call.completedAt = item.time
      call[phase] = item.data || null
      continue
    }

    calls.push({
      key: `${item.time}-${base}-${sequence++}`,
      base,
      startedAt: item.time,
      completedAt: item.time,
      request: null,
      response: phase === 'response' ? item.data || null : null,
      error: phase === 'error' ? item.data || null : null,
    })
  }

  return calls.reverse()
})

const selectedCall = computed(
  () => apiCalls.value.find((call) => call.key === selectedKey.value) || apiCalls.value[0] || null,
)

watch(
  apiCalls,
  (calls) => {
    if (!calls.some((call) => call.key === selectedKey.value)) {
      selectedKey.value = calls[0]?.key || ''
    }
  },
  { immediate: true },
)

function selectCall(call) {
  selectedKey.value = call.key
  activeTab.value = call.response || call.error ? 'response' : 'request'
}

function callName(call) {
  return callNames[call.base] || call.base.replace(/^study:/, '').replaceAll('-', ' ')
}

function requestMethod(call) {
  return call.request?.method || '—'
}

function requestUrl(call) {
  return call.request?.url || call.response?.url || ''
}

function requestPath(call) {
  const value = requestUrl(call)
  if (!value) return '请求地址不可用'

  try {
    const url = new URL(value, window.location.origin)
    return `${url.pathname}${url.search}`
  } catch {
    return value
  }
}

function queryEntries(call) {
  const value = requestUrl(call)
  if (!value) return []

  try {
    return [...new URL(value, window.location.origin).searchParams.entries()]
  } catch {
    return []
  }
}

function headerEntries(headers = {}) {
  return Object.entries(headers || {}).map(([name, value]) => ({
    name,
    value: showSecrets.value ? value : maskHeader(name, value),
  }))
}

function maskHeader(name, value) {
  if (!/^(blade-auth|authorization|cookie|set-cookie)$/i.test(name)) return value
  if (!value) return '—'
  return '••••••••••••'
}

function responseStatus(call) {
  if (call.error) return 'ERROR'
  if (!call.response) return 'WAIT'
  return String(call.response.status || call.response.body?.code || 'OK')
}

function responseTone(call) {
  if (call.error) return 'error'
  if (!call.response) return 'pending'

  const businessCode = call.response.body?.code
  return call.response.ok && (!businessCode || businessCode === 200) ? 'success' : 'error'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour12: false })
}

function toJson(value) {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? null, null, 2)
}
</script>

<template>
  <section class="debug-layout">
    <header class="debug-console-head">
      <div>
        <span class="eyebrow">DEVELOPER TOOL</span>
        <h2>Web API 调试</h2>
        <p>发送带鉴权请求，并按 HTTP 请求与响应查看页面产生的 API 流量。</p>
      </div>
      <span class="debug-local-badge">调试环境</span>
    </header>

    <section class="panel api-composer-panel">
      <div class="api-composer">
        <span class="http-method">GET</span>
        <input
          aria-label="Web API 地址"
          :value="apiUrl"
          placeholder="/ucloud/ykt-basics/info"
          spellcheck="false"
          @input="emit('update:apiUrl', $event.target.value)"
          @keydown.enter="emit('request')"
        />
        <button :disabled="requesting || !token || !apiUrl" type="button" @click="emit('request')">
          {{ requesting ? '发送中…' : '发送请求' }}
        </button>
      </div>
      <p class="api-composer-hint">
        请求会自动携带 Blade-Auth、Authorization 和 Tenant-Id。
      </p>
    </section>

    <details class="panel debug-auth-drawer">
      <summary>
        <span>
          <strong>鉴权与登录</strong>
          <small>{{ token ? 'Blade-Auth 已配置' : '尚未配置 Blade-Auth' }}</small>
        </span>
        <span :class="['auth-dot', { ready: token }]" aria-hidden="true" />
      </summary>

      <div class="debug-auth-grid">
        <form class="debug-auth-section" @submit.prevent="emit('login')">
          <div>
            <h3>账号登录</h3>
            <p>通过本地 CAS 封装接口获取 Blade-Auth。</p>
          </div>
          <label>
            登录接口
            <input :value="loginUrl" @input="emit('update:loginUrl', $event.target.value)" />
          </label>
          <div class="debug-credential-row">
            <label>
              学号
              <input
                :value="username"
                autocomplete="username"
                @input="emit('update:username', $event.target.value)"
              />
            </label>
            <label>
              密码
              <input
                :value="password"
                autocomplete="current-password"
                type="password"
                @input="emit('update:password', $event.target.value)"
              />
            </label>
          </div>
          <button :disabled="loggingIn" type="submit">
            {{ loggingIn ? '登录中…' : '登录并获取 Token' }}
          </button>
        </form>

        <section class="debug-auth-section">
          <div>
            <h3>Blade-Auth</h3>
            <p>可直接粘贴已有 Token；敏感请求头默认隐藏。</p>
          </div>
          <textarea
            :value="token"
            aria-label="Blade-Auth"
            placeholder="粘贴 Blade-Auth"
            spellcheck="false"
            @input="emit('update:token', $event.target.value)"
          />
          <div class="inline-actions">
            <button
              :disabled="loadingData || !token"
              type="button"
              @click="emit('blade-auth-login')"
            >
              {{ loadingData ? '加载中…' : '验证并加载数据' }}
            </button>
            <button class="button-secondary" type="button" @click="emit('clear-token')">
              清除 Token
            </button>
          </div>
        </section>
      </div>
    </details>

    <section class="panel api-inspector">
      <div class="api-inspector-header">
        <div>
          <h2>API 请求记录</h2>
          <p>仅展示 HTTP 请求、响应和请求错误，已过滤页面内部日志。</p>
        </div>
        <div class="api-inspector-actions">
          <label class="check-control api-secret-toggle">
            <input v-model="showSecrets" type="checkbox" />
            显示敏感请求头
          </label>
          <button class="button-secondary" type="button" @click="emit('clear-logs')">
            清空
          </button>
        </div>
      </div>

      <p v-if="apiCalls.length === 0" class="api-empty-state">
        暂无 API 请求。发送上方请求，或返回首页加载课程数据后再查看。
      </p>

      <div v-else class="api-workbench">
        <nav class="api-call-list" aria-label="API 请求记录">
          <button
            v-for="call in apiCalls"
            :key="call.key"
            :class="['api-call-button', { active: selectedCall?.key === call.key }]"
            type="button"
            @click="selectCall(call)"
          >
            <span class="api-call-topline">
              <b class="api-call-method">{{ requestMethod(call) }}</b>
              <span :class="['api-status', responseTone(call)]">{{ responseStatus(call) }}</span>
              <time>{{ formatTime(call.completedAt || call.startedAt) }}</time>
            </span>
            <strong>{{ callName(call) }}</strong>
            <code>{{ requestPath(call) }}</code>
          </button>
        </nav>

        <article v-if="selectedCall" class="api-detail">
          <header class="api-detail-head">
            <div class="api-detail-title">
              <span class="http-method compact">{{ requestMethod(selectedCall) }}</span>
              <div>
                <h3>{{ callName(selectedCall) }}</h3>
                <code>{{ requestUrl(selectedCall) || '请求地址不可用' }}</code>
              </div>
            </div>
            <span :class="['api-status large', responseTone(selectedCall)]">
              {{ responseStatus(selectedCall) }}
            </span>
          </header>

          <div class="api-detail-tabs" role="tablist" aria-label="请求详情">
            <button
              :class="{ active: activeTab === 'request' }"
              type="button"
              role="tab"
              @click="activeTab = 'request'"
            >
              Request
            </button>
            <button
              :class="{ active: activeTab === 'response' }"
              type="button"
              role="tab"
              @click="activeTab = 'response'"
            >
              Response
            </button>
          </div>

          <div v-if="activeTab === 'request'" class="api-detail-content">
            <section v-if="queryEntries(selectedCall).length" class="api-data-section">
              <h4>Query Parameters</h4>
              <dl class="api-key-values">
                <template v-for="([name, value], index) in queryEntries(selectedCall)" :key="`${name}-${index}`">
                  <dt>{{ name }}</dt>
                  <dd>{{ value }}</dd>
                </template>
              </dl>
            </section>

            <section class="api-data-section">
              <h4>Request Headers</h4>
              <dl v-if="headerEntries(selectedCall.request?.headers).length" class="api-key-values">
                <template v-for="header in headerEntries(selectedCall.request?.headers)" :key="header.name">
                  <dt>{{ header.name }}</dt>
                  <dd>{{ header.value }}</dd>
                </template>
              </dl>
              <p v-else class="api-muted">没有记录请求头。</p>
            </section>

            <section v-if="selectedCall.request?.body !== undefined" class="api-data-section">
              <h4>Request Body</h4>
              <pre class="api-code">{{ toJson(selectedCall.request.body) }}</pre>
            </section>
          </div>

          <div v-else class="api-detail-content">
            <section v-if="selectedCall.error" class="api-error-box">
              <strong>请求失败</strong>
              <p>{{ selectedCall.error.message || '未知网络错误' }}</p>
              <pre v-if="selectedCall.error.stack" class="api-code">{{ selectedCall.error.stack }}</pre>
            </section>

            <template v-else-if="selectedCall.response">
              <section
                v-if="responseTone(selectedCall) === 'error'"
                class="api-error-box"
              >
                <strong>
                  {{ selectedCall.response.body?.msg || `HTTP ${selectedCall.response.status} 请求失败` }}
                </strong>
                <p v-if="selectedCall.response.body?.stage">
                  失败阶段：{{ selectedCall.response.body.stage }}
                </p>
                <p v-if="selectedCall.response.body?.error?.code">
                  {{ selectedCall.response.body.error.code }}
                  <template v-if="selectedCall.response.body.error.hostname">
                    · {{ selectedCall.response.body.error.hostname }}
                  </template>
                </p>
              </section>

              <section class="api-response-summary">
                <div>
                  <span>HTTP Status</span>
                  <strong>{{ selectedCall.response.status }} {{ selectedCall.response.statusText }}</strong>
                </div>
                <div>
                  <span>Business Code</span>
                  <strong>{{ selectedCall.response.body?.code ?? '—' }}</strong>
                </div>
                <div>
                  <span>Redirected</span>
                  <strong>{{ selectedCall.response.redirected ? 'Yes' : 'No' }}</strong>
                </div>
              </section>

              <section class="api-data-section">
                <h4>Response Body</h4>
                <pre class="api-code response-body">{{ toJson(selectedCall.response.body) }}</pre>
              </section>

              <section class="api-data-section">
                <h4>Response Headers</h4>
                <dl v-if="headerEntries(selectedCall.response.headers).length" class="api-key-values">
                  <template v-for="header in headerEntries(selectedCall.response.headers)" :key="header.name">
                    <dt>{{ header.name }}</dt>
                    <dd>{{ header.value }}</dd>
                  </template>
                </dl>
                <p v-else class="api-muted">没有记录响应头。</p>
              </section>
            </template>

            <p v-else class="api-muted">等待响应。</p>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

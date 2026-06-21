<script setup>
import { reactive } from 'vue'

defineProps({
  loginUrl: {
    type: String,
    default: '',
  },
  username: {
    type: String,
    default: '',
  },
  password: {
    type: String,
    default: '',
  },
  token: {
    type: String,
    default: '',
  },
  apiUrl: {
    type: String,
    default: '',
  },
  logs: {
    type: Array,
    default: () => [],
  },
  loggingIn: {
    type: Boolean,
    default: false,
  },
  requesting: {
    type: Boolean,
    default: false,
  },
  loadingData: {
    type: Boolean,
    default: false,
  },
  authPreview: {
    type: Object,
    default: () => ({}),
  },
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

const expanded = reactive({})

function logKey(item) {
  return `${item.time}-${item.label}`
}

function toggleLog(item) {
  const key = logKey(item)
  expanded[key] = !expanded[key]
}

function toJson(value) {
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <section class="debug-layout">
    <section class="panel">
      <h2>登录</h2>
      <form class="form-grid" @submit.prevent="emit('login')">
        <label>
          登录接口
          <input :value="loginUrl" @input="emit('update:loginUrl', $event.target.value)" />
        </label>
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
        <button :disabled="loggingIn" type="submit">
          {{ loggingIn ? '登录中' : '登录拿 Blade-Auth' }}
        </button>
      </form>
    </section>

    <section class="panel">
      <h2>带鉴权请求</h2>
      <label>
        Blade-Auth
        <textarea
          :value="token"
          spellcheck="false"
          @input="emit('update:token', $event.target.value)"
        />
      </label>
      <label>
        测试接口
        <input :value="apiUrl" @input="emit('update:apiUrl', $event.target.value)" />
      </label>
      <div class="inline-actions">
        <button :disabled="loadingData || !token" type="button" @click="emit('blade-auth-login')">
          {{ loadingData ? '加载中' : 'Blade-Auth 登录' }}
        </button>
        <button :disabled="requesting || !token" type="button" @click="emit('request')">
          {{ requesting ? '请求中' : 'GET 带鉴权接口' }}
        </button>
        <button class="button-secondary" type="button" @click="emit('clear-token')">清 token</button>
      </div>
      <pre class="code-block">{{ toJson(authPreview) }}</pre>
    </section>

    <section class="panel logs-panel">
      <div class="section-header">
        <div>
          <h2>日志</h2>
          <p>请求、响应和解析结果保留在这里</p>
        </div>
        <button class="button-secondary" type="button" @click="emit('clear-logs')">清日志</button>
      </div>

      <p v-if="logs.length === 0" class="empty-state">暂无日志</p>
      <article
        v-for="item in logs"
        :key="logKey(item)"
        class="log-item"
        role="button"
        tabindex="0"
        @click="toggleLog(item)"
        @keydown.enter="toggleLog(item)"
      >
        <div class="log-meta">
          <strong>{{ item.label }}</strong>
          <span class="log-toggle">{{ expanded[logKey(item)] ? '收起' : '展开' }}</span>
          <time>{{ item.time }}</time>
        </div>
        <pre v-if="expanded[logKey(item)]" class="code-block">{{ toJson(item.data) }}</pre>
      </article>
    </section>
  </section>
</template>

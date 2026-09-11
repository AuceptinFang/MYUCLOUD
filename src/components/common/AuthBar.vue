<script setup>
import { STATIC_PREVIEW } from '../../utils/runtime.js'
defineProps({
  serviceName: { type: String, default: 'UCloud' },
  credentialName: { type: String, default: 'Blade-Auth' },
  loginHint: { type: String, default: '使用统一认证或 Blade-Auth' },
  credentialScope: { type: String, default: 'ucloud' },
  loginAction: { type: String, default: '/api/login' },
  passwordLabel: { type: String, default: '统一认证密码' },
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
  authenticated: {
    type: Boolean,
    default: false,
  },
  userLabel: {
    type: String,
    default: '未登录',
  },
  loadingLogin: {
    type: Boolean,
    default: false,
  },
  loadingData: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'update:username',
  'update:password',
  'update:token',
  'blade-auth-login',
  'login',
  'clear-token',
])
</script>

<template>
  <section class="auth-card" :class="{ authenticated }">
    <div class="auth-overview">
      <div class="auth-identity">
        <i class="auth-state-dot" :class="{ ready: authenticated }" aria-hidden="true" />
        <div>
          <span>{{ authenticated ? `已连接 ${serviceName}` : '尚未登录' }}</span>
          <strong>{{ userLabel }}</strong>
        </div>
      </div>
      <button
        v-if="authenticated"
        class="button-secondary auth-sign-out"
        type="button"
        @click="emit('clear-token')"
      >
        退出登录
      </button>
    </div>

    <details class="auth-access" :open="!authenticated">
      <summary>
        <span>{{ authenticated ? '账户与登录设置' : `登录 ${serviceName}` }}</span>
        <small>{{ authenticated ? '切换账户或更新凭证' : loginHint }}</small>
      </summary>

      <div class="auth-methods">
        <form
          :id="`${credentialScope}-login-form`"
          :name="`${credentialScope}-login`"
          :action="loginAction"
          method="post"
          class="auth-form"
          @submit.prevent="!STATIC_PREVIEW && emit('login')"
        >
          <label>
            学号
            <input
              :id="`${credentialScope}-username`"
              :name="`${credentialScope}-username`"
              :value="username"
              :disabled="STATIC_PREVIEW"
              :autocomplete="`section-${credentialScope} username`"
              @input="emit('update:username', $event.target.value)"
            />
          </label>
          <label>
            {{ passwordLabel }}
            <input
              :id="`${credentialScope}-password`"
              :name="`${credentialScope}-password`"
              :value="password"
              :disabled="STATIC_PREVIEW"
              :autocomplete="`section-${credentialScope} current-password`"
              type="password"
              @input="emit('update:password', $event.target.value)"
            />
          </label>
          <button :disabled="STATIC_PREVIEW || loadingLogin" type="submit">
            {{ loadingLogin ? '登录中' : '登录' }}
          </button>
        </form>

        <div class="token-form">
          <label>
            {{ credentialName }}
            <input
              :id="`${credentialScope}-token`"
              :name="`${credentialScope}-token`"
              :value="token"
              :disabled="STATIC_PREVIEW"
              autocomplete="off"
              spellcheck="false"
              @input="emit('update:token', $event.target.value)"
            />
          </label>
          <button :disabled="STATIC_PREVIEW || loadingData || !token" type="button" @click="emit('blade-auth-login')">
            {{ loadingData ? '加载中' : `${credentialName} 登录` }}
          </button>
          <button :disabled="STATIC_PREVIEW" class="button-secondary" type="button" @click="emit('clear-token')">清空</button>
        </div>
      </div>
    </details>
  </section>
</template>

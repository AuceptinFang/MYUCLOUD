<script setup>
defineProps({
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
          <span>{{ authenticated ? '已连接 UCloud' : '尚未登录' }}</span>
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
        <span>{{ authenticated ? '账户与登录设置' : '登录 UCloud' }}</span>
        <small>{{ authenticated ? '切换账户或更新凭证' : '使用统一认证或 Blade-Auth' }}</small>
      </summary>

      <div class="auth-methods">
        <form class="auth-form" @submit.prevent="emit('login')">
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
          <button :disabled="loadingLogin" type="submit">
            {{ loadingLogin ? '登录中' : '登录' }}
          </button>
        </form>

        <div class="token-form">
          <label>
            Blade-Auth
            <input
              :value="token"
              autocomplete="off"
              spellcheck="false"
              @input="emit('update:token', $event.target.value)"
            />
          </label>
          <button :disabled="loadingData || !token" type="button" @click="emit('blade-auth-login')">
            {{ loadingData ? '加载中' : 'Blade-Auth 登录' }}
          </button>
          <button class="button-secondary" type="button" @click="emit('clear-token')">清空</button>
        </div>
      </div>
    </details>
  </section>
</template>

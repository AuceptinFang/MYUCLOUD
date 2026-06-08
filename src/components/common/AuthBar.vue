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
  <section class="auth-card">
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

    <div class="auth-user">
      <span>当前用户</span>
      <strong>{{ userLabel }}</strong>
    </div>
  </section>
</template>

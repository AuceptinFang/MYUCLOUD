<script setup>
import { ref, watch } from 'vue'
import AuthBar from './AuthBar.vue'
import { jwglAuthError, jwglLoggedIn, jwglSessionId, jwglStorageWarning, jwglUsername, loginJwgl, logoutJwgl, restoreJwglToken } from '../../api/jwgl.js'

const emit = defineEmits(['login'])
const username = ref(jwglUsername.value)
const password = ref('')
const token = ref(jwglSessionId.value)
const loading = ref(false)
const error = ref('')
watch(jwglSessionId, (value) => { token.value = value; if (value) username.value = jwglUsername.value })

async function login(useToken = false) {
  loading.value = true
  error.value = ''
  try {
    if (useToken) await restoreJwglToken(token.value.trim())
    else await loginJwgl(username.value.trim(), password.value)
    password.value = ''
    emit('login')
  } catch (cause) { error.value = cause.message }
  finally { loading.value = false }
}
</script>

<template>
  <div>
    <AuthBar
      v-model:username="username"
      v-model:password="password"
      v-model:token="token"
      service-name="教务系统"
      credential-name="教务凭证"
      login-hint="课表与评教共用登录，凭证保存在本机"
      :authenticated="jwglLoggedIn"
      :user-label="jwglUsername || '未登录教务系统'"
      :loading-login="loading"
      :loading-data="loading"
      @login="login()"
      @blade-auth-login="login(true)"
      @clear-token="logoutJwgl()"
    />
    <p v-if="error || jwglAuthError" class="notice error" role="alert">{{ error || jwglAuthError }}</p>
    <p v-if="jwglStorageWarning" class="notice" role="status">{{ jwglStorageWarning }}</p>
  </div>
</template>

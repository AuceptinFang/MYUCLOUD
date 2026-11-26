// The token expiry is only a scheduling hint; the identity API verifies the session.
function expiry(s) {
  if (s?.expiresAt > 0) return s.expiresAt
  try {
    const exp = JSON.parse(Buffer.from(s.token.split('.')[1], 'base64url')).exp
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null
  } catch { return null }
}
export async function checkSession(c, now=Date.now()) {
  let state, expiresAt=expiry(c.session)
  const renewable=Boolean(c.session?.refreshToken)
  try {
    if (!c.session?.token) state='login_required'
    else {
      const last=Date.parse(c.session.savedAt||'')
      const due=expiresAt ? expiresAt-now <= 15*60000 : !Number.isFinite(last)||now-last>=3600000
      let rejected=false
      if(renewable && due){try{rejected=!(await c.refresh())}catch{return {state:"renewal_failed",renewable,expiresAt,checkedAt:new Date(now).toISOString()}}}
      if(rejected)return {state:"renewal_rejected",renewable,expiresAt,checkedAt:new Date(now).toISOString()}
      const info=await c.request('GET','/ykt-basics/info')
      state=!info?.data?.id?'unverified':renewable?'online':'online_without_refresh'
    }
  } catch(e) {state=e.message?.includes('登录凭证已过期')?'login_required':'unverified'}
  return {state, renewable, expiresAt:expiry(c.session), checkedAt:new Date(now).toISOString()}
}

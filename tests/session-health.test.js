import assert from 'node:assert/strict'
import {checkSession} from '../agent/session-health.mjs'
import {createClient} from '../agent/client.js'
let session={token:'old',refreshToken:'refresh',expiresAt:Date.now()+30000},refreshes=0
const c=createClient({store:{read:()=>session,write:s=>session=s},backend:'https://example.invalid',fetch:async(url,init)=>{
 if(String(url).endsWith('oauth/token')){refreshes++;await new Promise(r=>setTimeout(r,10));return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600})}
 return init.headers['Blade-Auth']==='new'?Response.json({data:{id:'demo'}}):Response.json({code:401},{status:401})
}})
const [status]=await Promise.all([checkSession(c),c.request('GET','/ykt-basics/info')])
assert.equal(refreshes,1);assert.equal(session.refreshToken,'rotated');assert.equal(status.state,'online');await checkSession(c);assert.equal(refreshes,1)
assert.equal((await checkSession({session:{token:'x'},request:async()=>({data:{id:1}})})).state,'online_without_refresh')
assert.equal((await checkSession({session:{token:'x'},request:async()=>{throw Error('登录凭证已过期')}})).state,'login_required')
console.log('session monitor tests passed')
import {handleHealth} from '../agent/session-alert.mjs'
import {run} from '../agent/cli.js'
let incident=null,notices=0
const hooks={read:()=>incident,write:v=>incident=v,notify:async()=>{notices++}}
for(const state of ['renewal_failed','unverified','login_required','online','renewal_rejected'])
 await handleHealth({state,checkedAt:new Date().toISOString()},hooks)
assert.equal(notices,2)
let output=''
await run(['session-check'],{client:c,stdout:{write:x=>output+=x}})
assert.equal(JSON.parse(output).state,'online')
assert.ok(!output.includes('rotated'))

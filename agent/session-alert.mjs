export function alertReason(status) {
 if(status.state==='renewal_rejected'||status.state==='renewal_failed')return 'renewal_failed'
 if(status.state==='login_required')return 'login_required'
 if(status.state==='online_without_refresh' && status.expiresAt && status.expiresAt-Date.parse(status.checkedAt)<=900000)return 'missing_refresh'
 return null
}
export async function handleHealth(status,{read,write,notify}) {
 const reason=alertReason(status)
 let incident=read()
 if(!reason){
  if(incident && ['online','online_without_refresh'].includes(status.state))write(null)
  return
 }
 if(!incident){incident={id:status.checkedAt,reason,queued:false};write(incident)}
 if(!incident.queued){await notify(incident.id,incident.reason);write({...incident,queued:true})}
}

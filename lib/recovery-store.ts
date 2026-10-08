import {env} from 'cloudflare:workers';
import {one,db,stmt,hash,passwordHash,uid} from './server';
import type {RecoveryStore} from './recovery';
export function recoveryStore():RecoveryStore {
 const origin=env.APP_ORIGIN;
 const configured=!!(env.RESEND_API_KEY&&env.MAIL_FROM&&origin&&/^https:\/\//.test(origin));
 return {
  one,hash,passwordHash,now:Date.now,token:()=>uid()+uid(),
  batch:async statements=>db().batch(statements.map(s=>stmt(s.sql,...s.args))),
  appOrigin:configured?origin:undefined,
  sendEmail:configured?async (email,link)=>{
   const response=await fetch('https://api.resend.com/emails',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:'Pulihkan akses RuangKita',text:`Gunakan tautan berikut untuk membuat kata sandi baru:\n\n${link}\n\nTautan berlaku selama 30 menit dan hanya dapat digunakan sekali. Jika Anda tidak meminta pemulihan, abaikan email ini.`}),
   });
   if(!response.ok)throw new Error('Email provider rejected delivery');
  }:undefined,
 };
}

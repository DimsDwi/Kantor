export type RecoveryStatement = {sql:string,args:unknown[]};
export type RecoveryStore = {
 one:(sql:string,...args:unknown[])=>Promise<any>;
 batch:(statements:RecoveryStatement[])=>Promise<{meta:{changes:number}}[]>;
 hash:(value:string)=>Promise<string>;
 passwordHash:(value:string)=>Promise<string>;
 now:()=>number;
 token:()=>string;
 sendEmail?: (email:string,link:string)=>Promise<void>;
 appOrigin?: string;
};
const statement=(sql:string,...args:unknown[]):RecoveryStatement=>({sql,args});
export const recoveryMessage='Jika email terdaftar, petunjuk pemulihan akan dikirim melalui email atau ditangani administrator kantor.';
export async function requestRecovery(store:RecoveryStore,email:string,ip:string){
 const now=store.now(),key='recovery:'+await store.hash(email+'|'+ip);
 // The conditional increment gives concurrent requests the same rate limit.
 const limited=await store.batch([statement("INSERT INTO login_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END WHERE reset_at<=? OR count<3",key,now+900000,now,now,now)]);
 if(!limited[0].meta.changes)return {message:recoveryMessage};
 const profile=await store.one("SELECT id,email FROM profiles WHERE email=? AND status='active'",email);
 if(!profile)return {message:recoveryMessage};
 await store.batch([statement("INSERT INTO reset_requests(id,user_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM reset_requests WHERE user_id=? AND status='pending')",store.token(),profile.id,profile.id)]);
 if(!store.sendEmail||!store.appOrigin)return {message:recoveryMessage};
 const token=store.token(),tokenHash=await store.hash(token);
 await store.batch([
   statement('DELETE FROM password_reset_tokens WHERE expires_at<=?',now),
   statement('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=CURRENT_TIMESTAMP',tokenHash,profile.id,now+30*60000),
 ]);
 try{
   // A fragment is not sent to the web server or in the HTTP Referer header.
   await store.sendEmail(profile.email,new URL('/reset-password',store.appOrigin).href+'#token='+token);
   await store.batch([statement("UPDATE reset_requests SET status='email_sent' WHERE user_id=? AND status='pending'",profile.id)]);
 }catch{
   await store.batch([statement('DELETE FROM password_reset_tokens WHERE token_hash=?',tokenHash)]);
   // Keep the pending administrator request, without exposing mail-provider errors.
 }
 return {message:recoveryMessage};
}
export async function redeemRecovery(store:RecoveryStore,token:string,password:string){
 if(!/^[a-f0-9-]{72}$/.test(token)||password.length<12||password.length>256)return false;
 const tokenHash=await store.hash(token),now=store.now();
 const candidate=await store.one('SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>?',tokenHash,now);
 if(!candidate)return false;
 const passwordHash=await store.passwordHash(password);
 // Every effect is conditional on the unconsumed token in one transaction.
 const eligible="SELECT t.user_id FROM password_reset_tokens t JOIN profiles p ON p.id=t.user_id WHERE t.token_hash=? AND t.expires_at>? AND p.status='active'";
 const results=await store.batch([
   statement(`UPDATE profiles SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${eligible})`,passwordHash,tokenHash,now),
   statement(`DELETE FROM sessions WHERE user_id IN (${eligible})`,tokenHash,now),
   statement(`UPDATE reset_requests SET status='resolved' WHERE user_id IN (${eligible})`,tokenHash,now),
   statement(`INSERT INTO activity_logs(id,user_id,action,entity_type,entity_id,description) SELECT ?,user_id,'reset_password','profile',user_id,'Pemulihan melalui tautan email' FROM password_reset_tokens WHERE token_hash=? AND expires_at>? AND user_id IN (SELECT id FROM profiles WHERE status='active')`,store.token(),tokenHash,now),
   statement('DELETE FROM password_reset_tokens WHERE token_hash=?',tokenHash),
 ]);
 return results[0].meta.changes===1;
}

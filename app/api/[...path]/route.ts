import { env } from 'cloudflare:workers';
import { all, one, run, stmt, db, user, admin, json, login, cookie, hash, passwordHash, safeProfile, seed, tick, uid, clean, today, localNow, audit, AppError } from '@/lib/server';
import {requestRecovery,redeemRecovery} from '@/lib/recovery';
import {recoveryStore} from '@/lib/recovery-store';
import {reportCsv} from '@/lib/report';
export const dynamic='force-dynamic';
const required=(b:any,keys:string[])=>{for(const k of keys)if(!clean(b[k]))throw new AppError(400,'Mohon lengkapi seluruh kolom wajib.');};
const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const timeValid=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
async function handle(request:Request){
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,''),method=request.method;
 if(method!=='GET'){
   const origin=request.headers.get('origin');
   if(origin&&origin!==url.origin)throw new AppError(403,'Permintaan tidak diizinkan.');
   if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Permintaan tidak diizinkan.');
 }
 if(path==='jobs/reminders'&&method==='POST'){
   if(!env.CRON_SECRET||env.CRON_SECRET.length<32)throw new AppError(503,'Scheduler belum dikonfigurasi.');
   if(await hash(request.headers.get('authorization')??'')!==await hash('Bearer '+env.CRON_SECRET))throw new AppError(401,'Akses scheduler tidak valid.');
   await tick();return json({ok:true,processed_at:new Date().toISOString()});
 }
 if(path==='bootstrap'&&method==='GET'){
   // Hosted access is owner-private. Local bootstrap is only available on loopback.
   if(!request.headers.get('oai-authenticated-user-id')&&!['localhost','127.0.0.1'].includes(url.hostname))throw new AppError(401,'Masuk melalui akses privat situs untuk memulai demo.');
   await seed();return json({ready:true});
 }
 if(path==='login'&&method==='POST')return login(request,await request.json());
 if(path==='forgot-password'&&method==='POST'){
   const b:any=await request.json();
   return json(await requestRecovery(recoveryStore(),clean(b.email,254).toLowerCase(),request.headers.get('cf-connecting-ip')??'local'));
 }
 if(path==='reset-password'&&method==='POST'){
   const b:any=await request.json();
   const ok=await redeemRecovery(recoveryStore(),String(b.token??''),String(b.password??''));
   if(!ok)throw new AppError(400,'Tautan tidak valid atau sudah kedaluwarsa. Gunakan kata sandi 12–256 karakter atau minta tautan baru.');
   return json({ok:true},200,{'Set-Cookie':cookie(request,'')+'; Max-Age=0'});
 }
 const p=await user(request);
 if(path.startsWith('admin/'))admin(p);
 if(method==='GET'){
   if(path==='admin/reports/export'){
     const filters:string[]=[],args:string[]=[];
     const from=url.searchParams.get('from'),to=url.searchParams.get('to');
     if((from&&!dateValid(from))||(to&&!dateValid(to))||(from&&to&&from>to))throw new AppError(400,'Rentang tanggal tidak valid.');
     for(const [key,column] of [['from','b.booking_date>=?'],['to','b.booking_date<=?'],['building','r.building=?'],['room','b.room_id=?'],['department','p.department=?'],['status','b.status=?']]){
       const value=url.searchParams.get(key);if(value){filters.push(column);args.push(value);}
     }
     const rows=await all('SELECT b.*,r.room_name,r.building,p.full_name,p.department FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN profiles p ON p.id=b.user_id'+(filters.length?' WHERE '+filters.join(' AND '):'')+' ORDER BY b.booking_date DESC,b.start_time DESC',...args);
     return new Response(reportCsv(rows),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="laporan-ruangkita-${from||'semua'}-${to||'semua'}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(path.startsWith('room-images/')){
     const id=path.slice('room-images/'.length);if(!/^[a-f0-9-]{36}$/.test(id))throw new AppError(404,'Foto tidak ditemukan.');
     const object=await env.BUCKET?.get('room-images/'+id);if(!object)throw new AppError(404,'Foto tidak ditemukan.');
     return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
   }
   if(path==='me')return json({user:p});
   if(path==='state'){
    await tick();
    const [rooms,facilities,links,bookings,notifications]=await Promise.all([
      all('SELECT * FROM rooms ORDER BY room_name'),all('SELECT * FROM facilities ORDER BY name'),all('SELECT * FROM room_facilities'),
      all(`SELECT b.*,r.room_name,r.building,r.floor,r.image_url,p.full_name,p.department FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN profiles p ON p.id=b.user_id ${p.role==='admin'?'':'WHERE b.user_id=?'} ORDER BY b.booking_date DESC,b.start_time DESC`,...(p.role==='admin'?[]:[p.id])),
      all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',p.id)]);
    return json({user:p,rooms:rooms.map(r=>({...r,facilities:links.filter(l=>l.room_id===r.id).map(l=>facilities.find(f=>f.id===l.facility_id)).filter(Boolean)})),facilities,bookings,notifications,today:today(),timezone:'Asia/Singapore'});
   }
   if(path==='availability'){
     const from=url.searchParams.get('from')??today(),to=url.searchParams.get('to')??from;
     if(!dateValid(from)||!dateValid(to)||to<from||Date.parse(to)-Date.parse(from)>100*86400000)throw new AppError(400,'Rentang kalender maksimal 100 hari.');
     return json({slots:await all("SELECT id,room_id,booking_date,start_time,end_time,status FROM bookings WHERE status IN ('pending','approved') AND booking_date BETWEEN ? AND ? ORDER BY booking_date,start_time",from,to)});
   }
   if(path==='admin/users')return json({users:(await all('SELECT * FROM profiles ORDER BY full_name')).map(safeProfile),resetRequests:await all("SELECT r.*,p.full_name,p.email FROM reset_requests r JOIN profiles p ON p.id=r.user_id WHERE r.status='pending' ORDER BY r.created_at DESC")});
   if(path==='admin/logs')return json({logs:await all('SELECT a.*,p.full_name FROM activity_logs a LEFT JOIN profiles p ON p.id=a.user_id ORDER BY a.created_at DESC LIMIT 300')});
   if(path.startsWith('documents/')){
     const doc=await one('SELECT * FROM documents WHERE id=?',path.split('/')[1]);
     if(!doc||(doc.user_id!==p.id&&p.role!=='admin'))throw new AppError(404,'Dokumen tidak ditemukan.');
     const object=await env.BUCKET?.get(doc.object_key);if(!object)throw new AppError(404,'Dokumen tidak ditemukan.');
     return new Response(object.body,{headers:{'Content-Type':doc.content_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(path.startsWith('booking-documents/')){
     const b=await one('SELECT * FROM bookings WHERE id=?',path.split('/')[1]);if(!b||(b.user_id!==p.id&&p.role!=='admin'))throw new AppError(404,'Pengajuan tidak ditemukan.');
     return json({documents:await all('SELECT id,filename,size FROM documents WHERE booking_id=?',b.id)});
   }
 }
 if(method==='POST'){
   if(path==='logout'){
    const token=request.headers.get('cookie')?.match(/(?:^|;\s*)rk_session=([^;]+)/)?.[1];if(token)await run('DELETE FROM sessions WHERE id=?',await hash(token));
    return json({ok:true},200,{'Set-Cookie':cookie(request,'')+'; Max-Age=0'});
   }
   if(path==='admin/room-image'){
     const form=await request.formData(),file=form.get('file');
     if(!(file instanceof File)||file.size===0||file.size>5*1024*1024||!['image/png','image/jpeg'].includes(file.type))throw new AppError(400,'Pilih foto PNG atau JPG maksimal 5 MB.');
     const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes);
     const valid=file.type==='image/png'?head.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>head[i]===v):head[0]===255&&head[1]===216&&head[2]===255;
     if(!valid)throw new AppError(400,'Isi foto tidak sesuai dengan formatnya.');
     if(!env.BUCKET)throw new AppError(503,'Penyimpanan foto belum tersedia.');
     const id=uid();await env.BUCKET.put('room-images/'+id,bytes,{httpMetadata:{contentType:file.type}});
     return json({image_url:'/api/room-images/'+id},201);
   }
   if(path==='upload'){
    const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||file.size===0||file.size>5*1024*1024)throw new AppError(400,'Pilih berkas PDF, PNG, atau JPG maksimal 5 MB.');
    if(!['application/pdf','image/png','image/jpeg'].includes(file.type))throw new AppError(400,'Format berkas harus PDF, PNG, atau JPG.');
    const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes);
    const valid=file.type==='application/pdf'?new TextDecoder().decode(head.slice(0,5))==='%PDF-':file.type==='image/png'?head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71:head[0]===255&&head[1]===216&&head[2]===255;
    if(!valid)throw new AppError(400,'Isi berkas tidak sesuai dengan formatnya.');
    if(!env.BUCKET)throw new AppError(503,'Penyimpanan berkas sedang tidak tersedia.');
    const id=uid(),key=`documents/${p.id}/${id}`;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:file.type}});
    try{await run('INSERT INTO documents(id,user_id,object_key,filename,content_type,size) VALUES(?,?,?,?,?,?)',id,p.id,key,clean(file.name,200),file.type,file.size);}catch(e){await env.BUCKET.delete(key);throw e;}
    return json({id,filename:file.name});
   }
   const b:any=await request.json();
   if(path==='bookings'){
     required(b,['room_id','booking_date','start_time','end_time','purpose','contact_number','request_key']);
     if(!dateValid(b.booking_date)||!timeValid(b.start_time)||!timeValid(b.end_time))throw new AppError(400,'Tanggal atau waktu tidak valid.');
     if(b.booking_date+' '+b.start_time<=localNow())throw new AppError(400,'Pilih waktu peminjaman yang belum berlalu.');
     if(b.end_time<=b.start_time)throw new AppError(400,'Waktu selesai harus setelah waktu mulai.');
     if(!Number.isInteger(Number(b.participant_count))||Number(b.participant_count)<1)throw new AppError(400,'Jumlah peserta harus berupa bilangan bulat positif.');
     if(clean(b.purpose).length<5)throw new AppError(400,'Tuliskan tujuan peminjaman minimal 5 karakter.');
     if(!/^[+\d\s()-]{7,25}$/.test(b.contact_number))throw new AppError(400,'Nomor kontak tidak valid.');
     const existing=await one('SELECT id,user_id FROM bookings WHERE request_key=?',clean(b.request_key,100));if(existing){if(existing.user_id!==p.id)throw new AppError(409,'Permintaan tidak valid.');return json({id:existing.id});}
     if(b.document_id){const doc=await one('SELECT id FROM documents WHERE id=? AND user_id=? AND booking_id IS NULL',b.document_id,p.id);if(!doc)throw new AppError(400,'Dokumen pendukung tidak valid.');}
     const id=uid();
     const statements=[stmt('INSERT INTO bookings(id,user_id,room_id,booking_date,start_time,end_time,purpose,participant_count,contact_number,notes,actor_id,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,p.id,clean(b.room_id),b.booking_date,b.start_time,b.end_time,clean(b.purpose),Number(b.participant_count),clean(b.contact_number,25),clean(b.notes,2000),p.id,clean(b.request_key,100))];
     if(b.document_id)statements.push(stmt('UPDATE documents SET booking_id=? WHERE id=? AND user_id=? AND booking_id IS NULL',id,b.document_id,p.id));await db().batch(statements);return json({id},201);
   }
   if(path==='booking-action'){
     const booking=await one('SELECT * FROM bookings WHERE id=?',b.id);if(!booking||(booking.user_id!==p.id&&p.role!=='admin'))throw new AppError(404,'Pengajuan tidak ditemukan.');
     if(b.action==='cancel'){
       if(!['pending','approved'].includes(booking.status)||booking.booking_date+' '+booking.start_time<=localNow())throw new AppError(400,'Peminjaman hanya dapat dibatalkan sebelum dimulai.');
       const result=await run("UPDATE bookings SET status='cancelled',actor_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','approved')",p.id,b.id);if(!result.meta.changes)throw new AppError(409,'Status telah berubah. Muat ulang pengajuan.');
     }else{
       admin(p);if(!['approve','reject'].includes(b.action))throw new AppError(400,'Tindakan tidak dikenal.');
       if(booking.status!=='pending')throw new AppError(409,'Pengajuan sudah diproses.');
       if(b.action==='approve'&&booking.booking_date+' '+booking.start_time<=localNow())throw new AppError(400,'Waktu pengajuan sudah berlalu. Tolak pengajuan ini dengan alasan.');
       if(b.action==='reject'&&!clean(b.reason))throw new AppError(400,'Alasan penolakan wajib diisi.');
       const result=await run("UPDATE bookings SET status=?,rejection_reason=?,approved_by=?,approved_at=?,actor_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",b.action==='approve'?'approved':'rejected',b.action==='reject'?clean(b.reason,1000):null,b.action==='approve'?p.id:null,b.action==='approve'?new Date().toISOString():null,p.id,b.id);if(!result.meta.changes)throw new AppError(409,'Pengajuan telah diproses administrator lain.');
     }return json({ok:true});
   }
   if(path==='notifications/read'){if(b.all)await run('UPDATE notifications SET is_read=1 WHERE user_id=?',p.id);else await run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?',clean(b.id),p.id);return json({ok:true});}
   if(path==='profile'){
     required(b,['full_name','phone']);await db().batch([stmt('UPDATE profiles SET full_name=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',clean(b.full_name,100),clean(b.phone,25),p.id),audit(p,'update_profile','profile',p.id,'Memperbarui profil pribadi')]);return json({ok:true});
   }
   if(path==='password'){
     const me=await one('SELECT * FROM profiles WHERE id=?',p.id);if(await passwordHash(String(b.current??''),me.password_hash.split(':')[0])!==me.password_hash)throw new AppError(400,'Kata sandi saat ini tidak sesuai.');
     if(String(b.password??'').length<12)throw new AppError(400,'Gunakan kata sandi minimal 12 karakter.');
     await db().batch([stmt('UPDATE profiles SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',await passwordHash(b.password),p.id),stmt('DELETE FROM sessions WHERE user_id=?',p.id),stmt('DELETE FROM password_reset_tokens WHERE user_id=?',p.id),audit(p,'change_password','profile',p.id,'Mengubah kata sandi dan mengakhiri seluruh sesi')]);return json({ok:true},200,{'Set-Cookie':cookie(request,'')+'; Max-Age=0'});
   }
   if(path==='admin/rooms'){
     required(b,['room_name','building','floor','room_number','description','operating_start','operating_end']);
     if(!Number.isInteger(Number(b.capacity))||Number(b.capacity)<1||Number(b.capacity)>1000)throw new AppError(400,'Kapasitas harus antara 1–1.000 orang.');
     if(!timeValid(b.operating_start)||!timeValid(b.operating_end)||b.operating_end<=b.operating_start)throw new AppError(400,'Jam operasional tidak valid.');
     if(!['available','maintenance','unavailable'].includes(b.status))throw new AppError(400,'Status ruangan tidak valid.');
     if(b.image_url&&!/^https:\/\//.test(b.image_url)&&!/^\/api\/room-images\/[a-f0-9-]{36}$/.test(b.image_url))throw new AppError(400,'Gunakan alamat gambar HTTPS.');
     const id=b.id??uid(),exists=b.id?await one('SELECT id FROM rooms WHERE id=?',b.id):null;if(b.id&&!exists)throw new AppError(404,'Ruangan tidak ditemukan.');
     const values=[clean(b.room_name,100),clean(b.building,100),clean(b.floor,20),clean(b.room_number,30),Number(b.capacity),clean(b.description,2000),clean(b.image_url,1000),b.status,b.operating_start,b.operating_end];
     const statements=[exists?stmt('UPDATE rooms SET room_name=?,building=?,floor=?,room_number=?,capacity=?,description=?,image_url=?,status=?,operating_start=?,operating_end=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',...values,id):stmt('INSERT INTO rooms(room_name,building,floor,room_number,capacity,description,image_url,status,operating_start,operating_end,id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',...values,id),stmt('DELETE FROM room_facilities WHERE room_id=?',id)];
     for(const f of Array.from(new Set((b.facility_ids??[]).map(String))))statements.push(stmt('INSERT INTO room_facilities(room_id,facility_id) VALUES(?,?)',id,f));
     statements.push(audit(p,exists?'update_room':'create_room','room',id,`${exists?'Memperbarui':'Menambahkan'} ${b.room_name} · ${b.status}`));await db().batch(statements);return json({id});
   }
   if(path==='admin/facilities'){
     if(b.action==='delete'){await db().batch([stmt('DELETE FROM facilities WHERE id=?',clean(b.id)),audit(p,'delete_facility','facility',clean(b.id),'Menghapus fasilitas')]);return json({ok:true});}
     required(b,['name']);const id=b.id??uid();await db().batch([b.id?stmt('UPDATE facilities SET name=? WHERE id=?',clean(b.name,60),id):stmt('INSERT INTO facilities(id,name,icon) VALUES(?,?,?)',id,clean(b.name,60),'check'),audit(p,b.id?'update_facility':'create_facility','facility',id,clean(b.name,60))]);return json({id});
   }
   if(path==='admin/users'){
     if(b.id===p.id)throw new AppError(400,'Gunakan Profil Saya untuk mengubah profil. Peran dan status akun sendiri tidak dapat diubah.');
     required(b,['full_name','email','employee_id','department','position']);
     if(!['admin','employee'].includes(b.role)||!['active','inactive'].includes(b.status))throw new AppError(400,'Peran atau status tidak valid.');
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))throw new AppError(400,'Email tidak valid.');
     const id=b.id??uid();if(b.id&&!await one('SELECT id FROM profiles WHERE id=?',id))throw new AppError(404,'Pengguna tidak ditemukan.');
     if(!b.id&&String(b.password??'').length<12)throw new AppError(400,'Kata sandi awal minimal 12 karakter.');
     const values=[clean(b.full_name,100),clean(b.email,254).toLowerCase(),clean(b.employee_id,50),clean(b.department,100),clean(b.position,100),clean(b.phone,25),b.role,b.status];
     const statements=[b.id?stmt('UPDATE profiles SET full_name=?,email=?,employee_id=?,department=?,position=?,phone=?,role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',...values,id):stmt('INSERT INTO profiles(full_name,email,employee_id,department,position,phone,role,status,id,password_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',...values,id,await passwordHash(b.password)),audit(p,b.id?'update_user':'create_user','profile',id,`${b.full_name} · ${b.role} · ${b.status}`)];
     if(b.id)statements.push(stmt('DELETE FROM sessions WHERE user_id=?',id),stmt('DELETE FROM password_reset_tokens WHERE user_id=?',id));await db().batch(statements);return json({id});
   }
   if(path==='admin/reset-password'){
     if(String(b.password??'').length<12)throw new AppError(400,'Kata sandi baru minimal 12 karakter.');
     if(!await one('SELECT id FROM profiles WHERE id=?',b.user_id))throw new AppError(404,'Pengguna tidak ditemukan.');
     await db().batch([stmt('UPDATE profiles SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',await passwordHash(b.password),b.user_id),stmt('DELETE FROM sessions WHERE user_id=?',b.user_id),stmt('DELETE FROM password_reset_tokens WHERE user_id=?',b.user_id),stmt("UPDATE reset_requests SET status='resolved' WHERE user_id=?",b.user_id),audit(p,'reset_password','profile',b.user_id,'Administrator memulihkan akses pengguna')]);return json({ok:true});
   }
 }
 throw new AppError(404,'Halaman atau tindakan tidak ditemukan.');
}
async function dispatch(req:Request){try{return await handle(req);}catch(error:any){
 const message=String(error.message??error);const known:Record<string,string>={BOOKING_CONFLICT:'Jadwal bertabrakan dengan pengajuan lain. Silakan pilih waktu lain.',ROOM_UNAVAILABLE:'Ruangan sedang dalam perawatan atau tidak tersedia.',CAPACITY_EXCEEDED:'Jumlah peserta melebihi kapasitas ruangan.',OUTSIDE_HOURS:'Peminjaman harus berada dalam jam operasional ruangan.',INVALID_TRANSITION:'Perubahan status tidak diizinkan.',ROOM_HAS_BOOKINGS:'Ruangan masih memiliki pengajuan aktif yang terdampak. Selesaikan atau batalkan pengajuan tersebut terlebih dahulu.',LAST_ADMIN:'Minimal satu administrator aktif harus tetap tersedia.',FORBIDDEN_ACTOR:'Anda tidak memiliki izin untuk tindakan ini.'};
 if(error instanceof SyntaxError)return json({error:'Format permintaan tidak valid.'},400);
 if(error instanceof AppError)return json({error:error.message},error.status);
 for(const [key,value] of Object.entries(known))if(message.includes(key))return json({error:value},409);
 if(message.includes('UNIQUE constraint'))return json({error:'Data sudah digunakan. Periksa email, nomor pegawai, atau nama fasilitas.'},409);
 if(message.includes('constraint'))return json({error:'Data tidak valid atau sudah berubah. Periksa isian Anda.'},400);
 console.error('Request failed',req.method,new URL(req.url).pathname,message);return json({error:'Layanan sedang mengalami gangguan. Data Anda belum disimpan. Silakan coba lagi.'},503);
}}
export const GET=dispatch;
export const POST=dispatch;


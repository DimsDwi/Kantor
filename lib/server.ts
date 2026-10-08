import { env } from 'cloudflare:workers';
import {roomPhotos} from './room-photos';

export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export const uid=()=>crypto.randomUUID();
export const db=()=>{if(!env.DB)throw new AppError(503,'Penyimpanan sedang tidak tersedia. Silakan coba lagi.');return env.DB;};
export const stmt=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
export const one=async(sql:string,...args:any[])=>stmt(sql,...args).first<any>();
export const all=async(sql:string,...args:any[])=> (await stmt(sql,...args).all<any>()).results;
export const run=async(sql:string,...args:any[])=>stmt(sql,...args).run();
export const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export const localNow=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,16).replace('T',' ');
export const clean=(v:any,max=500)=>String(v??'').trim().slice(0,max);
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function hash(v:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));}
export async function passwordHash(password:string,salt=uid()){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
 return `${salt}:${hex(bits)}`;
}
async function verify(password:string,stored:string){const candidate=await passwordHash(password,stored.split(':')[0]);let diff=candidate.length^stored.length;for(let i=0;i<stored.length;i++)diff|=candidate.charCodeAt(i)^stored.charCodeAt(i);return diff===0;}
export function safeProfile(p:any){const {password_hash,...rest}=p;return rest;}
export async function user(request:Request,required=true){
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)rk_session=([^;]+)/)?.[1];
 const p=token?await one('SELECT p.* FROM sessions s JOIN profiles p ON p.id=s.user_id WHERE s.id=? AND s.expires_at>? AND p.status=\'active\'',await hash(token),Date.now()):null;
 if(!p&&required)throw new AppError(401,'Sesi Anda berakhir. Silakan masuk kembali.');return p?safeProfile(p):null;
}
export function admin(p:any){if(p?.role!=='admin')throw new AppError(403,'Halaman ini hanya dapat diakses administrator.');}
export function json(data:any,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function cookie(request:Request,token:string,remember=false){return `rk_session=${token}; Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol==='https:'?'; Secure':''}${remember?'; Max-Age=2592000':''}`;}
export async function log(p:any,action:string,type:string,id:string,description:string){await run('INSERT INTO activity_logs(id,user_id,action,entity_type,entity_id,description) VALUES(?,?,?,?,?,?)',uid(),p?.id??null,action,type,id,description);}
export function audit(p:any,action:string,type:string,id:string,description:string){return stmt('INSERT INTO activity_logs(id,user_id,action,entity_type,entity_id,description) VALUES(?,?,?,?,?,?)',uid(),p.id,action,type,id,description);}
export async function login(request:Request,b:any){
 const email=clean(b.email,254).toLowerCase(),key=await hash(email+'|'+(request.headers.get('cf-connecting-ip')??'local'));
 const attempt=await one('SELECT * FROM login_attempts WHERE key=?',key);
 if(attempt&&attempt.reset_at>Date.now()&&attempt.count>=8)throw new AppError(429,'Terlalu banyak percobaan. Coba kembali dalam 15 menit.');
 const p=await one('SELECT * FROM profiles WHERE email=?',email);
 const ok=await verify(String(b.password??''),p?.password_hash??'dummy:0000000000000000000000000000000000000000000000000000000000000000');
 if(!p||!ok||p.status!=='active'){
 await run('INSERT INTO login_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END',key,Date.now()+900000,Date.now(),Date.now());
 throw new AppError(401,'Email atau kata sandi tidak sesuai.');}
 const token=uid()+uid();await db().batch([stmt('DELETE FROM login_attempts WHERE key=?',key),stmt('DELETE FROM sessions WHERE expires_at<?',Date.now()),stmt('INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)',await hash(token),p.id,Date.now()+(b.remember?30*86400000:12*3600000)),audit(p,'login','profile',p.id,`${p.full_name} masuk ke aplikasi`)]);
 return json({user:safeProfile(p)},200,{'Set-Cookie':cookie(request,token,!!b.remember)});
}
export async function tick(){
 const now=localNow();
 await run("INSERT OR IGNORE INTO notifications(id,user_id,title,message,type,reference_id,dedupe_key) SELECT lower(hex(randomblob(16))),b.user_id,'Peminjaman segera dimulai',r.room_name || ' akan digunakan pada ' || b.start_time || ' (SGT).','reminder',b.id,'reminder:' || b.id FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE b.status='approved' AND b.booking_date || ' ' || b.start_time > ? AND b.booking_date || ' ' || b.start_time <= strftime('%Y-%m-%d %H:%M',?, '+30 minutes')",now,now);
 await run("UPDATE bookings SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE status='approved' AND booking_date || ' ' || end_time<=?",now);
}

const legacyPhotos=['https://images.unsplash.com/photo-1703355685952-03ed19f70f51?auto=format&fit=crop&w=1200&q=85','https://images.unsplash.com/photo-1582653291997-079a1c04e5a1?auto=format&fit=crop&w=1200&q=85','https://images.unsplash.com/photo-1693039501734-b637255a34d9?auto=format&fit=crop&w=1200&q=85'];
export async function seed(){
 if(await one('SELECT id FROM profiles LIMIT 1')){
   const oldRooms=await all('SELECT id,image_url FROM rooms WHERE image_url IN (?,?,?)',...legacyPhotos);
   const updates=oldRooms.filter(r=>/^room-[0-7]$/.test(r.id)).map(r=>stmt('UPDATE rooms SET image_url=? WHERE id=? AND image_url=?',roomPhotos[Number(r.id.slice(5))],r.id,r.image_url));
   if(updates.length)await db().batch(updates);
   return;
 }
 const pw=await passwordHash('RuangKita!2026');
 const profiles=[['employee-ayu','Ayu Pratama','ayu@ruangkita.demo','EMP-2024-018','People & Culture','HR Specialist'],['admin-raka','Raka Wijaya','raka@ruangkita.demo','EMP-2021-004','General Affairs','Office Administrator'],['employee-dimas','Dimas Saputra','dimas@ruangkita.demo','EMP-2023-027','Teknologi Informasi','Product Engineer'],['employee-nadia','Nadia Putri','nadia@ruangkita.demo','EMP-2022-012','Keuangan','Finance Analyst']];
 const rooms=[['Ruang Rapat Utama','Gedung Utama','3','GU-301',20,'Ruang rapat representatif untuk koordinasi lintas divisi dan pertemuan pimpinan.','available'],['Ruang Rapat 1','Gedung Rapat','1','GR-101',8,'Ruangan nyaman untuk diskusi tim kecil dan pertemuan mingguan.','available'],['Ruang Rapat 2','Gedung Rapat','1','GR-102',10,'Ruang rapat fleksibel dengan layar presentasi dan papan tulis.','available'],['Ruang Meeting A','Gedung Administrasi','2','GA-201',6,'Area diskusi tenang untuk wawancara dan koordinasi administrasi.','available'],['Ruang Meeting B','Gedung Administrasi','2','GA-202',6,'Ruang kerja kolaboratif untuk sesi perencanaan singkat.','maintenance'],['Ruang Training','Gedung Operasional','1','GO-101',40,'Ruang pelatihan dengan kursi modular dan sistem presentasi lengkap.','available'],['Ruang Video Conference','Gedung Utama','2','GU-205',12,'Ruang khusus pertemuan hybrid dengan koneksi dan perangkat konferensi.','available'],['Aula Utama','Gedung Operasional','1','GO-100',120,'Aula serbaguna untuk town hall dan kegiatan kantor.','unavailable']];
 const facilities=['AC','Projector','WiFi','Whiteboard','Sound System','Video Conference','TV Display'];
 const statements: D1PreparedStatement[]=[];
 profiles.forEach((p,i)=>statements.push(stmt('INSERT OR IGNORE INTO profiles(id,full_name,email,employee_id,department,position,phone,role,password_hash) VALUES(?,?,?,?,?,?,?,?,?)',...p,'081234560'+(100+i),i===1?'admin':'employee',pw)));
 facilities.forEach((name,i)=>statements.push(stmt('INSERT OR IGNORE INTO facilities(id,name,icon) VALUES(?,?,?)','facility-'+i,name,['snowflake','projector','wifi','presentation','speaker','video','monitor'][i])));
 rooms.forEach((r,i)=>{statements.push(stmt('INSERT OR IGNORE INTO rooms(id,room_name,building,floor,room_number,capacity,description,status,image_url) VALUES(?,?,?,?,?,?,?,?,?)','room-'+i,...r,roomPhotos[i]));[0,2,...(i%2?[3,6]:[1,3,5])].forEach(f=>statements.push(stmt('INSERT OR IGNORE INTO room_facilities(room_id,facility_id) VALUES(?,?)','room-'+i,'facility-'+f)));});
 await db().batch(statements);
 const date=(offset:number)=>new Date(Date.now()+8*3600000+offset*86400000).toISOString().slice(0,10);
 const bookings=[['employee-ayu','room-0',1,'09:00','10:30','Koordinasi onboarding karyawan',12,'approved'],['employee-ayu','room-3',2,'10:00','11:00','Diskusi program kesejahteraan',5,'pending'],['employee-dimas','room-6',1,'13:00','15:00','Review pengembangan aplikasi',10,'pending'],['employee-nadia','room-1',1,'11:00','12:00','Evaluasi anggaran kuartal',6,'pending'],['employee-ayu','room-1',-2,'09:00','10:00','Rapat mingguan People & Culture',6,'completed'],['employee-ayu','room-2',-5,'14:00','15:30','Perencanaan kegiatan karyawan',8,'completed'],['employee-dimas','room-5',3,'09:00','12:00','Pelatihan keamanan informasi',30,'approved'],['employee-ayu','room-0',-8,'10:00','11:00','Evaluasi acara kantor',12,'rejected']];
 await db().batch(bookings.map((b,i)=>stmt('INSERT OR IGNORE INTO bookings(id,user_id,room_id,booking_date,start_time,end_time,purpose,participant_count,contact_number,status,rejection_reason,approved_by,approved_at,actor_id,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','booking-demo-'+i,b[0],b[1],date(Number(b[2])),b[3],b[4],b[5],b[6],'081234560100',b[7],b[7]==='rejected'?'Agenda kantor dipindahkan ke minggu berikutnya.':null,b[7]==='approved'?'admin-raka':null,b[7]==='approved'?new Date().toISOString():null,'admin-raka','seed-'+i)));
}

export type Row=Record<string,any>;
export const labels:Record<string,string>={pending:'Menunggu',approved:'Disetujui',rejected:'Ditolak',cancelled:'Dibatalkan',completed:'Selesai',available:'Tersedia',maintenance:'Perawatan',unavailable:'Tidak tersedia',active:'Aktif',inactive:'Nonaktif'};
export const dateText=(d:string,short=false)=>new Date(d+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:short?'short':'long',...(short?{}:{year:'numeric'})});
export const todayLocal=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export const timestamp=(d:string)=>new Date(d.includes('T')?d:d.replace(' ','T')+'Z').toLocaleString('id-ID',{timeZone:'Asia/Singapore',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export async function api(path:string,body?:any){const res=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data:any=await res.json();if(!res.ok)throw Object.assign(new Error(data.error??'Permintaan gagal.'),{status:res.status});return data;}
export const duration=(b:Row)=>{const [h,m]=b.start_time.split(':').map(Number),[h2,m2]=b.end_time.split(':').map(Number);return (h2*60+m2-h*60-m)/60;};
export const initials=(name:string)=>name.split(' ').slice(0,2).map(x=>x[0]).join('');


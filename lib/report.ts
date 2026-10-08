import {csvText} from './csv';

export function reportCsv(bookings: Record<string, any>[]) {
  const labels: Record<string,string> = {pending:'Menunggu',approved:'Disetujui',rejected:'Ditolak',cancelled:'Dibatalkan',completed:'Selesai'};
  return csvText([
    ['Pemohon','Departemen','Ruangan','Gedung','Tanggal','Mulai (SGT)','Selesai (SGT)','Durasi (jam)','Peserta','Tujuan','Status'],
    ...bookings.map(b => {
      const minutes = (t: string) => Number(t.slice(0,2))*60+Number(t.slice(3));
      return [b.full_name,b.department,b.room_name,b.building,b.booking_date,b.start_time,b.end_time,(minutes(b.end_time)-minutes(b.start_time))/60,b.participant_count,b.purpose,labels[b.status]??b.status];
    }),
  ]);
}

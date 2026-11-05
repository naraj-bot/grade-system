import { addDoc, collection } from 'firebase/firestore'
import { db } from '../firebase'

// คีย์เดือนของแจ้งเตือน: ให้กระดิ่งโหลดเฉพาะ 3 เดือนล่าสุด (ไม่ต้องอ่านแจ้งเตือนเก่าทั้งหมดทุกครั้ง)
export const monthKey = (to, d = new Date()) => `${to}|${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
export const recentKeys = (to) => [0, 1, 2].map((k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return monthKey(to, d) })

// ส่งแจ้งเตือนถึงผู้ใช้ (uid) หรือแอดมินทุกคน ('admins')
export const notify = (to, text, link = '', from = '') =>
  addDoc(collection(db, 'notifications'), { to, tk: monthKey(to), text, link, from, ts: Date.now() }).catch(() => {})

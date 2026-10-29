import { addDoc, collection } from 'firebase/firestore'
import { db } from '../firebase'

// ส่งแจ้งเตือนถึงผู้ใช้ (uid) หรือแอดมินทุกคน ('admins')
export const notify = (to, text, link = '', from = '') =>
  addDoc(collection(db, 'notifications'), { to, text, link, from, ts: Date.now() }).catch(() => {})

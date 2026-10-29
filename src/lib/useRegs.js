import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import { isAdminRole } from './constants'

// ใบลงทะเบียนสอนของปีการศึกษาที่เปิด: แอดมินเห็นทั้งหมด ครูเห็นเฉพาะของตน
export function useRegs() {
  const { user } = useAuth()
  const { openYear } = useData()
  const [regs, setRegs] = useState([])
  useEffect(() => {
    if (!openYear) { setRegs([]); return }
    const base = collection(db, 'registrations')
    const q = isAdminRole(user.role)
      ? query(base, where('year', '==', openYear.year))
      : query(base, where('year', '==', openYear.year), where('uid', '==', user.uid))
    return onSnapshot(q, (s) => setRegs(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
  }, [openYear?.year, user.uid, user.role])
  return regs
}

import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import { useRegs } from '../lib/useRegs'
import { isAdminRole } from '../lib/constants'
import { engineUpdate } from '../engine/engine'

// หน้ากรอกคะแนน/ประเมิน/กิจกรรม/ปพ.5/ใบแจ้งผล/ลายเซ็น/ตั้งค่าโรงเรียน/คู่มือ
// เนื้อหาวาดโดยเอนจิน (src/engine) ลงใน #view แล้วบันทึกลง Firestore เอง
export default function EnginePage({ page }) {
  const { user } = useAuth()
  const { openYear, term, setTerm, students, catalog, openSet } = useData()
  const regs = useRegs()
  const nav = useNavigate()
  const [teachers, setTeachers] = useState([])

  useEffect(() => {
    if (!isAdminRole(user.role)) return
    return onSnapshot(query(collection(db, 'users'), where('role', '==', 'teacher')),
      (s) => setTeachers(s.docs.map((d) => ({ uid: d.id, name: d.data().name })).sort((a, b) => a.name.localeCompare(b.name, 'th'))))
  }, [user.role])

  const go = useMemo(() => (pg) => nav(pg === 'home' ? '/' : '/' + pg), [nav])

  useEffect(() => {
    if (!openYear) return
    engineUpdate({ user, year: openYear.year, term, setTerm, go, students, catalog, openSet, regs, teachers }, page)
  }, [user, openYear?.year, term, students, catalog, openSet, regs, teachers, page, go, setTerm])

  if (!openYear) return <div className="card empty">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>
  return <div id="view" />
}

import { tell } from './lib/dialog'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './auth'
import catalog from './data/catalog.json'
import { isPri } from './lib/constants'

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

// ข้อมูลกลางที่ทุกหน้าใช้: ปีการศึกษาที่เปิด ภาคเรียนที่ดู นักเรียน รายวิชาที่เปิดสอน
export function DataProvider({ children }) {
  const { user } = useAuth()
  const [years, setYears] = useState([])
  const [terms, setTerms] = useState([])
  const [students, setStudents] = useState([])
  const [openDocs, setOpenDocs] = useState([])
  const [termSel, setTermSel] = useState(() => Number(localStorage.getItem('term')) || 0)

  const openYear = years.find((y) => y.status === 'open') || null

  useEffect(() => {
    if (!user) return
    const u1 = onSnapshot(query(collection(db, 'years'), orderBy('year', 'desc')), (s) => setYears(s.docs.map((d) => d.data())))
    const u2 = onSnapshot(collection(db, 'students'), (s) => setStudents(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2() }
  }, [user])

  useEffect(() => {
    if (!user || !openYear) { setTerms([]); setOpenDocs([]); return }
    const u1 = onSnapshot(collection(db, 'years', String(openYear.year), 'terms'), (s) => setTerms(s.docs.map((d) => d.data())))
    const u2 = onSnapshot(query(collection(db, 'subjectOpen'), where('year', '==', openYear.year)), (s) => setOpenDocs(s.docs.map((d) => d.data())))
    return () => { u1(); u2() }
  }, [user, openYear?.year])

  const t2open = terms.some((t) => t.term === 2 && t.status === 'open')
  const defaultTerm = t2open ? 2 : 1
  // ภาคเรียนที่ 2 ใช้ได้เมื่อแอดมินหลักเปิดแล้วเท่านั้น (ยังไม่เปิดปีการศึกษา = โหมดดูแบบฟอร์ม ใช้ได้ทั้งสองภาค)
  const lock2 = !!openYear && !t2open
  const term = lock2 ? 1 : (termSel || defaultTerm)
  const setTerm = (t) => {
    if (t === 2 && lock2) { tell({ title: 'ภาคเรียนที่ 2 ยังไม่เปิด', text: 'แอดมินหลักต้องเปิดภาคเรียนที่ 2 ที่เมนู "ปีการศึกษา" ก่อน จึงจะลงทะเบียน/บันทึกคะแนนได้', tone: 'warn' }); return }
    localStorage.setItem('term', String(t)); setTermSel(t)
  }

  const openSet = useMemo(() => new Set(openDocs.map((d) => d.code)), [openDocs])
  const activeStudents = useMemo(() => students.filter((s) => (s.status || 'active') === 'active'), [students])

  // รายวิชาของภาคเรียนที่ดูอยู่ (ประถมเก็บทั้งปี มัธยมแยกภาคเรียน)
  const termCatalog = useMemo(() => catalog.filter((c) => isPri(c.level) || String(c.term) === String(term)), [term])

  return (
    <Ctx.Provider value={{ years, openYear, terms, t2open: !lock2, term, setTerm, students, activeStudents, catalog, termCatalog, openSet }}>
      {children}
    </Ctx.Provider>
  )
}

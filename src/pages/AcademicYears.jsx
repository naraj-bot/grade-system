import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'

// ปีการศึกษา: years/{ปี พ.ศ.} { year, status: 'open' | 'closed' }
// ภาคเรียน:   years/{ปี}/terms/{1|2} { term, status }
export default function AcademicYears() {
  const { user } = useAuth()
  const { terms } = useData()
  const isSuper = user.role === 'superadmin'
  const [years, setYears] = useState([])
  const [newYear, setNewYear] = useState(String(new Date().getFullYear() + 543))
  const [error, setError] = useState('')

  useEffect(() => onSnapshot(query(collection(db, 'years'), orderBy('year', 'desc')),
    (s) => setYears(s.docs.map((d) => d.data()))), [])

  const openYear = years.find((y) => y.status === 'open')

  const create = async (e) => {
    e.preventDefault()
    setError('')
    const y = Number(newYear)
    if (!y || y < 2500 || y > 2700) return setError('กรอกปีการศึกษาเป็น พ.ศ. เช่น 2569')
    if (years.some((x) => x.year === y)) return setError('มีปีการศึกษานี้แล้ว')
    if (openYear) return setError(`ต้องปิดปีการศึกษา ${openYear.year} ก่อนจึงเปิดปีใหม่ได้`)
    const batch = writeBatch(db)
    batch.set(doc(db, 'years', String(y)), { year: y, status: 'open', createdAt: new Date().toISOString() })
    batch.set(doc(db, 'years', String(y), 'terms', '1'), { term: 1, status: 'open' })
    batch.set(doc(db, 'years', String(y), 'terms', '2'), { term: 2, status: 'pending' })
    await batch.commit()
  }

  const closeYear = async (y) => {
    if (!confirm(`ปิดปีการศึกษา ${y} ? ปิดแล้วข้อมูลจะดูและส่งออกได้อย่างเดียว`)) return
    await updateDoc(doc(db, 'years', String(y)), { status: 'closed' })
  }

  const t2open = terms.some((t) => t.term === 2 && t.status === 'open')
  const toggleTerm2 = async (y) => {
    const next = t2open ? 'pending' : 'open'
    const q = t2open ? `ย้อนภาคเรียนที่ 2 กลับเป็น "ยังไม่เปิด" ? (ข้อมูลที่กรอกไว้ไม่หาย)` : `เปิดภาคเรียนที่ 2 ของปีการศึกษา ${y} ? ควรเปิดเมื่อจบภาคเรียนที่ 1 แล้ว`
    if (!confirm(q)) return
    await setDoc(doc(db, 'years', String(y), 'terms', '2'), { term: 2, status: next }, { merge: true })
  }

  return (
    <div className="stack">
      {isSuper && (
        <form className="card row" onSubmit={create}>
          <input value={newYear} onChange={(e) => setNewYear(e.target.value)} size={6} />
          <button className="btn">เปิดปีการศึกษาใหม่</button>
          {error && <span className="error">{error}</span>}
        </form>
      )}
      <div className="tw"><table>
        <thead><tr><th>ปีการศึกษา</th><th>สถานะ</th><th>ภาคเรียนที่ 1</th><th>ภาคเรียนที่ 2</th><th></th></tr></thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.year}>
              <td>{y.year}</td>
              <td><span className={`pill ${y.status === 'open' ? 'p-good' : 'p-warn'}`}>{y.status === 'open' ? 'กำลังใช้งาน' : 'ปิดแล้ว (ดูอย่างเดียว)'}</span></td>
              <td>{y.status === 'open' ? <span className="pill p-good">กำลังใช้งาน</span> : <span className="muted">-</span>}</td>
              <td>{y.status === 'open' ? (t2open ? <span className="pill p-good">เปิดแล้ว</span> : <span className="pill p-warn">ยังไม่เปิด</span>) : <span className="muted">-</span>}</td>
              <td>
                {isSuper && y.status === 'open' && (
                  <>
                    <button className="btn sm alt" onClick={() => toggleTerm2(y.year)}>{t2open ? 'ย้อนกลับเป็นยังไม่เปิดภาค 2' : 'เปิดภาคเรียนที่ 2'}</button>{' '}
                    <button className="btn sm" onClick={() => closeYear(y.year)}>ปิดปีการศึกษา</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!years.length && <tr><td colSpan={5}>ยังไม่มีปีการศึกษา</td></tr>}
        </tbody>
      </table></div>
      {!isSuper && <p className="hint">เฉพาะแอดมินหลักที่เปิดหรือปิดปีการศึกษาได้</p>}
    </div>
  )
}

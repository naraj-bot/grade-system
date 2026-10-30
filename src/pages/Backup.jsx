import { useState } from 'react'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'

// สำรองข้อมูลทั้งระบบเป็นไฟล์ JSON และกู้คืนจากไฟล์ (กู้คืนได้เฉพาะแอดมินหลัก)
const FLAT = ['students', 'studentLog', 'subjectOpen', 'registrations', 'work', 'sigs', 'settings', 'users']
const LABEL = { years: 'ปีการศึกษา/ภาคเรียน', students: 'นักเรียน', studentLog: 'ประวัติแก้ไขนักเรียน', subjectOpen: 'รายวิชาที่เปิดสอน', registrations: 'ใบลงทะเบียนสอน', work: 'คะแนน/ค่าตั้ง/ประเมิน/กิจกรรม/ใบแจ้งผล', sigs: 'ลายเซ็น', settings: 'ตั้งค่าโรงเรียน', users: 'รายชื่อผู้ใช้ (เพื่อเก็บไว้ดู ไม่ใช้กู้คืน)' }
// กู้คืนไม่เขียนทับ users (บัญชีเข้าสู่ระบบอยู่ใน Firebase Auth) และ studentLog (กฎห้ามแก้ประวัติ)
const RESTORE = ['years', 'students', 'subjectOpen', 'registrations', 'work', 'sigs', 'settings']

const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear() + 543}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}` }

export default function Backup() {
  const { user } = useAuth()
  const isSuper = user.role === 'superadmin'
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  const [ok, setOk] = useState(false)

  const exportAll = async () => {
    setErr(''); setMsg('กำลังรวบรวมข้อมูล...'); setBusy(true)
    try {
      const out = { app: 'grade-system', version: 1, at: new Date().toISOString(), data: {} }
      for (const c of FLAT) {
        setMsg(`กำลังอ่าน ${LABEL[c]}...`)
        const s = await getDocs(collection(db, c))
        out.data[c] = s.docs.map((d) => ({ id: d.id, ...d.data() })).map(({ id, ...rest }) => ({ id, d: rest }))
      }
      setMsg('กำลังอ่าน ปีการศึกษา/ภาคเรียน...')
      const ys = await getDocs(collection(db, 'years')), years = []
      for (const y of ys.docs) {
        const t = await getDocs(collection(db, 'years', y.id, 'terms'))
        years.push({ id: y.id, d: y.data(), terms: t.docs.map((x) => ({ id: x.id, d: x.data() })) })
      }
      out.data.years = years
      const text = JSON.stringify(out)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = `สำรองข้อมูลระบบตัดเกรด-${stamp()}.json`
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      const n = Object.values(out.data).reduce((a, b) => a + b.length, 0)
      setMsg(`สำรองข้อมูลแล้ว (${n.toLocaleString()} รายการ) เก็บไฟล์ไว้ในที่ปลอดภัย`)
    } catch (e) { setErr('สำรองข้อมูลไม่สำเร็จ: ' + (e.code || e.message)); setMsg('') } finally { setBusy(false) }
  }

  const choose = async (f) => {
    setErr(''); setMsg(''); setPick(null); setOk(false)
    if (!f) return
    try {
      const j = JSON.parse(await f.text())
      if (j.app !== 'grade-system' || !j.data) throw new Error('ไม่ใช่ไฟล์สำรองของระบบนี้')
      setPick({ name: f.name, at: j.at, data: j.data })
    } catch (e) { setErr('อ่านไฟล์ไม่ได้: ' + e.message) }
  }

  const restore = async () => {
    setErr(''); setBusy(true)
    try {
      const jobs = []
      for (const c of RESTORE) {
        for (const r of pick.data[c] || []) {
          jobs.push([doc(db, c, r.id), r.d])
          for (const t of r.terms || []) jobs.push([doc(db, 'years', r.id, 'terms', t.id), t.d])
        }
      }
      for (let i = 0; i < jobs.length; i += 400) {
        const b = writeBatch(db)
        jobs.slice(i, i + 400).forEach(([ref, d]) => b.set(ref, d))
        await b.commit()
        setMsg(`กำลังกู้คืน ${Math.min(i + 400, jobs.length).toLocaleString()} / ${jobs.length.toLocaleString()}`)
      }
      setMsg(`กู้คืนแล้ว ${jobs.length.toLocaleString()} รายการ`); setPick(null); setOk(false)
    } catch (e) { setErr('กู้คืนไม่สำเร็จ: ' + (e.code || e.message)) } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <h1>สำรองข้อมูล</h1>
      <div className="card stack">
        <h3>สำรองข้อมูลทั้งระบบ</h3>
        <div className="small muted">ดาวน์โหลดข้อมูลทั้งหมด (นักเรียน คะแนน กิจกรรม ใบแจ้งผล ลายเซ็น การตั้งค่า ฯลฯ) เป็นไฟล์เดียว แนะนำให้ทำทุกสิ้นภาคเรียน และก่อนปิดปีการศึกษา ไฟล์นี้มีข้อมูลนักเรียน ควรเก็บไว้เฉพาะในที่ปลอดภัย</div>
        <div><button className="btn" disabled={busy} onClick={exportAll}>{busy && !pick ? 'กำลังทำงาน...' : 'ดาวน์โหลดไฟล์สำรอง'}</button></div>
      </div>
      {isSuper && (
        <div className="card stack">
          <h3>กู้คืนจากไฟล์สำรอง</h3>
          <div className="small muted">เขียนข้อมูลจากไฟล์ทับรายการที่มี id เดียวกัน (รายการที่เพิ่มใหม่หลังวันที่สำรองจะไม่ถูกลบ) ไม่กู้บัญชีผู้ใช้ — บัญชีครูต้องยังอยู่ในระบบ</div>
          <input type="file" accept="application/json,.json" onChange={(e) => choose(e.target.files[0])} disabled={busy} />
          {pick && (
            <div className="stack">
              <div className="small">ไฟล์ {pick.name} · สำรองเมื่อ {pick.at ? new Date(pick.at).toLocaleString('th-TH') : '-'}</div>
              <ul className="small" style={{ margin: 0 }}>{RESTORE.map((c) => <li key={c}>{LABEL[c]}: {(pick.data[c] || []).length.toLocaleString()}</li>)}</ul>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={ok} onChange={(e) => setOk(e.target.checked)} /> ฉันเข้าใจว่าข้อมูลปัจจุบันที่ id ตรงกันจะถูกเขียนทับ</label>
              <div><button className="btn" disabled={!ok || busy} onClick={restore}>{busy ? 'กำลังกู้คืน...' : 'กู้คืนข้อมูล'}</button></div>
            </div>
          )}
        </div>
      )}
      {msg && <div className="small">{msg}</div>}
      {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import { LEVELS, STUDENT_STATUS, isAdminRole } from '../lib/constants'
import { readStudentFile } from '../lib/importStudents'
import { addStudents, nextNo, promoteAll, promotionPlan, updateStudent } from '../lib/studentsDb'

const ST_LABEL = { ok: 'นำเข้า', dup: 'ซ้ำ ข้าม', level: 'ชั้นไม่ถูกต้อง ข้าม' }

function Log() {
  const [log, setLog] = useState([])
  useEffect(() => onSnapshot(query(collection(db, 'studentLog'), orderBy('ts', 'desc'), limit(50)),
    (s) => setLog(s.docs.map((d) => d.data()))), [])
  return (
    <div className="card stack">
      <h3>ประวัติการแก้ไขรายชื่อ (50 รายการล่าสุด)</h3>
      {log.map((l, i) => <div className="small" key={i}><span className="muted">{l.at} · {l.by}</span> — {l.text}</div>)}
      {!log.length && <div className="small muted">ยังไม่มีประวัติ</div>}
    </div>
  )
}

export default function Students() {
  const { user } = useAuth()
  const { students, activeStudents } = useData()
  const [level, setLevel] = useState('ป.1')
  const [name, setName] = useState('')
  const [sid, setSid] = useState('')
  const [bulk, setBulk] = useState('')
  const [imp, setImp] = useState(null)
  const [edit, setEdit] = useState(null)
  const [promo, setPromo] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const list = useMemo(() => students
    .filter((s) => s.level === level && (showAll || (s.status || 'active') === 'active'))
    .sort((a, b) => (a.no || 0) - (b.no || 0)), [students, level, showAll])

  if (!isAdminRole(user.role)) return <div className="card empty">เฉพาะแอดมินจัดการรายชื่อนักเรียนได้</div>

  const run = async (fn) => {
    setBusy(true); setMsg('')
    try { await fn() } catch (e) { setMsg(e.message || 'เกิดข้อผิดพลาด') } finally { setBusy(false) }
  }
  const addOne = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    run(async () => { await addStudents([{ name: n, level, sid: sid.trim() }], students, user.name, `เพิ่ม ${n} (${level})`); setName(''); setSid('') })
  }
  const addBulk = () => {
    // บรรทัดละคน: "ชื่อ-สกุล" หรือ "เลขประจำตัว<แท็บ/จุลภาค/เว้นวรรค>ชื่อ-สกุล" (เลขที่ 1 ขึ้นไปรันให้เอง)
    const items = bulk.split('\n').map((x) => x.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d{3,})\s*[\t,;]\s*(.+)$/) || l.match(/^(\d{3,})\s+(.+)$/)
      return m ? { sid: m[1], name: m[2].trim(), level } : { name: l, level }
    })
    if (!items.length) return
    run(async () => {
      const c = await addStudents(items, students, user.name, `เพิ่มหลายคน ${items.length} คน (${level})`)
      setBulk(''); setMsg(`เพิ่มแล้ว ${c} คน`)
    })
  }
  const pick = (e) => {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    run(async () => setImp(await readStudentFile(f, level, activeStudents)))
  }
  const confirmImport = () => run(async () => {
    const ok = imp.rows.filter((r) => r.st === 'ok')
    const c = await addStudents(ok, students, user.name, `นำเข้าจากไฟล์ ${ok.length} คน`)
    setImp(null); setMsg(`นำเข้าแล้ว ${c} คน`)
  })
  const saveEdit = () => run(async () => {
    const next = { ...edit.draft, no: Number(edit.draft.no) || edit.orig.no, name: edit.draft.name.trim() || edit.orig.name, sid: (edit.draft.sid || '').trim() }
    await updateStudent(edit.orig, next, user.name)
    setEdit(null)
  })
  const doPromote = () => run(async () => {
    const c = await promoteAll(students, user.name)
    setPromo(false); setMsg(`เลื่อนชั้นแล้ว ${c} คน`)
  })

  return (
    <div className="stack">
      <div className="row">
        {LEVELS.map((l) => <button key={l} className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>{l}</button>)}
      </div>
      {msg && <div className="notice">{msg}</div>}

      <div className="card stack">
        <h3>เพิ่มนักเรียน {level} <span className="muted small">(เลขที่ถัดไป {nextNo(students, level)})</span></h3>
        <form className="row" onSubmit={addOne}>
          <input placeholder="ชื่อ-สกุล" value={name} onChange={(e) => setName(e.target.value)} size={28} />
          <input placeholder="เลขประจำตัว (ถ้ามี)" value={sid} onChange={(e) => setSid(e.target.value)} size={16} inputMode="numeric" />
          <button className="btn" disabled={busy}>เพิ่ม</button>
          <label className="btn alt" style={{ cursor: 'pointer' }}>
            นำเข้าไฟล์ Excel/CSV<input type="file" accept=".xlsx,.csv,.txt" hidden onChange={pick} />
          </label>
        </form>
        <details>
          <summary className="small">วางรายชื่อหลายคน (บรรทัดละคน)</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <textarea rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'เด็กชายสมชาย ใจดี\nเด็กหญิงสมหญิง รักเรียน\n12345  เด็กชายมานะ ตั้งใจ   (ใส่เลขประจำตัวนำหน้าได้)'} />
            <div><button className="btn sm" disabled={busy} onClick={addBulk}>เพิ่มทั้งหมด</button></div>
          </div>
        </details>
      </div>

      {imp && (
        <div className="card stack">
          <h3>ตรวจรายชื่อก่อนนำเข้า ({imp.rows.filter((r) => r.st === 'ok').length} จาก {imp.rows.length} รายการ)</h3>
          <div className="tw" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th><th>ชั้น</th><th>ผล</th></tr></thead>
              <tbody>{imp.rows.map((r, i) => (
                <tr key={i}><td>{r.no || '-'}</td><td>{r.sid || '-'}</td><td>{r.name}</td><td>{r.level}</td>
                  <td><span className={`pill ${r.st === 'ok' ? 'p-good' : 'p-warn'}`}>{ST_LABEL[r.st]}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={confirmImport}>ยืนยันนำเข้า</button>
            <button className="btn alt" onClick={() => setImp(null)}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label className="small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> แสดงย้ายออก/จบแล้วด้วย</label>
        <div className="row">
          <button className="btn sm alt" onClick={() => setShowLog(!showLog)}>ประวัติแก้ไข</button>
          <button className="btn sm" onClick={() => setPromo(!promo)}>เลื่อนชั้นประจำปี</button>
        </div>
      </div>

      {promo && (
        <div className="card stack">
          <h3>ตัวอย่างการเลื่อนชั้น (เฉพาะที่กำลังเรียน)</h3>
          <div className="small">{promotionPlan(students).filter((p) => p.count).map((p) => `${p.level} → ${p.to} (${p.count} คน)`).join(' · ') || 'ไม่มีนักเรียน'}</div>
          <div className="row">
            <button className="btn" disabled={busy || !activeStudents.length} onClick={doPromote}>ยืนยันเลื่อนชั้น</button>
            <button className="btn alt" onClick={() => setPromo(false)}>ยกเลิก</button>
          </div>
        </div>
      )}
      {showLog && <Log />}

      <div className="tw">
        <table>
          <thead><tr><th>เลขที่</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {list.map((s) => {
              const ed = edit && edit.orig.id === s.id
              return (
                <tr key={s.id}>
                  <td>{ed ? <input size={3} value={edit.draft.no} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, no: e.target.value } })} /> : s.no}</td>
                  <td>{ed ? <input size={10} value={edit.draft.sid} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, sid: e.target.value } })} /> : (s.sid || <span className="muted">-</span>)}</td>
                  <td>{ed ? <input value={edit.draft.name} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, name: e.target.value } })} /> : s.name}</td>
                  <td>{ed
                    ? <select value={edit.draft.status} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, status: e.target.value } })}>
                        {Object.entries(STUDENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    : <span className={`pill ${(s.status || 'active') === 'active' ? 'p-good' : 'p-warn'}`}>{STUDENT_STATUS[s.status || 'active']}</span>}</td>
                  <td>{ed
                    ? <><button className="btn sm" disabled={busy} onClick={saveEdit}>บันทึก</button> <button className="btn sm alt" onClick={() => setEdit(null)}>ยกเลิก</button></>
                    : <button className="btn sm alt" onClick={() => setEdit({ orig: s, draft: { name: s.name, sid: s.sid || '', no: s.no, level: s.level, status: s.status || 'active' } })}>แก้ไข</button>}</td>
                </tr>
              )
            })}
            {!list.length && <tr><td colSpan={5} className="empty">ยังไม่มีนักเรียนในชั้น {level}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

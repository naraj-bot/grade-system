import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import Catalog from './Catalog'
import { useAllRegs, useRegs } from '../lib/useRegs'
import { notify } from '../lib/notify'
import { ask, tell } from '../lib/dialog'
import { LEVELS, REG_STATUS, isAdminRole } from '../lib/constants'

const Row = memo(function Row({ c, on, onToggle, taken }) {
  return (
    <tr>
      <td><input type="checkbox" checked={on} aria-label={`เลือก ${c.name}`} onChange={() => onToggle(c.code)} /></td>
      <td>{c.level}</td><td>{c.code}</td><td>{c.name}{taken && <div className="small" style={{ color: 'var(--bad, #b3261e)' }}>มีครูลงทะเบียนแล้ว: {taken}</div>}</td>
    </tr>
  )
})

// คำขอแก้ไขการลงทะเบียน (หลังอนุมัติแล้ว): เก็บรายการใหม่ไว้ใน reqCodes โดย codes เดิมยังใช้งานได้
// ครูจึงกรอกคะแนนวิชาเดิมต่อได้ระหว่างรอแอดมินอนุมัติ
const diffOf = (from, to) => ({ add: to.filter((c) => !from.includes(c)), del: from.filter((c) => !to.includes(c)) })
const nameOf = (catalog, code) => { const x = catalog.find((y) => y.code === code); return x ? `${x.level} ${code} ${x.name}` : code }
function ReqDiff({ r, catalog }) {
  const { add, del } = diffOf(r.codes || [], r.reqCodes || [])
  return (
    <div className="small stack" style={{ gap: 2 }}>
      {add.length > 0 && <div style={{ color: '#2e7d32' }}><b>ขอเพิ่ม:</b> {add.map((c) => nameOf(catalog, c)).join(' · ')}</div>}
      {del.length > 0 && <div style={{ color: 'var(--bad, #b3261e)' }}><b>ขอเอาออก:</b> {del.map((c) => nameOf(catalog, c)).join(' · ')}</div>}
      {!add.length && !del.length && <div className="muted">ไม่มีการเปลี่ยนแปลง</div>}
    </div>
  )
}

const pillOf = (s) => (s === 'ok' ? 'p-good' : s === 'pending' ? 'p-warn' : 'p-bad')

function Codes({ codes, catalog }) {
  // จัดกลุ่มตามชั้น: แถวละชั้น  [ชั้น] วิชา · วิชา · วิชา
  const by = {}
  codes.forEach((c) => {
    const x = catalog.find((y) => y.code === c)
    const L = x ? x.level : '?'
    ;(by[L] = by[L] || []).push(x ? x.name : c)
  })
  const order = [...LEVELS, '?'].filter((l) => by[l])
  return (
    <div className="regsum">
      {order.map((l) => (
        <div className="rs-row" key={l}>
          <span className="rs-lv">{l === '?' ? 'อื่นๆ' : l}</span>
          <span className="rs-sub">{by[l].join('  ·  ')}</span>
        </div>
      ))}
    </div>
  )
}

// แอดมิน: อนุมัติ/ส่งกลับใบลงทะเบียนสอนของครู
function AdminView({ regs }) {
  const { user } = useAuth()
  const { term, catalog } = useData()
  const [msgs, setMsgs] = useState({})
  const list = regs.filter((r) => r.term === term)
    .sort((a, b) => (!!b.reqCodes - !!a.reqCodes) || (Math.max(b.updatedAt || 0, b.reqAt || 0) - Math.max(a.updatedAt || 0, a.reqAt || 0)))
  // อนุมัติ/ส่งกลับคำขอแก้ไข (ใบที่อนุมัติไปแล้ว)
  const actReq = async (r, ok) => {
    const msg = (msgs[r.id] || '').trim()
    if (!ok && !msg) return tell({ title: 'ยังไม่ได้พิมพ์ข้อความ', text: 'พิมพ์ข้อความถึงครูก่อนส่งกลับคำขอ', tone: 'warn' })
    if (ok) {
      const { del } = diffOf(r.codes || [], r.reqCodes || [])
      if (del.length && !(await ask({ title: 'ยืนยันเอาวิชาออก?', text: `${del.map((c) => nameOf(catalog, c)).join('\n')}\n\nคะแนนที่กรอกไว้ยังเก็บอยู่ในระบบ แต่ครูท่านนี้จะเข้าไปแก้วิชาเหล่านี้ไม่ได้อีก`, ok: 'อนุมัติ', cancel: 'ยกเลิก', danger: true }))) return
      await updateDoc(doc(db, 'registrations', r.id), { codes: r.reqCodes, reqCodes: deleteField(), reqAt: deleteField(), reqMsg: '', msg: '', updatedAt: Date.now() })
    } else {
      await updateDoc(doc(db, 'registrations', r.id), { reqCodes: deleteField(), reqAt: deleteField(), reqMsg: msg })
    }
    setMsgs({ ...msgs, [r.id]: '' })
    notify(r.uid, ok ? `แอดมินอนุมัติการแก้ไขการลงทะเบียนสอนแล้ว (ภาคเรียนที่ ${r.term})` : `แอดมินส่งคำขอแก้ไขการลงทะเบียนกลับ: ${msg}`, 'reg', user.uid)
  }
  const act = async (r, status) => {
    if (status === 'back' && !(msgs[r.id] || '').trim()) return tell({ title: 'ยังไม่ได้พิมพ์ข้อความ', text: 'พิมพ์ข้อความถึงครูก่อนส่งกลับ เพื่อให้ครูรู้ว่าต้องแก้อะไร', tone: 'warn' })
    const msg = status === 'back' ? msgs[r.id].trim() : ''
    await updateDoc(doc(db, 'registrations', r.id), { status, msg, updatedAt: Date.now() })
    notify(r.uid, status === 'ok' ? `แอดมินอนุมัติการลงทะเบียนสอนของคุณแล้ว (ภาคเรียนที่ ${r.term})` : `แอดมินส่งการลงทะเบียนกลับ: ${msg}`, 'reg', user.uid)
  }
  return (
    <div className="stack">
      {list.map((r) => (
        <div className="card stack" key={r.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{r.name}</b><span>{r.reqCodes && <span className="pill p-warn">ขอแก้ไข</span>} <span className={`pill ${pillOf(r.status)}`}>{REG_STATUS[r.status]}</span></span>
          </div>
          <Codes codes={r.codes} catalog={catalog} />
          {r.reqCodes && (
            <div className="lock stack">
              <b className="small">คำขอแก้ไขการลงทะเบียน (วิชาเดิมยังใช้งานได้ระหว่างรออนุมัติ)</b>
              <ReqDiff r={r} catalog={catalog} />
              <div className="row">
                <button className="btn sm" onClick={() => actReq(r, true)}>อนุมัติการแก้ไข</button>
                <input placeholder="ข้อความถึงครู (ถ้าไม่อนุมัติ)" size={26} value={msgs[r.id] || ''}
                  onChange={(e) => setMsgs({ ...msgs, [r.id]: e.target.value })} />
                <button className="btn sm alt" onClick={() => actReq(r, false)}>ส่งกลับคำขอ</button>
              </div>
            </div>
          )}
          {r.msg && <div className="small muted">ข้อความถึงครู: {r.msg}</div>}
          {r.status === 'pending' && (
            <div className="row">
              <button className="btn sm" onClick={() => act(r, 'ok')}>อนุมัติ</button>
              <input placeholder="ข้อความถึงครู (ถ้าไม่ถูกต้อง)" size={26} value={msgs[r.id] || ''}
                onChange={(e) => setMsgs({ ...msgs, [r.id]: e.target.value })} />
              <button className="btn sm alt" onClick={() => act(r, 'back')}>ส่งกลับ</button>
            </div>
          )}
        </div>
      ))}
      {!list.length && <div className="card empty">ยังไม่มีครูท่านอื่นส่งลงทะเบียนในภาคเรียนนี้ (วิชาของคุณเองอยู่ในกล่อง "วิชาที่ฉันสอน" ด้านบน)</div>}
    </div>
  )
}

// ครู: เลือกชั้น (หลายชั้น) แล้วติ๊กวิชาที่สอน ส่งให้แอดมินอนุมัติทุกภาคเรียน
function TeacherView({ regs, all }) {
  const { user } = useAuth()
  const { openYear, term, termCatalog, catalog, openSet } = useData()
  const admin = isAdminRole(user.role)
  const mine = regs.find((r) => r.term === term && r.uid === user.uid)
  // วิชาที่ครูท่านอื่นลงทะเบียนไว้แล้ว (ภาคเรียนเดียวกัน) → รหัส: "ชื่อครู (สถานะ)"
  const takenMap = useMemo(() => {
    const m = {}
    all.filter((r) => r.term === term && r.uid !== user.uid && r.status !== 'back').forEach((r) => {
      (r.codes || []).forEach((code) => { (m[code] ||= []).push(`${r.name || 'ครู'}${r.status === 'ok' ? '' : ' (รออนุมัติ)'}`) })
      ;(r.reqCodes || []).filter((code) => !(r.codes || []).includes(code)).forEach((code) => { (m[code] ||= []).push(`${r.name || 'ครู'} (ขอเพิ่ม รออนุมัติ)`) })
    })
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.join(', ')]))
  }, [all, term, user.uid])
  const [levels, setLevels] = useState(() => new Set(mine ? mine.codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean) : []))
  const [picked, setPicked] = useState(() => new Set(mine ? mine.codes : []))
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  // เริ่มเลือกจาก: คำขอแก้ไขที่ค้างอยู่ (ถ้ามี) หรือรายการวิชาปัจจุบัน
  const startFrom = (m) => {
    const codes = m ? (m.reqCodes || m.codes) : []
    setPicked(new Set(codes))
    setViewLv((v) => v || catalog.find((x) => x.code === codes[0])?.level || null)
    setLevels(new Set(codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean)))
  }
  useEffect(() => {
    if (!mine) return
    startFrom(mine)
    setEditing(false)
  }, [mine?.updatedAt, mine?.status, mine?.reqAt])
  // เปลี่ยนภาคเรียน/ปี: เริ่มใหม่จากใบลงทะเบียนของภาคนั้น (ไม่ค้างของภาคก่อน)
  useEffect(() => {
    setPicked(new Set(mine ? mine.codes : []))
    setLevels(new Set(mine ? mine.codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean) : []))
  }, [term, openYear?.year])
  // แสดงทีละชั้น (ไม่รวมหลายชั้นในตารางเดียว) วิชาที่ติ๊กไว้ในชั้นอื่นยังอยู่ครบ
  const [viewLv, setViewLv] = useState(() => (mine && mine.codes.length ? catalog.find((x) => x.code === mine.codes[0])?.level : null) || null)
  const lvOf = (code) => catalog.find((x) => x.code === code)?.level
  const pickedBy = (l) => [...picked].filter((code) => lvOf(code) === l).length
  const subj = useMemo(() => termCatalog.filter((c) => c.level === viewLv && openSet.has(c.code)), [termCatalog, viewLv, openSet])
  // เปลี่ยนชั้น: ชั้นที่เอาออก → ล้างวิชาที่เคยติ๊กไว้ของชั้นนั้นด้วย
  const toggleLevel = (l) => {
    const n = new Set(levels)
    if (n.has(l)) {
      n.delete(l)
      setPicked((p) => new Set([...p].filter((code) => catalog.find((x) => x.code === code)?.level !== l)))
    } else n.add(l)
    setLevels(n)
  }
  const togglePick = useCallback((code) => setPicked((p) => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n }), [])
  const clearAll = async () => {
    if (picked.size && !(await ask({ title: 'ล้างวิชาที่เลือกทั้งหมด?', text: `เอาติ๊กออกทั้ง ${picked.size} วิชา (ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึก)`, ok: 'ล้างทั้งหมด', cancel: 'ไม่ล้าง', danger: true }))) return
    setLevels(new Set()); setPicked(new Set())
  }
  const approved = !admin && mine?.status === 'ok'
  const locked = approved && !editing

  // ครูที่อนุมัติแล้ว: ส่งคำขอแก้ไข (เพิ่ม/เอาวิชาออก) โดยไม่เสียสิทธิ์วิชาเดิมระหว่างรอ
  const submitReq = async (codes) => {
    const { add, del } = diffOf(mine.codes, codes)
    if (!add.length && !del.length) return tell({ title: 'ยังไม่มีการเปลี่ยนแปลง', text: 'รายการวิชาเหมือนที่อนุมัติไว้แล้ว', tone: 'warn' })
    setBusy(true)
    try {
      await updateDoc(doc(db, 'registrations', mine.id), { reqCodes: codes, reqAt: Date.now(), reqMsg: '' })
      notify('admins', `${user.name} ขอแก้ไขการลงทะเบียนสอน (ภาคเรียนที่ ${term})${add.length ? ` เพิ่ม ${add.length} วิชา` : ''}${del.length ? ` เอาออก ${del.length} วิชา` : ''} รออนุมัติ`, 'reg', user.uid)
      tell({ title: 'ส่งคำขอแล้ว', text: 'ระหว่างรอแอดมินอนุมัติ ยังกรอกคะแนนวิชาเดิมได้ตามปกติ', tone: 'ok' })
    } catch (e) {
      tell({ title: 'ส่งคำขอไม่สำเร็จ', text: 'ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งแอดมินตรวจ Firestore rules (' + (e.code || e.message) + ')', tone: 'warn' })
    } finally { setBusy(false) }
  }
  const cancelReq = async () => {
    if (!(await ask({ title: 'ยกเลิกคำขอแก้ไข?', text: 'การลงทะเบียนจะกลับเป็นรายการที่อนุมัติไว้เดิม', ok: 'ยกเลิกคำขอ', cancel: 'ไม่ทำ' }))) return
    await updateDoc(doc(db, 'registrations', mine.id), { reqCodes: deleteField(), reqAt: deleteField() })
  }

  const submit = async () => {
    // กันเผลอเอาติ๊กวิชาที่บันทึกไว้แล้วออก: ถามยืนยันก่อนบันทึกเสมอ
    const saved = mine ? (mine.reqCodes || mine.codes) : []
    const removed = saved.filter((code) => !picked.has(code))
    if (removed.length && !(await ask({ title: `เอาวิชาออก ${removed.length} วิชา?`, text: removed.map((code) => { const x = catalog.find((y) => y.code === code); return x ? `${x.level} ${code} ${x.name}` : code }).join('\n') + '\n\nถ้าไม่ได้ตั้งใจเอาออก กด "ไม่ใช่" แล้วติ๊กกลับ', ok: 'ใช่ เอาออก', cancel: 'ไม่ใช่', danger: true }))) return
    const codes = [...picked].filter((code) => levels.has(catalog.find((x) => x.code === code)?.level))
    if (!codes.length) return tell({ title: 'ยังไม่ได้เลือกวิชา', text: 'เลือกวิชาที่สอนอย่างน้อย 1 วิชา', tone: 'warn' })
    const dup = codes.filter((code) => takenMap[code] && !(mine?.codes || []).includes(code))
    if (dup.length) {
      const lines = dup.map((code) => `• ${code} ${catalog.find((x) => x.code === code)?.name || ''} — ${takenMap[code]}`).join('\n')
      const go = await ask({ title: 'มีครูท่านอื่นลงทะเบียนวิชานี้แล้ว', text: `${lines}\n\nหากสอนร่วมหรือสอนคนละห้อง กด “ลงทะเบียนต่อ” ได้ แต่ถ้าเลือกผิด ให้กลับไปแก้ก่อน`, ok: 'ลงทะเบียนต่อ', cancel: 'กลับไปแก้' })
      if (!go) return
    }
    if (approved) return submitReq(codes)
    setBusy(true)
    try {
      await setDoc(doc(db, 'registrations', `${openYear.year}_${term}_${user.uid}`), {
        year: openYear.year, term, uid: user.uid, name: user.name,
        codes, status: admin ? 'ok' : 'pending', msg: '', updatedAt: Date.now(),
      })
      if (!admin) notify('admins', `${user.name} ส่งลงทะเบียนสอน ${codes.length} วิชา (ภาคเรียนที่ ${term}) รออนุมัติ`, 'reg', user.uid)
      tell({ title: 'บันทึกแล้ว', text: admin ? `บันทึกวิชาที่สอน ${codes.length} วิชา (ภาคเรียนที่ ${term}) แล้ว` : `ส่งให้แอดมินอนุมัติแล้ว (${codes.length} วิชา)`, tone: 'ok' })
    } catch (e) {
      tell({ title: 'บันทึกไม่สำเร็จ', text: 'ลองใหม่อีกครั้ง หากยังไม่ได้ให้ตรวจ Firestore rules (' + (e.code || e.message) + ')', tone: 'warn' })
    } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      {mine && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{admin ? 'วิชาที่ฉันสอน' : 'การลงทะเบียนของคุณ'} (ภาคเรียนที่ {term})</b><span className={`pill ${pillOf(mine.status)}`}>{REG_STATUS[mine.status]}</span>
          </div>
          <Codes codes={mine.codes} catalog={catalog} />
          {mine.msg && <div className="lock small">ข้อความจากแอดมิน: {mine.msg}</div>}
          {mine.reqCodes && (
            <div className="lock stack">
              <b className="small">คำขอแก้ไขของคุณ รอแอดมินอนุมัติ (ระหว่างนี้ยังกรอกคะแนนวิชาเดิมได้)</b>
              <ReqDiff r={mine} catalog={catalog} />
              {!editing && <div className="row"><button className="btn sm alt" onClick={() => setEditing(true)}>แก้คำขอ</button><button className="btn sm alt" onClick={cancelReq}>ยกเลิกคำขอ</button></div>}
            </div>
          )}
          {!mine.reqCodes && mine.reqMsg && <div className="lock small">คำขอแก้ไขครั้งล่าสุดถูกส่งกลับ: {mine.reqMsg}</div>}
          {approved && !mine.reqCodes && !editing && (
            <div className="row"><button className="btn sm" onClick={() => { startFrom(mine); setEditing(true) }}>แก้ไขการลงทะเบียน (เพิ่ม/เอาวิชาออก)</button>
              <span className="small muted">ส่งให้แอดมินอนุมัติอีกครั้ง วิชาเดิมยังใช้งานได้ระหว่างรอ</span></div>
          )}
        </div>
      )}
      {locked ? null : (
        <div className="card stack">
          {approved && <div className="row" style={{ justifyContent: 'space-between' }}><b>แก้ไขการลงทะเบียน</b><button className="btn sm alt" onClick={() => { startFrom(mine); setEditing(false) }}>ปิด ไม่แก้ไข</button></div>}
          <h3>1. เลือกชั้น (ดูทีละชั้น วิชาที่ติ๊กไว้ในชั้นอื่นยังอยู่)</h3>
          <div className="row">
            {LEVELS.map((l) => { const n = pickedBy(l); return <button key={l} className={`chip${n ? ' has' : ''}`} aria-pressed={viewLv === l} onClick={() => setViewLv(l)}>{l}{n ? ` · ${n}` : ''}</button> })}
            {picked.size > 0 && <button className="btn sm alt" onClick={clearAll}>ล้างที่เลือกทั้งหมด</button>}
          </div>
          {picked.size > 0 && (
            <div className="lock stack" style={{ gap: 6 }}>
              <b className="small">วิชาที่เลือกไว้ทั้งหมด {picked.size} วิชา</b>
              <div className="row" style={{ gap: 6 }}>
                {[...picked].map((code) => ({ code, x: catalog.find((y) => y.code === code) })).sort((a, b) => (a.x?.level || '').localeCompare(b.x?.level || '', 'th') || a.code.localeCompare(b.code)).map(({ code, x }) => (
                  <span key={code} className="pill p-gold" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{x ? `${x.level} ${code} ${x.name}` : code}
                    <button type="button" className="xbtn" aria-label={`เอา ${code} ออก`} onClick={() => togglePick(code)}>×</button></span>
                ))}
              </div>
            </div>
          )}
          <h3>2. เลือกวิชา{viewLv ? ` ชั้น ${viewLv}` : ''}</h3>
          <div className="tw regtw">
            <table>
              <thead><tr><th></th><th>ชั้น</th><th>รหัส</th><th>รายวิชา</th></tr></thead>
              <tbody>
                {subj.map((c) => <Row key={c.code} c={c} on={picked.has(c.code)} onToggle={togglePick} taken={takenMap[c.code]} />)}
                {!subj.length && <tr><td colSpan={4} className="empty">{viewLv ? `ชั้น ${viewLv} ยังไม่มีวิชาที่เปิดสอนในภาคเรียนนี้` : 'เลือกชั้นก่อน (แสดงเฉพาะวิชาที่แอดมินเปิดสอนแล้ว)'}</td></tr>}
              </tbody>
            </table>
          </div>
          {[...picked].some((c) => takenMap[c]) && <div className="lock small">วิชาที่เลือกมีครูท่านอื่นลงทะเบียนแล้ว: {[...picked].filter((c) => takenMap[c]).map((c) => `${c} (${takenMap[c]})`).join(' · ')}</div>}
          <div className="row"><button className="btn" disabled={busy} onClick={submit}>{admin ? `บันทึกวิชาที่ฉันสอน (${picked.size} วิชา)` : approved ? `ส่งคำขอแก้ไขให้แอดมิน (${picked.size} วิชา)` : `ส่งให้แอดมินอนุมัติ (${picked.size} วิชา)`}</button></div>
        </div>
      )}
    </div>
  )
}

export default function Registration() {
  const { user } = useAuth()
  const { openYear } = useData()
  const regs = useRegs()
  const all = useAllRegs()
  if (!openYear) return <div className="stack"><div className="card tplbar"><b>ยังไม่กำหนดปีการศึกษา</b> — ลงทะเบียนสอนยังไม่ได้ ดูรายวิชาทั้งหมดได้ด้านล่าง (แอดมินหลักเปิดปีการศึกษาได้ที่เมนู "ปีการศึกษา")</div><Catalog /></div>
  if (!isAdminRole(user.role)) return <TeacherView regs={regs} all={all} />
  return (
    <div className="stack">
      <div className="small muted">แอดมินที่สอนด้วย: เลือกวิชาของตัวเองด้านล่าง (อนุมัติให้เองทันที) ส่วนรายการอนุมัติของครูอยู่ถัดลงไป</div>
      <TeacherView regs={regs} all={all} />
      <h3>อนุมัติการลงทะเบียนของครู</h3>
      <AdminView regs={regs.filter((r) => r.uid !== user.uid)} />
    </div>
  )
}

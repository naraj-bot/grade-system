import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { printCss } from '../engine/printcss'
import InstallButton from '../components/InstallButton'

// นักเรียนดูผลการเรียน (ไม่ต้องล็อกอิน): กรอกเลขประจำตัวด้วยแป้นตัวเลข → ขอผลจาก /api/student-result
const KEY = 'stuResult'
export const saveStu = (v) => { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY) } catch { /* ไม่เป็นไร */ } }
const loadStu = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null } }

export async function fetchResult(sid, year, term) {
  const q = new URLSearchParams({ sid })
  if (year) { q.set('year', year); q.set('term', term) }
  const r = await fetch('/api/student-result?' + q.toString())
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง')
  return j
}

// แป้นตัวเลข + ช่องแสดงเลข (ใช้ทั้งในหน้า /student และหน้าต่างเด้งบนหน้าแรก)
export function StudentKeypad({ onDone, compact }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const press = (d) => { setErr(''); setV((x) => (x.length < 10 ? x + d : x)) }
  const go = async () => {
    if (v.length < 4 || busy) return
    setBusy(true); setErr('')
    try { onDone(await fetchResult(v), v) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  useEffect(() => {
    const k = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setV((x) => x.slice(0, -1))
      else if (e.key === 'Enter') go()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  return (
    <div className={`sp-pad${compact ? ' compact' : ''}`}>
      <div className="sp-disp-wrap">
        <span id="sp-lbl" className="sp-lbl">กรอกเลขประจำตัวนักเรียน</span>
        <div className={`sp-disp${v ? ' on' : ''}${err ? ' bad' : ''}`} role="textbox" aria-readonly="true" aria-labelledby="sp-lbl">{v || '·····'}</div>
        {err ? <span className="sp-err" role="alert">{err}</span>
          : <span className="sp-hint"><span className="nw">ไม่ทราบเลขประจำตัว</span><span className="nw">ดูได้ที่บัตรนักเรียน</span><span className="nw">หรือสอบถามครูประจำชั้น</span></span>}
      </div>
      <div className="sp-keys">
        <div className="sp-grid">
          {'123456789'.split('').map((d) => <button key={d} type="button" className="sp-key" onClick={() => press(d)}>{d}</button>)}
          <button type="button" className="sp-key ghost" onClick={() => { setV(''); setErr('') }}>ล้าง</button>
          <button type="button" className="sp-key" onClick={() => press('0')}>0</button>
          <button type="button" className="sp-key ghost" aria-label="ลบตัวเลขล่าสุด" onClick={() => setV((x) => x.slice(0, -1))}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="m18 9-6 6" /><path d="m12 9 6 6" /></svg>
          </button>
        </div>
        <button type="button" className="sp-go" disabled={v.length < 4 || busy} onClick={go}>{busy ? 'กำลังค้นหา…' : 'ดูผลการเรียน'}</button>
      </div>
    </div>
  )
}

const gradeTone = (g) => { const n = parseFloat(g); return isNaN(n) ? 'g-x' : n >= 3.5 ? 'g-a' : n >= 2.5 ? 'g-b' : n >= 1 ? 'g-c' : 'g-f' }
const cr1 = (x) => (x == null ? '-' : (Math.round(x * 10) / 10).toFixed(1))

function printReport(html, title) {
  const w = window.open('', '_blank')
  if (!w) return alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ อนุญาตป๊อปอัปสำหรับเว็บนี้แล้วลองอีกครั้ง')
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${printCss(location.origin)}</style></head><body>${html}</body></html>`)
  w.document.close()
  const go = () => setTimeout(() => { w.focus(); w.print() }, 400)
  if (w.document.fonts && w.document.fonts.ready) w.document.fonts.ready.then(go); else w.onload = go
}

function ResultView({ stu, onLogout, onTerm, busy }) {
  const { student: s, terms, result: r } = stu.data
  const p1 = r.mode === 'p1'
  const tk = r.year + '_' + r.term
  return (
    <div className="sp-res">
      <div className="sp-scroll">
        <div className="sp-rtop">
          <img src="/logo.png" alt="ตราโรงเรียนวัดบางปูน" />
          <div><b>ผลการเรียน</b><span>โรงเรียนวัดบางปูน</span></div>
          <button type="button" className="sp-out" onClick={onLogout}>ออก</button>
        </div>
        <label className="sp-term">
          <span>ภาคเรียน :</span>
          <select value={tk} disabled={busy} onChange={(e) => { const [y, t] = e.target.value.split('_'); onTerm(y, t) }}>
            {terms.map((t) => <option key={t.year + '_' + t.term} value={t.year + '_' + t.term}>{t.term}/{t.year}</option>)}
          </select>
        </label>
        <div className="sp-sum">
          <div className="sp-who">
            <b>{s.name}</b>
            <div className="sp-tags"><span>ชั้น {s.level}</span><span>เลขที่ {s.no}</span><span>เลขประจำตัว {s.sid}</span></div>
          </div>
          <div className="sp-stats">
            <div className="gpa"><span>GPA</span><b>{r.gpa == null ? '-' : r.gpa.toFixed(2)}</b></div>
            <div><span>{r.crW}ที่ลง</span><b>{cr1(r.crAll)}</b></div>
            <div><span>{r.crW}ที่ได้</span><b>{p1 ? '-' : cr1(r.crGot)}</b></div>
            <div><span>กิจกรรม</span><b>{r.actAll == null ? '-' : r.actAll === 'ผ' ? 'ผ่าน' : r.actAll === 'มผ' ? 'ไม่ผ่าน' : '-'}</b></div>
          </div>
        </div>
        {p1 && <div className="sp-note">ภาคเรียนที่ 1 ของประถมแจ้งคะแนน (เต็มวิชาละ 50) ยังไม่ตัดสินระดับผลการเรียน ผลทั้งปีประกาศเมื่อสิ้นภาคเรียนที่ 2</div>}
        <div className="sp-h"><b>รายวิชา {r.subjects.length} วิชา</b><span>{r.showScore ? 'เกรดและคะแนน' : 'แสดงเฉพาะเกรด'}</span></div>
        <div className="sp-list">
          {r.subjects.map((x) => {
            const g = x.after !== '' && x.after != null ? x.after : x.grade
            return (
              <div className="sp-row" key={x.code}>
                <div className={`sp-g ${gradeTone(g)}`} aria-label={`ผลการเรียน ${g ?? '-'}`}>{g ?? '-'}</div>
                <div className="sp-info">
                  <div className="sp-meta"><span>{x.code} · {x.type}</span><span>{cr1(x.cr)} {r.crW}</span></div>
                  <b className="sp-name">{x.name.split(/ (?![0-9])/).map((t, i) => <span key={i} className="nw">{t}</span>)}</b>
                  {(r.showScore || (x.after !== '' && x.after != null)) && (
                    <span className="sp-sub">{r.showScore && x.score != null ? `คะแนน ${x.score} / ${r.full}` : ''}{x.after !== '' && x.after != null ? `${r.showScore && x.score != null ? ' · ' : ''}ผลเดิม ${x.grade ?? '-'} แก้ตัวเป็น ${x.after}` : ''}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {(r.evA !== undefined || r.acts) && !p1 && (
          <>
            <div className="sp-h"><b>ผลการประเมินอื่น</b></div>
            <div className="sp-list kv">
              {r.evA !== undefined && <div><span>คุณลักษณะอันพึงประสงค์</span><b>{r.evA || '-'}</b></div>}
              {r.evR !== undefined && <div><span>การอ่าน คิดวิเคราะห์ และเขียน</span><b>{r.evR || '-'}</b></div>}
              {r.acts && r.acts.map((a) => <div key={a.n}><span>{a.n}</span><b>{a.v === 'ผ' ? 'ผ่าน' : a.v === 'มผ' ? 'ไม่ผ่าน' : '-'}</b></div>)}
            </div>
          </>
        )}
        {r.html && <button type="button" className="sp-go wide" onClick={() => printReport(r.html, `ใบแจ้งผลการเรียน ${s.name} ${r.term}-${r.year}`)}>ดาวน์โหลดใบแจ้งผล (PDF)</button>}
        <p className="sp-foot">ประกาศผลเมื่อ {new Date(r.publishedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}<br />หากข้อมูลไม่ถูกต้อง โปรดติดต่อครูประจำชั้น</p>
      </div>
    </div>
  )
}

export default function StudentPortal() {
  const nav = useNavigate()
  const [stu, setStu] = useState(loadStu)
  const [busy, setBusy] = useState(false)
  useEffect(() => { document.title = 'ดูผลการเรียน · ระบบผลการเรียน โรงเรียนวัดบางปูน' }, [])
  const done = (data, sid) => { const v = { sid, data }; saveStu(v); setStu(v) }
  const logout = () => { saveStu(null); setStu(null) }
  const term = async (y, t) => {
    setBusy(true)
    try { done(await fetchResult(stu.sid, y, t), stu.sid) } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="sp">
      {stu ? <ResultView stu={stu} onLogout={logout} onTerm={term} busy={busy} /> : (
        <div className="sp-login">
          <div className="sp-head">
            <div className="sp-headrow"><button type="button" className="sp-back" onClick={() => nav('/')}>‹ หน้าแรก</button><InstallButton className="sp-install" /></div>
            <div className="sp-brand">
              <img src="/logo.png" alt="ตราโรงเรียนวัดบางปูน" />
              <div><b>นักเรียนดูผลการเรียน</b><span>ระบบผลการเรียน · โรงเรียนวัดบางปูน</span></div>
            </div>
          </div>
          <StudentKeypad onDone={done} />
        </div>
      )}
    </div>
  )
}

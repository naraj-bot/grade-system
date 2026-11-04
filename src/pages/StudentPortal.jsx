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

// บันทึกใบแจ้งผลเป็นรูปภาพ PNG (A4) ในเครื่อง: วาด HTML ลง SVG foreignObject แล้วแปลงเป็นภาพ
// ฟอนต์และรูปต้องฝังเป็น data URL ก่อน ไม่อย่างนั้นภาพจะไม่มีฟอนต์/รูป
const dataUrl = async (u) => { const b = await (await fetch(u)).blob(); return new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b) }) }
export async function reportPng(html) {
  const O = location.origin, W = 794, H = 1123, K = 2
  let css = printCss(O).replace(/@font-face\{[^}]*Italic[^}]*\}/g, '').replace(/@page[^{]*\{[^}]*\}/g, '')
  for (const f of ['THSarabunPSK.ttf', 'THSarabunPSK-Bold.ttf']) css = css.split(`${O}/fonts/${f}`).join(await dataUrl(`/fonts/${f}`))
  let body = html
  for (const u of [...new Set([...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))]) {
    try { body = body.split(`src="${u}"`).join(`src="${await dataUrl(u)}"`) } catch { /* รูปที่โหลดไม่ได้ข้ามไป */ }
  }
  const box = document.createElement('div')
  box.setAttribute('style', `width:${W}px;height:${H}px;box-sizing:border-box;padding:53px;background:#fff;overflow:hidden`)
  box.innerHTML = `<style>${css}</style>${body}`
  const xml = new XMLSerializer().serializeToString(box)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  await new Promise((r) => setTimeout(r, 250)) // ให้ฟอนต์ที่ฝังไว้พร้อมก่อนวาด
  const cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.scale(K, K); x.drawImage(img, 0, 0)
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('สร้างภาพไม่ได้'))), 'image/png'))
}
async function saveImage(html, name) {
  const blob = await reportPng(html)
  const file = new File([blob], name + '.png', { type: 'image/png' })
  // มือถือ: เปิดเมนูแชร์ (เลือก "บันทึกรูปภาพ" ลงคลังภาพได้) · คอมพิวเตอร์: ดาวน์โหลดไฟล์
  if (/iPhone|iPad|Android|Mobi/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return } catch (e) { if (e && e.name === 'AbortError') return }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

function ResultView({ stu, onLogout, onTerm, busy }) {
  const [img, setImg] = useState(false)
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
          {p1 ? (() => {
            // ประถมภาคเรียนที่ 1 ยังไม่มีเกรด: สรุปเป็นคะแนนรวมและเปอร์เซ็นต์แทน GPA
            const sc = r.subjects.filter((x) => x.score != null), tot = sc.reduce((a, x) => a + x.score, 0), max = sc.length * (r.full || 50)
            return (
              <div className="sp-stats">
                <div className="gpa"><span>คะแนนรวม</span><b>{sc.length ? tot : '-'}</b><small>/ {max || '-'}</small></div>
                <div><span>เฉลี่ย</span><b>{max ? Math.round((tot / max) * 100) + '%' : '-'}</b></div>
                <div><span>รายวิชา</span><b>{r.subjects.length}</b></div>
                <div><span>{r.crW}ที่ลง</span><b>{cr1(r.crAll)}</b></div>
              </div>
            )
          })() : (
          <div className="sp-stats">
            <div className="gpa"><span>GPA</span><b>{r.gpa == null ? '-' : r.gpa.toFixed(2)}</b></div>
            <div><span>{r.crW}ที่ลง</span><b>{cr1(r.crAll)}</b></div>
            <div><span>{r.crW}ที่ได้</span><b>{p1 ? '-' : cr1(r.crGot)}</b></div>
            <div><span>กิจกรรม</span><b>{r.actAll == null ? '-' : r.actAll === 'ผ' ? 'ผ่าน' : r.actAll === 'มผ' ? 'ไม่ผ่าน' : '-'}</b></div>
          </div>
          )}
        </div>
        {p1 && <div className="sp-note"><b>ภาคเรียนที่ 1 แจ้งคะแนนก่อน</b><br /><span className="nw">เกรดและ GPA ประกาศเมื่อจบ</span><span className="nw">ภาคเรียนที่ 2 (ผลทั้งปี)</span></div>}
        <div className="sp-h"><b>รายวิชา {r.subjects.length} วิชา</b><span>{p1 ? `คะแนนเต็มวิชาละ ${r.full || 50}` : r.showScore ? 'เกรดและคะแนน' : 'แสดงเฉพาะเกรด'}</span></div>
        <div className="sp-list">
          {r.subjects.map((x) => {
            const g = x.after !== '' && x.after != null ? x.after : x.grade
            if (p1) {
              const pc = x.score == null ? null : Math.round((x.score / (r.full || 50)) * 100)
              return (
                <div className="sp-row" key={x.code}>
                  <div className={`sp-g sc ${pc == null ? 'g-x' : pc >= 80 ? 'g-a' : pc >= 60 ? 'g-b' : pc >= 50 ? 'g-c' : 'g-f'}`} aria-label={`คะแนน ${x.score ?? '-'} จาก ${r.full || 50}`}>
                    <b>{x.score ?? '-'}</b><small>/{r.full || 50}</small>
                  </div>
                  <div className="sp-info">
                    <div className="sp-meta"><span>{x.code} · {x.type}</span><span>{cr1(x.cr)} {r.crW}</span></div>
                    <b className="sp-name">{x.name.split(/ (?![0-9])/).map((t, i) => <span key={i} className="nw">{t}</span>)}</b>
                    {pc == null ? <span className="sp-sub">ยังไม่มีคะแนน</span> : (
                      <div className="sp-bar" role="img" aria-label={`${pc} เปอร์เซ็นต์`}><span className="tr"><i style={{ width: pc + '%' }} /></span><span className="pc">{pc}%</span></div>
                    )}
                  </div>
                </div>
              )
            }
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
        {r.html && (
          <div className="sp-dl">
            <button type="button" className="sp-go wide" onClick={() => printReport(r.html, `ใบแจ้งผลการเรียน ${s.name} ${r.term}-${r.year}`)}>ดาวน์โหลดใบแจ้งผล (PDF)</button>
            <button type="button" className="sp-img" disabled={img} onClick={async () => {
              setImg(true)
              try { await saveImage(r.html, `ใบแจ้งผลการเรียน_${s.name}_${r.term}-${r.year}`) } catch { alert('อุปกรณ์นี้สร้างรูปภาพไม่ได้ ใช้ปุ่ม PDF หรือแคปหน้าจอแทน') } finally { setImg(false) }
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
              {img ? 'กำลังสร้างรูปภาพ…' : 'บันทึกเป็นรูปภาพ'}
            </button>
          </div>
        )}
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

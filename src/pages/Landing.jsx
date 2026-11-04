import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import Login from './Login'
import { StudentKeypad, saveStu } from './StudentPortal'

// หน้าแรก (ยังไม่ล็อกอิน) จบในหน้าเดียว: ชื่อระบบ ปุ่มนักเรียน/ครู สถานะประกาศผล และประกาศล่าสุด
const OFFICE = 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสิงห์บุรี'
const TAG = { 'ใหม่': 't-new', 'สำคัญ': 't-imp', 'ด่วน': 't-urg' }
const LV_PRI = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'], LV_SEC = ['ม.1', 'ม.2', 'ม.3']
const day = (t) => new Date(t).toLocaleDateString('th-TH', { day: 'numeric' })
const mon = (t) => new Date(t).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })

function useNews() {
  const [list, setList] = useState(null)
  useEffect(() => onSnapshot(collection(db, 'news'),
    (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.show !== false)
      .sort((a, b) => (!!b.pin - !!a.pin) || (b.at || 0) - (a.at || 0)).slice(0, 3)),
    () => setList([])), [])
  return list
}
// สถานะประกาศผลของภาคเรียนล่าสุดที่มีการเผยแพร่
function usePubStatus() {
  const [st, setSt] = useState(null)
  useEffect(() => onSnapshot(collection(db, 'publishMeta'), (s) => {
    const metas = s.docs.map((d) => d.data()).filter((m) => m.levels && Object.values(m.levels).some(Boolean))
      .sort((a, b) => b.year - a.year || b.term - a.term)
    const m = metas[0]
    if (!m) return setSt(null)
    const on = (l) => !!m.levels[l]
    const grp = (lv, label) => ({ label, done: lv.filter(on).length, all: lv.length })
    setSt({ year: m.year, term: m.term, rows: [grp(LV_SEC, 'ม.1 – ม.3'), grp(LV_PRI, 'ป.1 – ป.6')] })
  }, () => setSt(null)), [])
  return st
}

function Modal({ label, onClose, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="lgov" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card ld-pop">
        <button type="button" className="ld-x" aria-label="ปิด" onClick={onClose}>✕</button>
        <div className="ld-pophd"><img src="/logo.png" alt="" /><div><b>{label}</b><span>ระบบผลการเรียน · โรงเรียนวัดบางปูน</span></div></div>
        {children}
      </div>
    </div>
  )
}

export default function Landing() {
  const nav = useNavigate()
  const [showLogin, setShowLogin] = useState(false)
  const [showStu, setShowStu] = useState(false)
  const news = useNews()
  const pub = usePubStatus()
  // จอเล็ก (มือถือ) ไปหน้าเต็ม /student เพราะแป้นตัวเลขต้องใช้พื้นที่ทั้งจอ
  const openStudent = () => (window.innerWidth < 700 ? nav('/student') : setShowStu(true))
  const stuDone = (data, sid) => { saveStu({ sid, data }); nav('/student') }
  return (
    <section className="ld">
      <img className="ld-wm" src="/logo.png" alt="" aria-hidden="true" />
      <header className="ld-top">
        <div className="ld-brand">
          <img src="/logo.png" alt="ตราโรงเรียนวัดบางปูน" />
          <div><b>โรงเรียนวัดบางปูน</b><span>{OFFICE}</span></div>
        </div>
        <button type="button" className="ld-teach" onClick={() => setShowLogin(true)}>ครู / บุคลากร เข้าสู่ระบบ</button>
      </header>
      <main className="ld-main">
        <div className="ld-hero">
          <span className="ld-badge">สำหรับนักเรียนและผู้ปกครอง</span>
          <h1>ระบบผลการเรียน</h1>
          <p><span className="nw">ติดตามผลการเรียนได้ทุกที่ ทุกเวลา</span><span className="nw">ดูเกรด GPA</span><span className="nw">และดาวน์โหลดใบแจ้งผลการเรียน</span><span className="nw">ได้ทันทีเมื่อโรงเรียนประกาศผล</span></p>
          <div className="ld-ctas"><button type="button" className="ld-cta" onClick={openStudent}>นักเรียนดูผลการเรียน</button><span className="ld-hint">ใช้เลขประจำตัวนักเรียน ไม่ต้องสมัครสมาชิก</span></div>
          <div className="ld-steps" aria-label="ขั้นตอนดูผลการเรียน">
            <div><b>1</b>กรอกเลขประจำตัว</div><div><b>2</b>ดูเกรดและ GPA</div><div><b>3</b>ดาวน์โหลดใบแจ้งผล</div>
          </div>
        </div>
        <div className="ld-card">
          {(
            <div className="ld-status">
              <span className="small">{pub ? `สถานะประกาศผล · ภาคเรียนที่ ${pub.term}/${pub.year}` : 'สถานะประกาศผล'}</span>
              {(pub ? pub.rows : [{ label: 'ม.1 – ม.3', done: 0, all: 3 }, { label: 'ป.1 – ป.6', done: 0, all: 6 }]).map((r) => (
                <div key={r.label}><b>{r.label}</b>
                  <span className={`pill ${r.done === r.all ? 'p-good' : r.done ? 'p-gold' : 'p-bad'}`}>{r.done === r.all ? '✓ ประกาศผลแล้ว' : r.done ? `ประกาศแล้ว ${r.done} ชั้น` : 'รอประกาศ'}</span>
                </div>
              ))}
            </div>
          )}
          <b className="ld-h">ประกาศล่าสุด</b>
          {news === null ? <div className="small muted">กำลังโหลด…</div> : !news.length ? (
            <div className="ld-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg><span>ยังไม่มีประกาศจากโรงเรียน เมื่อมีประกาศใหม่จะแสดงที่นี่</span></div>
          ) : news.map((n) => (
            <div className="ld-news" key={n.id}>
              <div className="ld-date"><b>{day(n.at)}</b><span>{mon(n.at)}</span></div>
              <div>
                <div className="ld-title">{String(n.title).replace(/ – /g, '\u00a0–\u00a0')}</div>
                <div className="ld-by">{n.tag && <span className={`ld-tag ${TAG[n.tag] || ''}`}>{n.tag}</span>}<span>{n.by}</span></div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <footer className="ld-foot"><span>© {new Date().getFullYear() + 543} ระบบบันทึกและประกาศผลการเรียน โรงเรียนวัดบางปูน</span><span>พัฒนาโดย ครูซอสสอนสังคม</span></footer>
      {showLogin && <Login onClose={() => setShowLogin(false)} />}
      {showStu && <Modal label="นักเรียนดูผลการเรียน" onClose={() => setShowStu(false)}><StudentKeypad compact onDone={stuDone} /></Modal>}
    </section>
  )
}

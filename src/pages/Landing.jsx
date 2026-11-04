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
// ตัดหัวข้อประกาศเป็นวลี ไม่ให้คำตกบรรทัดเดี่ยว ๆ: ตัวเลข/ระดับชั้น/ขีด ติดกับคำก่อนหน้า, คำเชื่อม (ชั้น ภาคเรียนที่ หรือ ฯลฯ) ติดกับคำถัดไป
const JOIN_NEXT = ['ชั้น', 'ภาคเรียนที่', 'ภาคเรียน', 'ปีการศึกษา', 'หรือ', 'และ', 'ถึง', 'วันที่', 'เวลา']
const JOIN_PREV = ['หรือ', 'และ', 'ถึง', '–', '-']
export function phrases(t) {
  const out = []
  String(t || '').split(/\s+/).filter(Boolean).forEach((x) => {
    const prev = out[out.length - 1], last = prev && prev.split('\u00a0').pop()
    const stick = prev && (/^[0-9๐-๙(]/.test(x) || /^[มปอ]\.\d/.test(x) || x.length <= 2 || JOIN_PREV.includes(x) || JOIN_PREV.includes(last) || JOIN_NEXT.includes(last) || /,$/.test(last))
    if (stick) out[out.length - 1] = prev + '\u00a0' + x; else out.push(x)
  })
  return out
}
const Title = ({ t }) => <>{phrases(t).map((p, i) => (p.includes('\u00a0') && p.length <= 30 ? <span key={i} className="nw">{p}</span> : <span key={i}>{p} </span>))}</>
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
      <div className="ld-bg" aria-hidden="true"><i className="g1" /><i className="g2" /><i className="g3" /></div>
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
          <span className="ld-badge"><i aria-hidden="true" />สำหรับนักเรียนและผู้ปกครอง</span>
          <h1>ระบบ<span className="ld-grad">ผลการเรียน</span></h1>
          <p><span className="nw">ติดตามผลการเรียนได้ทุกที่ ทุกเวลา</span><span className="nw">ดูเกรด GPA</span><span className="nw">และดาวน์โหลดใบแจ้งผลการเรียน</span><span className="nw">ได้ทันทีเมื่อโรงเรียนประกาศผล</span></p>
          <div className="ld-ctas"><button type="button" className="ld-cta" onClick={openStudent}>นักเรียนดูผลการเรียน<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></button><span className="ld-hint">ใช้เลขประจำตัวนักเรียน ไม่ต้องสมัครสมาชิก</span></div>
          <div className="ld-steps" aria-label="ขั้นตอนดูผลการเรียน">
            <div><b>1</b>กรอกเลขประจำตัว</div><div><b>2</b>ดูเกรดและ GPA</div><div><b>3</b>ดาวน์โหลดใบแจ้งผล</div>
          </div>
        </div>
        <aside className="ld-card" aria-label="ประกาศผลและข่าวประกาศ">
          <div className="ld-sec">
            <div className="ld-eyebrow"><span>ประกาศผลการเรียน</span>{pub && <em>ภาคเรียนที่ {pub.term}/{pub.year}</em>}</div>
            {(pub ? pub.rows : [{ label: 'ม.1 – ม.3', done: 0, all: 3 }, { label: 'ป.1 – ป.6', done: 0, all: 6 }]).map((r) => {
              const st = r.done === r.all ? 'on' : r.done ? 'part' : 'off'
              return (
                <div className="ld-lv" key={r.label}>
                  <div className="ld-lvhd">
                    <div><b>{r.label}</b><span>{r.label.startsWith('ม') ? 'มัธยมศึกษาตอนต้น' : 'ประถมศึกษา'}</span></div>
                    <span className={`ld-st ${st}`}><i aria-hidden="true" />{st === 'on' ? 'ประกาศผลแล้ว' : st === 'part' ? `ประกาศแล้ว ${r.done}/${r.all} ชั้น` : 'รอประกาศ'}</span>
                  </div>
                  <div className={`ld-bar ${st}`} role="img" aria-label={`ประกาศแล้ว ${r.done} จาก ${r.all} ชั้น`}><i style={{ width: `${(r.done / r.all) * 100}%` }} /></div>
                </div>
              )
            })}
          </div>
          <div className="ld-sec">
            <div className="ld-eyebrow"><span>ข่าวประกาศ</span></div>
            {news === null ? <div className="ld-none">กำลังโหลด…</div> : !news.length ? (
              <div className="ld-none">ยังไม่มีประกาศจากโรงเรียน</div>
            ) : news.map((n) => (
              <div className="ld-news" key={n.id}>
                <div className="ld-date"><b>{day(n.at)}</b><span>{mon(n.at)}</span></div>
                <div>
                  <div className="ld-title"><Title t={n.title} /></div>
                  <div className="ld-by">{n.tag && <span className={`ld-tag ${TAG[n.tag] || ''}`}>{n.tag}</span>}<span>{n.by}</span></div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
      <footer className="ld-foot"><span>© {new Date().getFullYear() + 543} ระบบบันทึกและประกาศผลการเรียน โรงเรียนวัดบางปูน</span><span>พัฒนาโดย ครูซอสสอนสังคม</span></footer>
      {showLogin && <Login onClose={() => setShowLogin(false)} />}
      {showStu && <Modal label="นักเรียนดูผลการเรียน" onClose={() => setShowStu(false)}><StudentKeypad compact onDone={stuDone} /></Modal>}
    </section>
  )
}

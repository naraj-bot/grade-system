import { useState } from 'react'

// ลิงก์ให้นักเรียนเข้าดูผลการเรียน: คัดลอกไปส่งในกลุ่มไลน์ห้องได้ทันที
export default function StudentLinkCard() {
  const url = `${location.origin}/student`
  const msg = `ดูผลการเรียนออนไลน์ โรงเรียนวัดบางปูน\n${url}\nใช้เลขประจำตัวนักเรียนในการเข้าดู หากจำเลขประจำตัวไม่ได้ ให้ติดต่อครูประจำชั้น`
  const [done, setDone] = useState('')
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setDone(what); setTimeout(() => setDone(''), 2200)
  }
  return (
    <div className="card stack">
      <h3>ลิงก์สำหรับนักเรียนดูผลการเรียน</h3>
      <div className="row"><code style={{ wordBreak: 'break-all' }}>{url}</code></div>
      <div className="small muted">นักเรียนกรอกเลขประจำตัวนักเรียนเพื่อดูผล · หากจำเลขประจำตัวไม่ได้ ให้ติดต่อครูประจำชั้น</div>
      <div className="row">
        <button className="btn sm" onClick={() => copy(url, 'link')}>{done === 'link' ? 'คัดลอกลิงก์แล้ว ✓' : 'คัดลอกลิงก์'}</button>
        <button className="btn sm alt" onClick={() => copy(msg, 'msg')}>{done === 'msg' ? 'คัดลอกข้อความแล้ว ✓' : 'คัดลอกข้อความพร้อมคำแนะนำ (ส่งไลน์ห้อง)'}</button>
        <a className="btn sm alt" href="/student" target="_blank" rel="noopener">เปิดหน้านักเรียน</a>
      </div>
    </div>
  )
}

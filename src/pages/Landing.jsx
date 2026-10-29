import { useState } from 'react'
import Icon from '../icons'
import Login from './Login'

const FEATURES = [
  ['gd', 'edit', 'สมุดคะแนน', 'กรอกตามช่องที่ครูตั้ง ระบบรวมให้เอง'],
  ['gr', 'reg', 'ตัดเกรด', 'เกรด 0–4 ร มส คำนวณอัตโนมัติ'],
  ['fr', 'print', 'เล่ม ปพ.5', 'จัดหน้า A4 ฟอนต์ TH Sarabun พร้อมพิมพ์'],
  ['cr', 'users', 'ทุกอุปกรณ์', 'คอม แท็บเล็ต มือถือ'],
]

export default function Landing() {
  const [showLogin, setShowLogin] = useState(false)
  return (
    <section className="landing">
      <div className="hero">
        <span className="orb o1" /><span className="orb o2" />
        <div className="hero-in">
          <div className="hl">
            <div className="brand2">
              <span className="bi"><img src="/logo.png" alt="ตราโรงเรียนวัดบางปูน" /></span>
              <div><b>ระบบตัดเกรด</b><small>SMART GRADE &amp; ปพ.5 · วัดบางปูน</small></div>
            </div>
            <h1>บันทึกคะแนน ตัดเกรด<br />ออกเล่ม ปพ.5 ในที่เดียว</h1>
            <p className="hp">
              ระบบตัดเกรดโรงเรียนวัดบางปูน ป.1 – ม.3 ครูกรอกคะแนนตามช่องที่ตั้งไว้ ระบบรวมคะแนน ตัดเกรด 0 – 4 และ มส.
              ให้อัตโนมัติ พร้อมเล่ม ปพ.5 และใบแจ้งผลการเรียน (ปพ.6) เป็น PDF A4 ลงนามอิเล็กทรอนิกส์
            </p>
            <div className="feat">
              {FEATURES.map(([c, i, t, d]) => (
                <div className="fc" key={t}>
                  <span className={`fi ${c}`}><Icon name={i} /></span>
                  <div><b>{t}</b><span>{d}</span></div>
                </div>
              ))}
            </div>
            <div className="cta">
              <button className="go" type="button" onClick={() => setShowLogin(true)}>เข้าสู่ระบบ <span aria-hidden="true">›</span></button>
              <span className="small">ลืมรหัสผ่านติดต่อแอดมินหลัก</span>
            </div>
          </div>
          <div className="hr"><img src="/hero.webp" alt="ภาพประกอบระบบตัดเกรด" /></div>
        </div>
        <div className="hcredit">พัฒนาโดย ครูซอสสอนสังคม</div>
      </div>
      {showLogin && <Login onClose={() => setShowLogin(false)} />}
    </section>
  )
}

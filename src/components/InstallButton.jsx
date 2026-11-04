import { useState } from 'react'
import { useInstall } from '../lib/pwa'

// ปุ่ม "ติดตั้งแอป" + วิธีติดตั้งบน iPhone/iPad
export default function InstallButton({ className = 'ld-install' }) {
  const { show, ios, install } = useInstall()
  const [help, setHelp] = useState(false)
  if (!show) return null
  return (
    <>
      <button type="button" className={className} onClick={() => (ios ? setHelp(true) : install())}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        ติดตั้งแอป
      </button>
      {help && (
        <div className="lgov" role="dialog" aria-modal="true" aria-label="วิธีติดตั้งแอป" onMouseDown={(e) => e.target === e.currentTarget && setHelp(false)}>
          <div className="card ld-pop">
            <button type="button" className="ld-x" aria-label="ปิด" onClick={() => setHelp(false)}>✕</button>
            <div className="ld-pophd"><img src="/icons/icon-192.png" alt="" /><div><b>ติดตั้งแอปบน iPhone / iPad</b><span>ใช้ได้ใน Safari</span></div></div>
            <ol className="pwa-steps">
              <li>กดปุ่ม <b>แชร์</b> <span aria-hidden="true">(สี่เหลี่ยมมีลูกศรชี้ขึ้น ⬆)</span> ที่แถบด้านล่างหรือด้านบนของ Safari</li>
              <li>เลื่อนลงแล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b></li>
              <li>กด <b>เพิ่ม</b> ไอคอน "ผลการเรียน" จะอยู่บนหน้าจอโฮม เปิดได้เหมือนแอปทั่วไป</li>
            </ol>
            <button type="button" className="btn" onClick={() => setHelp(false)}>เข้าใจแล้ว</button>
          </div>
        </div>
      )}
    </>
  )
}

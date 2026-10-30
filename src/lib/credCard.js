// การ์ดชื่อผู้ใช้/รหัสผ่าน: คัดลอกข้อความ และบันทึกเป็นภาพ PNG รายบุคคล
export const credText = (c) => `ระบบตัดเกรด โรงเรียนวัดบางปูน\nชื่อ: ${c.name}\nชื่อผู้ใช้: ${c.username}\nรหัสผ่านเริ่มต้น: ${c.pw}\n(เข้าครั้งแรกต้องตั้งรหัสผ่านใหม่)\n${location.origin}`

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* ใช้วิธีสำรอง */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok
  } catch { return false }
}

const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src })

export async function credBlob(c) {
  try { await Promise.all([document.fonts.load('700 40px "TH SarabunPSK"'), document.fonts.load('400 40px "TH SarabunPSK"')]) } catch { /* ไม่เป็นไร */ }
  const W = 1000, H = 600, cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d'), F = (w, s) => `${w} ${s}px "TH SarabunPSK", sans-serif`
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h) }
  g.fillStyle = '#fbf3ee'; g.fillRect(0, 0, W, H)
  const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#7a1414'); grad.addColorStop(1, '#c4683a')
  g.fillStyle = grad; rr(24, 24, W - 48, 130, 26); g.fill()
  const logo = await loadImg('/logo.png')
  if (logo) { g.fillStyle = '#fff'; rr(48, 44, 92, 92, 22); g.fill(); g.drawImage(logo, 54, 50, 80, 80) }
  g.fillStyle = '#fff'; g.font = F(700, 54); g.fillText('ระบบตัดเกรด', 164, 92)
  g.fillStyle = '#f3d27a'; g.font = F(400, 36); g.fillText('โรงเรียนวัดบางปูน', 164, 134)
  g.fillStyle = '#2b1b1b'; g.font = F(400, 40); g.fillText(c.name, 56, 214)
  const row = (y, label, val, color) => {
    g.fillStyle = '#fff'; rr(48, y, W - 96, 108, 20); g.fill(); g.strokeStyle = '#ead3c7'; g.lineWidth = 2; g.stroke()
    g.fillStyle = '#6f5b57'; g.font = F(400, 32); g.fillText(label, 76, y + 40)
    g.fillStyle = color; g.font = F(700, 64); g.fillText(val, 76, y + 94)
  }
  row(240, 'ชื่อผู้ใช้', c.username, '#8c1c1c')
  row(370, 'รหัสผ่านเริ่มต้น', c.pw, '#1b1b1b')
  g.fillStyle = '#6f5b57'; g.font = F(400, 30)
  g.fillText('เมื่อเข้าสู่ระบบครั้งแรก ระบบจะให้ตั้งรหัสผ่านใหม่ · ' + location.host, 56, 548)
  return new Promise((ok) => cv.toBlob(ok, 'image/png'))
}

export async function saveCredImage(c) {
  const b = await credBlob(c)
  if (!b) return false
  const a = document.createElement('a')
  a.href = URL.createObjectURL(b); a.download = `บัญชี_${c.username}.png`
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return true
}

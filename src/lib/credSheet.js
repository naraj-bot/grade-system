// ตารางบัญชีผู้ใช้เป็นภาพ PNG ขนาด A4 (1654 x 2339 px = 200 dpi) หน้าละ 28 คน
// rows: [{ username, name, role, pw?, note? }]  pw = รหัสเริ่มต้น (ถ้ารู้) · note = ข้อความแทนเมื่อไม่รู้รหัส
const W = 1654, H = 2339, PER = 28, MX = 70, ROW = 62, HEAD = 330, TOP = HEAD + 70
const COLS = [['ที่', 80, 'c'], ['ชื่อผู้ใช้', 290, 'l'], ['ชื่อ-สกุล', 560, 'l'], ['บทบาท', 230, 'l'], ['รหัสผ่านเริ่มต้น', 354, 'l']]

const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src })

export async function credSheetBlobs(rows, { title = 'บัญชีผู้ใช้ระบบตัดเกรด', sub = 'โรงเรียนวัดบางปูน' } = {}) {
  try { await Promise.all([document.fonts.load('700 40px "TH SarabunPSK"'), document.fonts.load('400 40px "TH SarabunPSK"')]) } catch { /* ไม่เป็นไร */ }
  const logo = await loadImg('/logo.png')
  const pages = Math.max(1, Math.ceil(rows.length / PER)), out = []
  const date = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
  for (let p = 0; p < pages; p++) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const g = cv.getContext('2d'), F = (w, s) => `${w} ${s}px "TH SarabunPSK", sans-serif`
    const fit = (t, mw) => { t = String(t ?? ''); if (g.measureText(t).width <= mw) return t; while (t.length > 1 && g.measureText(t + '…').width > mw) t = t.slice(0, -1); return t + '…' }
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h) }
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
    // หัวกระดาษ
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#7a1414'); gr.addColorStop(1, '#c4683a')
    g.fillStyle = gr; rr(MX - 20, 50, W - 2 * (MX - 20), 190, 30); g.fill()
    if (logo) { g.fillStyle = '#fff'; rr(MX + 4, 74, 142, 142, 30); g.fill(); g.drawImage(logo, MX + 14, 84, 122, 122) }
    g.fillStyle = '#fff'; g.font = F(700, 82); g.fillText(title, MX + 176, 148)
    g.fillStyle = '#f3d27a'; g.font = F(400, 52); g.fillText(sub, MX + 176, 208)
    g.fillStyle = '#6f5b57'; g.font = F(400, 36)
    g.fillText(`พิมพ์เมื่อ ${date} · ทั้งหมด ${rows.length} บัญชี · หน้า ${p + 1}/${pages}`, MX, HEAD - 22)
    // หัวตาราง
    let x = MX; g.fillStyle = '#7a1414'; rr(MX, HEAD, W - 2 * MX, ROW, 12); g.fill()
    g.fillStyle = '#fff'; g.font = F(700, 40)
    COLS.forEach(([t, w, a]) => { if (a === 'c') { g.textAlign = 'center'; g.fillText(t, x + w / 2, HEAD + 44) } else { g.textAlign = 'left'; g.fillText(t, x + 16, HEAD + 44) } x += w })
    g.textAlign = 'left'
    // แถวข้อมูล
    rows.slice(p * PER, (p + 1) * PER).forEach((r, i) => {
      const y = HEAD + ROW + i * ROW
      if (i % 2) { g.fillStyle = '#fbf3ee'; g.fillRect(MX, y, W - 2 * MX, ROW) }
      g.strokeStyle = '#ead3c7'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(MX, y + ROW); g.lineTo(W - MX, y + ROW); g.stroke()
      const base = y + 43; let cx = MX
      g.fillStyle = '#6f5b57'; g.font = F(400, 38); g.textAlign = 'center'; g.fillText(String(p * PER + i + 1), cx + COLS[0][1] / 2, base); g.textAlign = 'left'; cx += COLS[0][1]
      g.fillStyle = '#8c1c1c'; g.font = F(700, 40); g.fillText(fit(r.username, COLS[1][1] - 24), cx + 16, base); cx += COLS[1][1]
      g.fillStyle = '#2b1b1b'; g.font = F(400, 40); g.fillText(fit(r.name, COLS[2][1] - 24), cx + 16, base); cx += COLS[2][1]
      g.fillStyle = '#4a3a37'; g.font = F(400, 36); g.fillText(fit(r.role, COLS[3][1] - 24), cx + 16, base); cx += COLS[3][1]
      if (r.pw) { g.fillStyle = '#1b1b1b'; g.font = '700 42px "Courier New", monospace'; g.fillText(fit(r.pw, COLS[4][1] - 24), cx + 16, base) }
      else { g.fillStyle = '#8a7a76'; g.font = F(400, 32); g.fillText(fit(r.note || '—', COLS[4][1] - 24), cx + 16, base) }
    })
    // เส้นขอบตาราง
    const th = ROW + Math.min(PER, rows.length - p * PER) * ROW
    g.strokeStyle = '#d9b8a8'; g.lineWidth = 2; rr(MX, HEAD, W - 2 * MX, th, 12); g.stroke()
    // ท้ายกระดาษ
    g.fillStyle = '#b3261e'; g.font = F(700, 36); g.fillText('เอกสารลับ มีรหัสผ่านเริ่มต้น ใช้เฉพาะงานที่เกี่ยวข้อง และทำลายเมื่อใช้เสร็จ', MX, H - 120)
    g.fillStyle = '#6f5b57'; g.font = F(400, 32); g.fillText('ผู้ใช้ต้องตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งแรก · ' + location.host, MX, H - 76)
    out.push(await new Promise((ok) => cv.toBlob(ok, 'image/png')))
  }
  return out
}

export async function saveCredSheet(rows, opts) {
  const blobs = await credSheetBlobs(rows, opts)
  for (let i = 0; i < blobs.length; i++) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blobs[i]); a.download = `บัญชีผู้ใช้_A4_หน้า${i + 1}.png`
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 6000)
    if (i < blobs.length - 1) await new Promise((r) => setTimeout(r, 500))
  }
  return blobs.length
}

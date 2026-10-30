// กล่องยืนยัน/แจ้งเตือนแบบทันสมัย (แทน confirm/alert ของเบราว์เซอร์) ใช้ได้ทั้งในหน้า React และเอนจิน
// ask({ title, text, ok, cancel, danger }) -> Promise<boolean>     tell({ title, text, ok, tone }) -> Promise<void>
const ICON = {
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18.2v.1"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.1"/></svg>',
  ask: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.1M12 17v.1"/></svg>',
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function open({ title, text, ok = 'ตกลง', cancel, tone = 'ask' }) {
  return new Promise((resolve) => {
    const prev = document.activeElement
    const ov = document.createElement('div')
    ov.className = 'dlg-ov'
    ov.innerHTML = `<div class="dlg ${tone}" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
      <div class="dlg-ic">${ICON[tone === 'danger' ? 'warn' : tone] || ICON.ask}</div>
      <h3 id="dlg-t">${esc(title)}</h3>
      ${text ? `<p id="dlg-d">${esc(text)}</p>` : ''}
      <div class="dlg-bt">${cancel ? `<button type="button" class="dlg-c">${esc(cancel)}</button>` : ''}<button type="button" class="dlg-o">${esc(ok)}</button></div></div>`
    const done = (v) => {
      document.removeEventListener('keydown', key, true)
      ov.classList.add('out')
      setTimeout(() => { ov.remove(); try { prev && prev.focus && prev.focus() } catch { /* ไม่เป็นไร */ } }, 140)
      resolve(v)
    }
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false) }
      else if (e.key === 'Tab') { // วนโฟกัสอยู่ในกล่อง
        const b = [...ov.querySelectorAll('button')]; const i = b.indexOf(document.activeElement)
        e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus()
      }
    }
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(false) })
    ov.querySelector('.dlg-o').onclick = () => done(true)
    const c = ov.querySelector('.dlg-c'); if (c) c.onclick = () => done(false)
    document.addEventListener('keydown', key, true)
    document.body.appendChild(ov)
    ;(tone === 'danger' && c ? c : ov.querySelector('.dlg-o')).focus() // ถ้าเป็นการลบ/ปิด ให้โฟกัสปุ่มยกเลิกก่อน กัน Enter พลาด
  })
}

export const ask = ({ title = 'ยืนยันการทำรายการ', text = '', ok = 'ตกลง', cancel = 'ยกเลิก', danger = false } = {}) =>
  open({ title, text, ok, cancel, tone: danger ? 'danger' : 'ask' })
export const tell = ({ title = 'แจ้งให้ทราบ', text = '', ok = 'ตกลง', tone = 'info' } = {}) =>
  open({ title, text, ok, tone }).then(() => undefined)

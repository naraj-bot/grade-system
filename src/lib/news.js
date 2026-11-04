// ประกาศที่มี "วันที่กำหนด" (เช่น วันผลการเรียนออก): เมื่อถึงวันนั้น หน้าแรกขึ้นเป็นประกาศใหม่ให้อัตโนมัติ
export const dueOf = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null }
export const autoTitle = (n) => {
  if (n.dueTitle && n.dueTitle.trim()) return n.dueTitle.trim()
  const label = n.dueLabel || 'ผลการเรียนออก'
  if (label !== 'ผลการเรียนออก') return `ถึง${label}แล้ว: ${n.title}`
  const term = (String(n.title || '').match(/ภาคเรียนที่\s*\d\/\d{4}/) || [])[0]
  return `ผลการเรียน${term ? ' ' + term : ''}ออกแล้ว ดูผลได้เลย`.replace(/(\d{4})ออก/, '$1 ออก')
}
export function effective(n, now = new Date()) {
  const d = dueOf(n.due)
  if (!d || now < d) return { ...n, eff: n.at || 0, auto: false }
  const fresh = now - d < 7 * 86400000
  return { ...n, eff: d.getTime(), auto: true, title: autoTitle(n), tag: fresh ? 'ใหม่' : n.tag === 'ใหม่' ? '' : n.tag, orig: n.title }
}
export const frontList = (list, now = new Date()) => list.filter((x) => x.show !== false).map((x) => effective(x, now))
  .sort((a, b) => (!!b.pin - !!a.pin) || b.eff - a.eff).slice(0, 3)

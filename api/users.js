// POST /api/users
//  { action: 'create', username, name, role, tempPassword }  -> สร้างผู้ใช้ (แอดมินหลัก/แอดมินโรงเรียน)
//  { action: 'reset',  uid, tempPassword }                   -> รีเซ็ตรหัส (แอดมินหลักเท่านั้น)
// ผู้ใช้ใหม่ทุกคนถูกบังคับเปลี่ยนรหัสเมื่อเข้าครั้งแรก (mustChangePassword = true)
import { adminAuth, adminDb, requireRole, usernameToEmail } from './_admin.js'

const send = (res, status, body) => res.status(status).json(body)

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
  try {
    const { action, username, name, role, uid, tempPassword } = req.body || {}
    if (!tempPassword || tempPassword.length < 6) {
      return send(res, 400, { error: 'รหัสผ่านเริ่มต้นต้องยาวอย่างน้อย 6 ตัว' })
    }

    if (action === 'create') {
      const caller = await requireRole(req, ['superadmin', 'schooladmin'])
      if (!['teacher', 'schooladmin'].includes(role)) {
        return send(res, 400, { error: 'บทบาทไม่ถูกต้อง' })
      }
      // แอดมินโรงเรียนสร้างได้เฉพาะครู
      if (caller.role === 'schooladmin' && role !== 'teacher') {
        return send(res, 403, { error: 'แอดมินโรงเรียนสร้างได้เฉพาะบัญชีครู' })
      }
      if (!username || !name) return send(res, 400, { error: 'กรอกชื่อผู้ใช้และชื่อ-สกุล' })

      const created = await adminAuth.createUser({
        email: usernameToEmail(username),
        password: tempPassword,
        displayName: name,
      })
      await adminDb.doc(`users/${created.uid}`).set({
        username: username.trim().toLowerCase(),
        name,
        role,
        active: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      })
      return send(res, 200, { uid: created.uid })
    }

    if (action === 'reset') {
      await requireRole(req, ['superadmin'])
      if (!uid) return send(res, 400, { error: 'ไม่พบผู้ใช้' })
      await adminAuth.updateUser(uid, { password: tempPassword })
      await adminDb.doc(`users/${uid}`).update({ mustChangePassword: true })
      return send(res, 200, { ok: true })
    }

    return send(res, 400, { error: 'action ไม่ถูกต้อง' })
  } catch (e) {
    return send(res, e.status || 500, { error: e.message })
  }
}

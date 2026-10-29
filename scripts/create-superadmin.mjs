// สร้างแอดมินหลักคนแรก (รันครั้งเดียวบนเครื่องของคุณ)
// ใช้: FIREBASE_ADMIN_PROJECT_ID=... FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=... \
//      node scripts/create-superadmin.mjs อีเมล รหัสผ่าน "ชื่อ-สกุล"
import { adminAuth, adminDb } from '../api/_admin.js'

const [email, password, name = 'แอดมินหลัก'] = process.argv.slice(2)
if (!email || !password) {
  console.error('ใช้: node scripts/create-superadmin.mjs อีเมล รหัสผ่าน "ชื่อ-สกุล"')
  process.exit(1)
}
const u = await adminAuth.createUser({ email, password, displayName: name })
await adminDb.doc(`users/${u.uid}`).set({
  username: email, name, role: 'superadmin', active: true,
  mustChangePassword: false, createdAt: new Date().toISOString(),
})
console.log('สร้างแอดมินหลักแล้ว uid =', u.uid)
process.exit(0)

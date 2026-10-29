import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updatePassword,
} from 'firebase/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { auth, db, usernameToEmail } from './firebase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null) // { uid, name, role, mustChangePassword, ... }
  const [loading, setLoading] = useState(true)

  useEffect(() => onAuthStateChanged(auth, async (fu) => {
    if (!fu) { setUser(null); setLoading(false); return }
    const snap = await getDoc(doc(db, 'users', fu.uid))
    const data = snap.data()
    setUser(data && data.active !== false ? { uid: fu.uid, ...data } : null)
    setLoading(false)
  }), [])

  const login = (username, password) =>
    signInWithEmailAndPassword(auth, usernameToEmail(username), password)

  const logout = () => signOut(auth)

  // เข้าสู่ระบบด้วย Google: ใช้ได้เฉพาะบัญชี Google ที่ผูกกับโปรไฟล์ไว้แล้ว (ผูกจากหน้าแรกหลังล็อกอินปกติ)
  const loginGoogle = async () => {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider())
    const snap = await getDoc(doc(db, 'users', cred.user.uid))
    if (!snap.exists() || snap.data().active === false) {
      await signOut(auth)
      throw new Error('NOT_LINKED')
    }
  }
  const [googleLinked, setGoogleLinked] = useState(false)
  useEffect(() => {
    setGoogleLinked(!!auth.currentUser?.providerData.some((p) => p.providerId === 'google.com'))
  }, [user])
  const linkGoogle = async () => {
    await linkWithPopup(auth.currentUser, new GoogleAuthProvider())
    setGoogleLinked(true)
  }

  // บังคับเปลี่ยนรหัสครั้งแรก
  const changePassword = async (newPassword) => {
    await updatePassword(auth.currentUser, newPassword)
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { mustChangePassword: false })
    setUser((u) => ({ ...u, mustChangePassword: false }))
  }

  return (
    <Ctx.Provider value={{ user, loading, login, logout, changePassword, loginGoogle, linkGoogle, googleLinked }}>
      {children}
    </Ctx.Provider>
  )
}

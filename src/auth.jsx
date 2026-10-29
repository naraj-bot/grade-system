import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword,
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

  // บังคับเปลี่ยนรหัสครั้งแรก
  const changePassword = async (newPassword) => {
    await updatePassword(auth.currentUser, newPassword)
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { mustChangePassword: false })
    setUser((u) => ({ ...u, mustChangePassword: false }))
  }

  return (
    <Ctx.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </Ctx.Provider>
  )
}

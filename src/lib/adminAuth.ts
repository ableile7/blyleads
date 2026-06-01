import { cookies } from 'next/headers'

export function isAdminAuthed(): boolean {
  const cookieStore = cookies()
  const token = cookieStore.get('admin_auth')?.value
  return token === process.env.ADMIN_PASSWORD
}

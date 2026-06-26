'use client'
import { useState, useEffect } from 'react'

// Formats a UTC timestamp in the VIEWER's local timezone. The admin pages
// render on the server (UTC), so server-side date formatting shows the wrong
// time; computing it after mount on the client uses the browser's local TZ.
export default function LocalDateTime({ iso }: { iso: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    setText(new Date(iso).toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }))
  }, [iso])
  return <span suppressHydrationWarning>{text || '—'}</span>
}

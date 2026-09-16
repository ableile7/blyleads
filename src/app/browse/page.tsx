import { redirect } from 'next/navigation'

// The catalog moved to the root. Kept so existing /browse links still land.
export default function BrowseRedirect() {
  redirect('/')
}

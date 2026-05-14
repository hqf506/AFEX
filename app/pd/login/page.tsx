import { redirect } from 'next/navigation'

export default function LegacyPosLoginRedirectPage() {
  redirect('/pos/login')
}

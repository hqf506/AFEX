import { redirect } from 'next/navigation'

export default function InvoiceIndexPage() {
  redirect('/invoice/new')
}
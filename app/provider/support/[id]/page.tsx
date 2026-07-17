'use client'

import { useParams } from 'next/navigation'
import { ProviderTicketDetails } from '@/components/provider-ticket-details'

export default function ProviderTicketDetailsPage() {
  const params = useParams<{ id: string }>()
  return <ProviderTicketDetails ticketId={params.id} />
}

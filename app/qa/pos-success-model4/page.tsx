import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { PosSuccessModel4QaFixture } from './pos-success-model4-qa-fixture'

export const dynamic = 'force-dynamic'

export default async function PosSuccessModel4QaFixturePage() {
  await connection()

  const fixtureEnabled = process.env.VERCEL_ENV !== 'production'
  if (!fixtureEnabled) {
    notFound()
  }

  return <PosSuccessModel4QaFixture fixtureEnabled={fixtureEnabled} />
}

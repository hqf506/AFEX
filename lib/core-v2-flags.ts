import 'server-only'

function enabled(name: string, explicit?: boolean) {
  return explicit ?? process.env[name] === 'true'
}

export function coreV2AtomicOrderEnabled(explicit?: boolean) {
  return enabled('AFEX_CORE_V2_ATOMIC_ORDER_ENABLED', explicit)
}

export function coreV2FinancialQuotesEnabled(explicit?: boolean) {
  return enabled('AFEX_CORE_V2_FINANCIAL_QUOTES', explicit)
}

export function coreV2FinancialShadowEnabled(explicit?: boolean) {
  return enabled('AFEX_CORE_V2_FINANCIAL_SHADOW', explicit)
}


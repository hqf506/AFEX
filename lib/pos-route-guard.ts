export type PosGuardRoute =
  | '/pos/login'
  | '/pos/offline-preparation'
  | '/pos/employee-pin'

export type PosRouteTransitionReason =
  | 'organization-session-required'
  | 'device-preparation-required'
  | 'employee-selection-required'
  | 'employee-switch'
  | 'existing-loop-recovery'

export type PosRouteDecision = Readonly<{
  route: PosGuardRoute
  reason: PosRouteTransitionReason
}>

export function resolveProtectedPosRoute(input: {
  authSettled: boolean
  organizationAuthorized: boolean
  offlineRecoveryReady: boolean
  preparedDevice: boolean
  explicitlyLoggedOut: boolean
  requiresEmployee: boolean
  employeeCheckReady: boolean
  hasEmployeeActor: boolean
}): PosRouteDecision | null {
  if (!input.authSettled) return null

  if (input.explicitlyLoggedOut) {
    return {
      route: '/pos/login',
      reason: 'organization-session-required',
    }
  }

  if (!input.organizationAuthorized && !input.offlineRecoveryReady) {
    return {
      route: '/pos/login',
      reason: 'organization-session-required',
    }
  }

  if (!input.requiresEmployee || !input.employeeCheckReady || input.hasEmployeeActor) {
    return null
  }

  if (input.preparedDevice || input.offlineRecoveryReady) {
    return {
      route: '/pos/employee-pin',
      reason: 'employee-selection-required',
    }
  }

  return {
    route: '/pos/offline-preparation',
    reason: 'device-preparation-required',
  }
}

export function resolveAuthenticatedPosEntryRoute(input: {
  preparedDevice: boolean
  explicitlyLoggedOut: boolean
}): PosRouteDecision | null {
  if (input.explicitlyLoggedOut) return null

  return input.preparedDevice
    ? {
        route: '/pos/employee-pin',
        reason: 'existing-loop-recovery',
      }
    : {
        route: '/pos/offline-preparation',
        reason: 'device-preparation-required',
      }
}

export function reportPosRouteTransition(decision: PosRouteDecision) {
  // This diagnostic is intentionally limited to a bounded reason and route.
  // It contains no identifiers, authentication material, PINs, or PII.
  console.info('[POS route transition]', {
    reason: decision.reason,
    route: decision.route,
  })
}

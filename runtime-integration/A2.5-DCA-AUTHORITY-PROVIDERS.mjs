import { AuthorityFailure } from './A2.5-DCA-AUTHORITY-FOUNDATION.mjs';

export const PROVIDER_CAPABILITIES = Object.freeze([
  'HOST_PROVENANCE', 'THRESHOLD_APPROVER_AUTHENTICATION', 'TRUSTED_TIME',
  'LINEAGE_CURRENT_POINTER', 'REVOCATION', 'EXECUTION_AUTHORIZATION',
  'DURABLE_CONSUMPTION_AUDIT'
]);

export class UnavailableAuthorityProvider {
  constructor(capability) {
    if (!PROVIDER_CAPABILITIES.includes(capability)) throw new TypeError(`unknown capability: ${capability}`);
    this.capability = capability;
  }
  async evaluate() { throw new AuthorityFailure('PROVIDER_UNAVAILABLE', this.capability); }
  async issue() { throw new AuthorityFailure('PROVIDER_UNAVAILABLE', this.capability); }
  async verify() { throw new AuthorityFailure('PROVIDER_UNAVAILABLE', this.capability); }
  async consume() { throw new AuthorityFailure('PROVIDER_UNAVAILABLE', this.capability); }
}

export const createUnavailableProviders = () => Object.freeze(Object.fromEntries(
  PROVIDER_CAPABILITIES.map((capability) => [capability, new UnavailableAuthorityProvider(capability)])
));

export const O10A_STATUS = 'ENGINE_DOCKER_MUTATION_PROHIBITED';
export function protectedMutationPathStatus() {
  return Object.freeze({ enabled: false, status: O10A_STATUS, executionDisposition: 'VERIFICATION_ONLY_NON_EXECUTABLE', realMutationAuthorized: false });
}

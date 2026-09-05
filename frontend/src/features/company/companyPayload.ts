import type { OnboardingData } from '../onboarding/schemas/onboarding-schema'
import type { company } from '../../../wailsjs/go/models'

export function toCompanyPayload(
  data: OnboardingData,
  id?: string,
): company.CompanyCreateDTO | company.CompanyUpdateDTO {
  return {
    ...(id ? { id } : {}),
    name: data.name,
    legal_name: data.legalName || undefined,
    address: data.address || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    website: data.website || undefined,
    logo_url: data.logoUrl || undefined,
    state: data.state || undefined,
    gstin: data.gstin || undefined,
    pan: data.pan || undefined,
    bank_details: data.bankDetails || undefined,
    signature_url: data.signatureUrl || undefined,
    stamp_url: data.stampUrl || undefined,
    currency: data.currency,
  }
}

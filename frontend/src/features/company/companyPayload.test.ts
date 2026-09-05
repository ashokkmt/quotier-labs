import { describe, expect, it } from 'vitest'
import { toCompanyPayload } from './companyPayload'

describe('toCompanyPayload', () => {
  it('maps every camelCase form field to the generated Wails snake_case contract', () => {
    expect(
      toCompanyPayload(
        {
          name: 'Acme',
          legalName: 'Acme Legal Pvt Ltd',
          address: 'Pune',
          phone: '123',
          email: 'hello@example.com',
          website: 'https://example.com',
          logoUrl: 'logo.png',
          state: 'MH',
          gstin: '',
          pan: 'ABCDE1234F',
          bankDetails: 'Account: 1234',
          signatureUrl: 'signature.png',
          stampUrl: 'stamp.png',
          currency: 'INR',
        },
        'company-1',
      ),
    ).toMatchObject({
      id: 'company-1',
      legal_name: 'Acme Legal Pvt Ltd',
      bank_details: 'Account: 1234',
      logo_url: 'logo.png',
      signature_url: 'signature.png',
      stamp_url: 'stamp.png',
    })
  })
})

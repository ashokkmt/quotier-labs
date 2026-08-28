import { z } from 'zod'

export const onboardingSchema = z.object({
  // Company Information
  name: z.string().min(1, 'Company name is required'),
  legalName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  website: z.string().url('Invalid URL format').optional().or(z.literal('')),

  // Branding
  logoUrl: z.string().optional(),

  // GST / Tax
  state: z.string().min(1, 'State (Place of Supply) is required'),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  pan: z.string().optional(),
  currency: z.string(),

  // Payment / Bank Details
  bankDetails: z.string().optional(),

  // Signature / Stamp
  signatureUrl: z.string().optional(),
  stampUrl: z.string().optional(),
})

export type OnboardingData = z.infer<typeof onboardingSchema>

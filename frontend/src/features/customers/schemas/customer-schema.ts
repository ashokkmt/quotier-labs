import { z } from "zod"

export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Customer name is required"),
  company_name: z.string().optional().or(z.literal("")),
  contact_person: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format").optional().or(z.literal("")),
  pan: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  billing_address: z.string().optional().or(z.literal("")),
  shipping_address: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
})

export type CustomerData = z.infer<typeof customerSchema>

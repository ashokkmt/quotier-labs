import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { onboardingSchema, type OnboardingData } from '../onboarding/schemas/onboarding-schema'

import { StepCompanyInfo } from '../onboarding/steps/StepCompanyInfo'
import { StepGST } from '../onboarding/steps/StepGST'
import { StepBank } from '../onboarding/steps/StepBank'
import { GetActiveCompany, UpdateCompany } from '../../../wailsjs/go/wails/CompanyHandler'
import { toCompanyPayload } from './companyPayload'

export function CompanyProfile() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: '',
      currency: 'INR',
      state: '',
    },
    mode: 'onChange',
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const loadProfile = async () => {
    const c = await GetActiveCompany()
    form.reset({
      name: c.name,
      legalName: c.legal_name || '',
      address: c.address || '',
      phone: c.phone || '',
      email: c.email || '',
      website: c.website || '',
      state: c.state || '',
      gstin: c.gstin || '',
      pan: c.pan || '',
      bankDetails: c.bank_details || '',
      currency: c.currency || 'INR',
      logoUrl: c.logo_url || '',
      signatureUrl: c.signature_url || '',
      stampUrl: c.stamp_url || '',
    })
  }
  useEffect(() => {
    loadProfile()
      .catch(() => setError('Could not load company profile. Please retry.'))
      .finally(() => setLoading(false)) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const onSubmit = async (data: OnboardingData) => {
    setIsSubmitting(true)
    try {
      const current = await GetActiveCompany()
      const updated = await UpdateCompany(toCompanyPayload(data, current.id) as any)
      form.reset({
        ...data,
        legalName: updated.legal_name || '',
        bankDetails: updated.bank_details || '',
      })
      setSaved(true)
      setError('')
    } catch {
      setError('Could not save company profile. Your changes are still on this form.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <div className="py-12 text-center">Loading company profile...</div>
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-heading font-bold sm:text-3xl">Company Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your business profile, branding, and tax information.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-green-600">
          Company profile saved.
        </p>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Primary details displayed on quotations.</CardDescription>
            </CardHeader>
            <CardContent>
              <StepCompanyInfo form={form} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GST & Tax</CardTitle>
              <CardDescription>Required for tax calculations.</CardDescription>
            </CardHeader>
            <CardContent>
              <StepGST form={form} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bank Details</CardTitle>
              <CardDescription>Payment information for customers.</CardDescription>
            </CardHeader>
            <CardContent>
              <StepBank form={form} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                loadProfile().catch(() => setError('Could not reload company profile.'))
                setSaved(false)
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

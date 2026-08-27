import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { onboardingSchema, type OnboardingData } from "../onboarding/schemas/onboarding-schema"

import { StepCompanyInfo } from "../onboarding/steps/StepCompanyInfo"
import { StepGST } from "../onboarding/steps/StepGST"
import { StepBank } from "../onboarding/steps/StepBank"

export function CompanyProfile() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: "Quotier Labs",
      currency: "INR",
      state: "Maharashtra",
      // These would be loaded from backend in real implementation via GetActiveCompany
    },
    mode: "onChange",
  })

  const onSubmit = async (data: OnboardingData) => {
    setIsSubmitting(true)
    try {
      // await UpdateCompany(data)
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log("Profile updated", data)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-heading font-bold">Company Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business profile, branding, and tax information.</p>
      </div>
      
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
          
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

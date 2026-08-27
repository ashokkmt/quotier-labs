import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router-dom"
import { Form } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { onboardingSchema, type OnboardingData } from "../schemas/onboarding-schema"

import { StepWelcome } from "../steps/StepWelcome"
import { StepCompanyInfo } from "../steps/StepCompanyInfo"
import { StepBranding } from "../steps/StepBranding"
import { StepGST } from "../steps/StepGST"
import { StepBank } from "../steps/StepBank"
import { StepSignature } from "../steps/StepSignature"
import { StepDocumentSettings } from "../steps/StepDocumentSettings"
import { StepBackup } from "../steps/StepBackup"

import { CompleteOnboarding } from "../../../../wailsjs/go/wails/CompanyHandler"

const steps = [
  { id: "welcome", title: "Welcome to Quotier Labs", component: StepWelcome },
  { id: "info", title: "Company Information", component: StepCompanyInfo, fields: ["name", "email", "website"] },
  { id: "branding", title: "Branding", component: StepBranding },
  { id: "gst", title: "GST & Tax", component: StepGST, fields: ["state", "gstin"] },
  { id: "bank", title: "Bank Details", component: StepBank },
  { id: "signature", title: "Signature & Stamp", component: StepSignature },
  { id: "settings", title: "Document Settings", component: StepDocumentSettings },
  { id: "backup", title: "Backup Recommendation", component: StepBackup },
]

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const form = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: "",
      currency: "INR",
      state: "",
      legalName: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      logoUrl: "",
      gstin: "",
      pan: "",
      bankDetails: "",
      signatureUrl: "",
      stampUrl: "",
    },
    mode: "onChange",
  })

  const nextStep = async () => {
    const stepFields = steps[currentStep].fields
    if (stepFields) {
      const isValid = await form.trigger(stepFields as any)
      if (!isValid) return
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      form.handleSubmit(onSubmit)()
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const onSubmit = async (data: OnboardingData) => {
    setIsSubmitting(true)
    try {
      await CompleteOnboarding({
        ...data,
      } as any)
      navigate("/")
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const CurrentStepComponent = steps[currentStep].component

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-2 w-8 rounded-full transition-colors ${i <= currentStep ? 'bg-primary' : 'bg-muted'}`} 
                />
              ))}
            </div>
          </div>
          <CardTitle className="text-2xl">{steps[currentStep].title}</CardTitle>
          <CardDescription>Set up your workspace to get started</CardDescription>
        </CardHeader>
        
        <Form {...form}>
          <form onSubmit={e => e.preventDefault()}>
            <CardContent className="min-h-[300px]">
              <CurrentStepComponent form={form} />
            </CardContent>
            
            <CardFooter className="flex justify-between border-t p-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={prevStep}
                disabled={currentStep === 0 || isSubmitting}
              >
                Back
              </Button>
              <Button 
                type="button" 
                onClick={nextStep}
                disabled={isSubmitting}
              >
                {isSubmitting 
                  ? "Setting up..." 
                  : currentStep === steps.length - 1 ? "Complete Setup" : "Continue"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}

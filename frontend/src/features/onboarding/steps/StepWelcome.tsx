export function StepWelcome() {
  return (
    <div className="space-y-4">
      <p className="text-lg">
        Welcome to Quotier Labs! We're excited to help you create professional quotations in
        minutes.
      </p>
      <p className="text-muted-foreground">
        Let's take a few minutes to set up your company profile. This information will be used to
        generate your quotation documents, calculate taxes, and present your brand.
      </p>
      <div className="bg-primary/5 p-4 rounded-md border text-sm mt-6">
        <strong>Note:</strong> You only need to provide your Company Name and State right now. You
        can skip the rest and fill it out later from the Company settings.
      </div>
    </div>
  )
}

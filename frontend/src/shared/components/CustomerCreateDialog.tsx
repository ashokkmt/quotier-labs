import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CustomerForm } from "../../features/customers/CustomerForm"
import { useToast } from "@/hooks/use-toast"
import { CreateCustomer } from "../../../wailsjs/go/wails/CustomerHandler"

interface CustomerCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (customer: any) => void
}

export function CustomerCreateDialog({ open, onOpenChange, onSuccess }: CustomerCreateDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      const result = await CreateCustomer(data)
      toast({ title: "Customer created successfully" })
      if (onSuccess) onSuccess(result)
    } catch (err: any) {
      toast({ title: "Failed to create customer", description: err.toString(), variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>
            Enter customer details. This information will be used for billing and quotation generation.
          </DialogDescription>
        </DialogHeader>
        
        <CustomerForm 
          onSubmit={handleSubmit} 
          onCancel={() => onOpenChange(false)} 
          isSubmitting={isSubmitting} 
        />
      </DialogContent>
    </Dialog>
  )
}

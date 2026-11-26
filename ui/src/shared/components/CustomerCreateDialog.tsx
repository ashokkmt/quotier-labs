import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CustomerForm } from '../../features/customers/CustomerForm'
import { useToast } from '@/hooks/use-toast'
import { CreateCustomer, UpdateCustomer } from '../../../wailsjs/go/wails/CustomerHandler'
import type { customer } from '../../../wailsjs/go/models'

interface CustomerCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (customer: any) => void
  customer?: customer.CustomerDTO | null
}

export function CustomerCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  customer,
}: CustomerCreateDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      const result = customer
        ? await UpdateCustomer({ ...data, id: customer.id })
        : await CreateCustomer(data)
      toast({ title: customer ? 'Customer updated successfully' : 'Customer created successfully' })
      if (onSuccess) onSuccess(result)
    } catch (err: any) {
      toast({
        title: customer ? 'Failed to update customer' : 'Failed to create customer',
        description: err.toString(),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          <DialogDescription>
            {customer
              ? 'Update the customer details used for future quotations and billing.'
              : 'Enter customer details. This information will be used for billing and quotation generation.'}
          </DialogDescription>
        </DialogHeader>

        <CustomerForm
          key={customer?.id ?? 'new-customer'}
          initialData={customer ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  )
}

import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"

export function StepBank({ form }: any) {
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">Add your bank details or UPI ID for customer payments.</p>
      <FormField
        control={form.control}
        name="bankDetails"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Bank / Payment Details (Optional)</FormLabel>
            <FormControl>
              <Textarea 
                placeholder="Bank Name: HDFC Bank&#10;Account: 1234567890&#10;IFSC: HDFC0001234&#10;UPI: acme@upi" 
                className="resize-none h-32" 
                {...field} 
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

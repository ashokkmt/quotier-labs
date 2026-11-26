import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

export function StepGST({ form }: any) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="state"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              State (Place of Supply) <span className="text-destructive">*</span>
            </FormLabel>
            <FormControl>
              <Input placeholder="Maharashtra" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="gstin"
        render={({ field }) => (
          <FormItem>
            <FormLabel>GSTIN (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="27ABCDE1234F1Z5" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="pan"
        render={({ field }) => (
          <FormItem>
            <FormLabel>PAN (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="ABCDE1234F" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

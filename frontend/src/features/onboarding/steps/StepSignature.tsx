import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { SelectImage } from '../../../../wailsjs/go/wails/CompanyHandler'

export function StepSignature({ form }: any) {
  const handleUpload = async (field: any, title: string) => {
    try {
      const path = await SelectImage(title)
      if (path) {
        field.onChange(path)
      }
    } catch (err: any) {
      alert('Upload failed: ' + err)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Upload your authorized signature and company stamp to automatically sign quotations.
      </p>
      <FormField
        control={form.control}
        name="signatureUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Authorized Signature</FormLabel>
            <FormControl>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleUpload(field, 'Select Signature Image')}
                >
                  Choose Signature
                </Button>
                {field.value && (
                  <span className="text-sm text-muted-foreground overflow-hidden text-ellipsis w-64">
                    {field.value}
                  </span>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="stampUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Company Stamp</FormLabel>
            <FormControl>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleUpload(field, 'Select Stamp Image')}
                >
                  Choose Stamp
                </Button>
                {field.value && (
                  <span className="text-sm text-muted-foreground overflow-hidden text-ellipsis w-64">
                    {field.value}
                  </span>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

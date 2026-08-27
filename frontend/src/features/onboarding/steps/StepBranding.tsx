import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { SelectImage } from "../../../../wailsjs/go/wails/CompanyHandler"

export function StepBranding({ form }: any) {
  const handleUpload = async (field: any) => {
    try {
      const path = await SelectImage("Select Company Logo")
      if (path) {
        field.onChange(path)
      }
    } catch (err: any) {
      alert("Upload failed: " + err)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground mb-4">
        Upload your company logo. This will appear on all your generated quotations.
      </p>
      <FormField
        control={form.control}
        name="logoUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Company Logo</FormLabel>
            <FormControl>
              <div className="flex items-center gap-4">
                <Button type="button" variant="outline" onClick={() => handleUpload(field)}>
                  Choose Image
                </Button>
                {field.value && <span className="text-sm text-muted-foreground overflow-hidden text-ellipsis w-64">{field.value}</span>}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

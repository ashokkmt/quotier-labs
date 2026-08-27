
export function CalculationDisplay({ result }: { result: any | null }) {
  if (!result) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(val / 100)
  }

  return (
    <div className="bg-background border rounded-lg p-6 shadow-sm min-w-[300px]">
      <h3 className="text-lg font-semibold mb-4 border-b pb-2">Quotation Summary</h3>
      
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal:</span>
          <span className="font-medium">{formatCurrency(result.subtotal || 0)}</span>
        </div>
        
        {result.discount_total > 0 && (
          <div className="flex justify-between text-destructive">
            <span>Discount:</span>
            <span>-{formatCurrency(result.discount_total)}</span>
          </div>
        )}

        <div className="flex justify-between font-medium">
          <span>Taxable Amount:</span>
          <span>{formatCurrency(result.taxable_total || 0)}</span>
        </div>

        <div className="border-t my-2 pt-2 space-y-2">
          {result.tax_mode === 'INTRA_STATE' ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>CGST:</span>
                <span>{formatCurrency(result.cgst_total || 0)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>SGST:</span>
                <span>{formatCurrency(result.sgst_total || 0)}</span>
              </div>
            </>
          ) : result.tax_mode === 'INTER_STATE' ? (
            <div className="flex justify-between text-muted-foreground">
              <span>IGST:</span>
              <span>{formatCurrency(result.igst_total || 0)}</span>
            </div>
          ) : (
            <div className="flex justify-between text-muted-foreground">
              <span>Total Tax:</span>
              <span>{formatCurrency((result.cgst_total || 0) + (result.igst_total || 0))}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between text-lg font-bold border-t pt-3 mt-2">
          <span>Grand Total:</span>
          <span>{formatCurrency(result.grand_total || 0)}</span>
        </div>
      </div>
    </div>
  )
}

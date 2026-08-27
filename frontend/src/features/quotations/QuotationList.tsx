import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ListQuotations, DuplicateQuotation } from "../../../wailsjs/go/wails/QuotationHandler"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./components/StatusBadge"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, Copy, Eye, Edit } from "lucide-react"

export function QuotationList() {
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { toast } = useToast()

  const loadQuotations = async () => {
    try {
      const data = await ListQuotations({ Limit: 0, Offset: 0 })
      setQuotations(data || [])
    } catch (err: any) {
      toast({ title: "Failed to load quotations", description: err.toString(), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQuotations()
  }, [])

  const handleDuplicate = async (id: string) => {
    try {
      const res = await DuplicateQuotation(id)
      toast({ title: "Quotation duplicated successfully" })
      navigate(`/quotations/${res.id}/edit`)
    } catch (err: any) {
      toast({ title: "Failed to duplicate quotation", description: err.toString(), variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading tracking-tight">Quotations</h1>
          <p className="text-muted-foreground">Manage your past and current quotations.</p>
        </div>
        <Button onClick={() => navigate('/templates')}>
          <Plus className="w-4 h-4 mr-2" /> New Quotation
        </Button>
      </div>

      <div className="grid gap-4">
        {quotations.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed rounded-lg">
            <h3 className="text-lg font-semibold mb-2">No quotations found</h3>
            <p className="text-muted-foreground mb-4">Create your first quotation by selecting a template.</p>
            <Button onClick={() => navigate('/templates')}>Browse Templates</Button>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden bg-background">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{q.number || 'Draft'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                    <td className="px-4 py-3 font-medium">
                      {(q.grand_total / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => navigate(`/quotations/${q.id}/edit`)}
                        >
                          {q.status === 'DRAFT' ? <Edit className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                          {q.status === 'DRAFT' ? 'Edit' : 'View'}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDuplicate(q.id)}
                          title="Duplicate to new Draft"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

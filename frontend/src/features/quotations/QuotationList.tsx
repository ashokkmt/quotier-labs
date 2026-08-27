import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ListQuotations, DuplicateQuotation, DeleteQuotation } from "../../../wailsjs/go/wails/QuotationHandler"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./components/StatusBadge"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, Copy, Eye, Edit, Trash2, Search, ArrowUpDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function QuotationList() {
  const [quotations, setQuotations] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  
  // Filters and Pagination
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("ALL")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [sortBy, setSortBy] = useState("date")
  const [sortDesc, setSortDesc] = useState(true)

  const navigate = useNavigate()
  const { toast } = useToast()

  const loadQuotations = async () => {
    setLoading(true)
    try {
      const offset = (page - 1) * limit
      const data = await ListQuotations({
        limit,
        offset,
        status: status === "ALL" ? undefined : status,
        search: search || undefined,
        sort_by: sortBy || undefined,
        sort_desc: sortDesc,
        customer_id: undefined,
        template_id: undefined,
        start_date: startDate ? new Date(startDate).toISOString() : undefined,
        end_date: endDate ? new Date(endDate).toISOString() : undefined
      })
      setQuotations(data.items || [])
      setTotal(data.total || 0)
    } catch (err: any) {
      toast({ title: "Failed to load quotations", description: err.toString(), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadQuotations()
    }, 300)
    return () => clearTimeout(timer)
  }, [page, limit, search, status, sortBy, sortDesc, startDate, endDate])

  const handleDuplicate = async (id: string) => {
    try {
      const res = await DuplicateQuotation(id)
      toast({ title: "Quotation duplicated successfully" })
      navigate(`/quotations/${res.id}/edit`)
    } catch (err: any) {
      toast({ title: "Failed to duplicate quotation", description: err.toString(), variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this draft? This action cannot be undone.")) return
    try {
      await DeleteQuotation(id)
      toast({ title: "Quotation deleted" })
      loadQuotations()
    } catch (err: any) {
      toast({ title: "Failed to delete quotation", description: err.toString(), variant: "destructive" })
    }
  }

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDesc(!sortDesc)
    } else {
      setSortBy(col)
      setSortDesc(true)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading tracking-tight">Quotations</h1>
          <p className="text-muted-foreground">Manage your past and current quotations.</p>
        </div>
         <Button onClick={() => navigate('/quotations/new')}>
          <Plus className="w-4 h-4 mr-2" /> New Quotation
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by number or customer..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="FINALIZED">Finalized</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input 
            type="date" 
            className="w-[140px]" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
          />
          <span className="text-muted-foreground">-</span>
          <Input 
            type="date" 
            className="w-[140px]" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
          />
        </div>
      </div>

      <div className="grid gap-4">
        {loading && quotations.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : quotations.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed rounded-lg">
            <h3 className="text-lg font-semibold mb-2">No quotations found</h3>
            <p className="text-muted-foreground mb-4">
               {search || status !== "ALL" ? "Try adjusting your filters." : "Create your first quotation from scratch or a template."}
            </p>
            {!(search || status !== "ALL") && (
               <Button onClick={() => navigate('/quotations/new')}>New Quotation</Button>
            )}
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden bg-background">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleSort('number')}>
                    <div className="flex items-center">Number <ArrowUpDown className="ml-1 w-3 h-3"/></div>
                  </th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleSort('customer')}>
                    <div className="flex items-center">Customer <ArrowUpDown className="ml-1 w-3 h-3"/></div>
                  </th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleSort('date')}>
                    <div className="flex items-center">Date <ArrowUpDown className="ml-1 w-3 h-3"/></div>
                  </th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleSort('status')}>
                    <div className="flex items-center">Status <ArrowUpDown className="ml-1 w-3 h-3"/></div>
                  </th>
                  <th className="px-4 py-3 font-medium cursor-pointer hover:bg-muted/70" onClick={() => handleSort('amount')}>
                    <div className="flex items-center">Amount <ArrowUpDown className="ml-1 w-3 h-3"/></div>
                  </th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{q.number || 'Draft'}</td>
                    <td className="px-4 py-3">{q.customer_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                    <td className="px-4 py-3 font-medium">
                      {(q.grand_total / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/quotations/${q.id}/edit`)}>
                          {q.status === 'DRAFT' ? <Edit className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                          {q.status === 'DRAFT' ? 'Edit' : 'View'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicate(q.id)} title="Duplicate">
                          <Copy className="w-4 h-4" />
                        </Button>
                        {q.status === 'DRAFT' && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(q.id)} title="Delete" className="text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {total > limit && (
              <div className="p-4 flex items-center justify-between border-t bg-muted/20">
                <span className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

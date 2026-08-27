import { useState, useEffect } from "react"
import { Plus, Search, MoreVertical, Pencil, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { CustomerCreateDialog } from "../../shared/components/CustomerCreateDialog"

import { ListCustomers, DeleteCustomer } from "../../../wailsjs/go/wails/CustomerHandler"
import { customer } from "../../../wailsjs/go/models"

export function CustomerList() {
  const [customers, setCustomers] = useState<customer.CustomerDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { toast } = useToast()

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const result = await ListCustomers({ limit: 100, offset: 0 })
      setCustomers(result.items || [])
    } catch (err) {
      console.error(err)
      toast({ title: "Failed to load customers", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this customer? This cannot be undone.")) return
    try {
      await DeleteCustomer(id)
      toast({ title: "Customer deleted successfully" })
      loadCustomers()
    } catch (err) {
      console.error(err)
      toast({ title: "Failed to delete customer", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage your clients and billing details.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
        <Input placeholder="Search customers..." className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4 h-24 animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center border-dashed">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-medium mb-2">No customers yet</h3>
          <p className="text-muted-foreground mb-4">Add your first customer to start creating quotations.</p>
          <Button onClick={() => setDialogOpen(true)}>Add Customer</Button>
        </Card>
      ) : (
        <div className="bg-card border rounded-md overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-3 font-medium">Name / Company</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">State</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{c.name}</div>
                    {c.company_name && <div className="text-xs text-muted-foreground">{c.company_name}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div>{c.email || "—"}</div>
                    <div className="text-muted-foreground">{c.phone}</div>
                  </td>
                  <td className="px-6 py-4">{c.state || "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => alert("Edit not implemented fully for MVP inline")}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {dialogOpen && (
        <CustomerCreateDialog 
          open={dialogOpen} 
          onOpenChange={setDialogOpen}
          onSuccess={() => {
            setDialogOpen(false)
            loadCustomers()
          }}
        />
      )}
    </div>
  )
}

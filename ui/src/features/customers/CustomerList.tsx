import { useState, useEffect } from 'react'
import { Plus, Search, MoreVertical, Pencil, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { CustomerCreateDialog } from '../../shared/components/CustomerCreateDialog'
import { DeleteConfirmDialog } from '../../shared/components/DeleteConfirmDialog'

import { ListCustomers, DeleteCustomer } from '../../../wailsjs/go/wails/CustomerHandler'
import { customer } from '../../../wailsjs/go/models'

export function CustomerList() {
  const [customers, setCustomers] = useState<customer.CustomerDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<customer.CustomerDTO | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const result = await ListCustomers({ limit: 100, offset: 0 })
      setCustomers(result.items || [])
    } catch (err) {
      console.error(err)
      toast({ title: 'Failed to load customers', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await DeleteCustomer(id)
      setCustomers((current) => current.filter((customer) => customer.id !== id))
      setDeleteId(null)
      toast({ title: 'Customer deleted successfully' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Failed to delete customer', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold sm:text-3xl">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage your clients and billing details.</p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setEditingCustomer(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      <div className="flex max-w-sm items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
        <Input placeholder="Search customers..." className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 h-24 animate-pulse bg-muted/50" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center border-dashed">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-medium mb-2">No customers yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first customer to start creating quotations.
          </p>
          <Button
            onClick={() => {
              setEditingCustomer(null)
              setDialogOpen(true)
            }}
          >
            Add Customer
          </Button>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
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
                    {c.company_name && (
                      <div className="text-xs text-muted-foreground">{c.company_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div>{c.email || '—'}</div>
                    <div className="text-muted-foreground">{c.phone}</div>
                  </td>
                  <td className="px-6 py-4">{c.state || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingCustomer(c)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(c.id)}
                        >
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
          customer={editingCustomer}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditingCustomer(null)
          }}
          onSuccess={() => {
            setDialogOpen(false)
            loadCustomers()
          }}
        />
      )}
      <DeleteConfirmDialog
        open={Boolean(deleteId)}
        title="Delete customer?"
        description="This customer will be permanently deleted. This cannot be undone."
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
    </div>
  )
}

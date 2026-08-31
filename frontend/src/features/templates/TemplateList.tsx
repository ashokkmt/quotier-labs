import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Plus, LayoutTemplate, Copy, Trash, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { DeleteConfirmDialog } from '@/shared/components/DeleteConfirmDialog'
import { CreateQuotationDraft } from '../../../wailsjs/go/wails/QuotationHandler'
import { ListCustomers } from '../../../wailsjs/go/wails/CustomerHandler'
import {
  ListTemplates,
  CreateTemplate,
  DuplicateTemplate,
  DeleteTemplate,
} from '../../../wailsjs/go/wails/TemplateHandler'
import { createBlankV5Document } from '../../builder'

export function TemplateList() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const navigate = useNavigate()
  const handleCreateQuotation = async (templateId: string) => {
    try {
      const customers = await ListCustomers({ limit: 1, offset: 0 })
      if (!customers || !customers.items || customers.items.length === 0) {
        toast({
          title: 'No Customers',
          description: 'Please create a customer first.',
          variant: 'destructive',
        })
        return
      }
      const res = await CreateQuotationDraft({
        template_id: templateId,
        customer_id: customers.items[0].id,
      })
      navigate(`/quotations/${res.id}/edit`)
    } catch (err: any) {
      toast({ title: 'Failed', description: err.toString(), variant: 'destructive' })
    }
  }

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const res = await ListTemplates()
      setTemplates(res || [])
    } catch (err) {
      console.error(err)
      toast({ title: 'Failed to load templates', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async () => {
    try {
      const res = await CreateTemplate({
        name: 'New Template',
        layout: JSON.stringify(createBlankV5Document()),
      })
      toast({ title: 'Template created' })
      navigate(`/templates/${res.id}/edit`)
    } catch (err: any) {
      toast({ title: 'Failed to create', description: err.toString(), variant: 'destructive' })
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await DuplicateTemplate(id)
      toast({ title: 'Template duplicated' })
      loadTemplates()
    } catch (err: any) {
      toast({ title: 'Failed to duplicate', description: err.toString(), variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await DeleteTemplate(id)
      setTemplates((current) => current.filter((template) => template.id !== id))
      setDeleteId(null)
      toast({ title: 'Template deleted' })
    } catch (err: any) {
      toast({ title: 'Failed to delete', description: err.toString(), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-3 pb-12 sm:space-y-6 sm:py-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-heading font-bold sm:text-3xl">
            <LayoutTemplate className="h-7 w-7 text-primary sm:h-8 sm:w-8" /> Templates
          </h1>
          <p className="text-muted-foreground mt-1">Manage quotation layouts and designs.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" /> Blank Template
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-40" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center border-dashed">
          <div className="rounded-full bg-primary/10 p-4 mb-4">
            <LayoutTemplate className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-medium mb-2">No templates yet</h3>
          <p className="text-muted-foreground mb-4">Start by creating a new blank template.</p>
          <Button onClick={handleCreate}>Create Template</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((t) => (
            <Card
              key={t.id}
              className="p-5 flex flex-col hover:border-primary/50 transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg line-clamp-1">{t.name}</h3>
                {t.is_builtin && (
                  <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Built-in
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 flex-1 mb-4">
                {t.description || 'No description provided.'}
              </p>
              <div className="text-xs text-muted-foreground mb-4">
                Version: {t.current_version || 1}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button size="sm" onClick={() => handleCreateQuotation(t.id)}>
                  Use
                </Button>
                {t.is_builtin ? (
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(t.id)}>
                    <Copy className="w-4 h-4 mr-2" /> Customize
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => handleDuplicate(t.id)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/templates/${t.id}/edit`)}
                    >
                      <Edit2 className="w-4 h-4 mr-2" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(t.id)}
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <DeleteConfirmDialog
        open={Boolean(deleteId)}
        title="Delete template?"
        description="This template will be permanently deleted. Existing quotations will not be changed."
        deleting={deleting}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
      />
    </div>
  )
}

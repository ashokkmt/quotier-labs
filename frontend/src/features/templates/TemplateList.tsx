import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Plus, LayoutTemplate, Copy, Trash, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { CreateQuotationDraft } from '../../../wailsjs/go/wails/QuotationHandler'
import { ListCustomers } from '../../../wailsjs/go/wails/CustomerHandler'
import {
  ListTemplates,
  CreateTemplate,
  DuplicateTemplate,
  DeleteTemplate,
} from '../../../wailsjs/go/wails/TemplateHandler'
import { TemplateBuilder } from './TemplateBuilder'

export function TemplateList() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
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
        layout: JSON.stringify({ schema_version: 1, children: [] }),
      })
      toast({ title: 'Template created' })
      setEditingId(res.id)
      loadTemplates()
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
    if (!confirm('Are you sure you want to delete this template?')) return
    try {
      await DeleteTemplate(id)
      toast({ title: 'Template deleted' })
      loadTemplates()
    } catch (err: any) {
      toast({ title: 'Failed to delete', description: err.toString(), variant: 'destructive' })
    }
  }

  if (editingId) {
    return (
      <TemplateBuilder
        templateId={editingId}
        onBack={() => {
          setEditingId(null)
          loadTemplates()
        }}
      />
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <LayoutTemplate className="w-8 h-8 text-primary" /> Templates
          </h1>
          <p className="text-muted-foreground mt-1">Manage quotation layouts and designs.</p>
        </div>
        <Button onClick={handleCreate}>
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
              <div className="flex justify-end gap-2 pt-4 border-t">
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
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(t.id)}>
                      <Edit2 className="w-4 h-4 mr-2" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(t.id)}
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
    </div>
  )
}

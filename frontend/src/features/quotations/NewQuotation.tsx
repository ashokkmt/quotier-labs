import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CreateQuotationDraft } from '../../../wailsjs/go/wails/QuotationHandler'
import { ListTemplates } from '../../../wailsjs/go/wails/TemplateHandler'

export function NewQuotation() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<any[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    ListTemplates()
      .then(setTemplates)
      .catch(() => setError('Could not load templates. Please retry.'))
  }, [])
  const create = async (template_id?: string) => {
    setCreating(true)
    setError('')
    try {
      const q = await CreateQuotationDraft({ template_id: template_id || '' })
      navigate(`/quotations/${q.id}/edit`)
    } catch {
      setError('Could not create the quotation. Your data was not changed.')
    } finally {
      setCreating(false)
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5 py-3 sm:space-y-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-heading font-bold sm:text-3xl">New Quotation</h1>
        <p className="text-muted-foreground">
          Choose a starting point. You can add and edit everything later.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-4 sm:p-6">
          <h2 className="font-semibold text-lg">Start From Scratch</h2>
          <p className="text-sm text-muted-foreground">
            Build an empty quotation with rows, columns, sections, and tables.
          </p>
          <Button className="w-full sm:w-auto" onClick={() => create()} disabled={creating}>
            Create Empty Draft
          </Button>
        </Card>
        <Card className="space-y-3 p-4 sm:p-6">
          <h2 className="font-semibold text-lg">Use Existing Template</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates available.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 border-b py-2">
                <span className="min-w-0 truncate">{t.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => create(t.id)}
                  disabled={creating}
                >
                  Use
                </Button>
              </div>
            ))
          )}
        </Card>
      </div>
      <Button variant="ghost" onClick={() => navigate('/quotations')}>
        Cancel
      </Button>
    </div>
  )
}

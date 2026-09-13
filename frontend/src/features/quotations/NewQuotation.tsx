import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CreateQuotationDraft } from '../../../wailsjs/go/wails/QuotationHandler'
import { ListTemplates } from '../../../wailsjs/go/wails/TemplateHandler'
import { GetPreferences } from '../../../wailsjs/go/wails/AppHandler'

export function NewQuotation() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<any[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [v6Enabled, setV6Enabled] = useState(false)
  useEffect(() => {
    ListTemplates()
      .then(setTemplates)
      .catch(() => setError('Could not load templates. Please retry.'))
    GetPreferences()
      .then((value) => setV6Enabled(Boolean(value.v6_editor_enabled)))
      .catch(() => {})
  }, [])
  const create = async (template_id?: string) => {
    setCreating(true)
    setError('')
    try {
      const q = await CreateQuotationDraft({
        template_id: template_id || '',
        use_v6: !template_id && v6Enabled,
      })
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
            Start with a clean A4 {v6Enabled ? 'document' : 'canvas'} and add quotation text,
            tables, and images.
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
                <span className="min-w-0 truncate">
                  {t.name}
                  {t.schema_version === 6 && (
                    <span className="ml-2 text-xs text-muted-foreground">V6</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => create(t.id)}
                  disabled={creating || (t.schema_version === 6 && !v6Enabled)}
                  title={
                    t.schema_version === 6 && !v6Enabled
                      ? 'Enable the V6 document editor preview to create a new V6 quotation.'
                      : undefined
                  }
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

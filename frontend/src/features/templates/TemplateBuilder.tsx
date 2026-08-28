import { useEffect, useState } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { GetTemplate, UpdateTemplate } from '../../../wailsjs/go/wails/TemplateHandler'
import { BuilderEngine } from '../../builder'
import { normalize, serialize } from '../../builder'
import type { DocumentModel } from '../../builder'

export function TemplateBuilder({
  templateId,
  onBack,
}: {
  templateId: string
  onBack: () => void
}) {
  const [document, setDocument] = useState<DocumentModel>(() => normalize({}))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  useEffect(() => {
    GetTemplate(templateId)
      .then((res) => {
        setName(res.name)
        setDescription(res.description || '')
        setDocument(normalize(res.layout ? JSON.parse(res.layout) : {}))
      })
      .catch((err) =>
        toast({
          title: 'Failed to load template',
          description: String(err),
          variant: 'destructive',
        }),
      )
      .finally(() => setLoading(false)) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])
  const save = async () => {
    setSaving(true)
    try {
      await UpdateTemplate({ id: templateId, name, description, layout: serialize(document) })
      toast({ title: 'Template saved' })
    } catch (err) {
      toast({ title: 'Failed to save', description: String(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  return (
    <div className="h-full min-h-0 flex flex-col">
      <header className="flex items-center gap-3 p-3 border-b bg-background z-10 relative">
        <Input
          aria-label="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-sm font-semibold"
        />
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> Save
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Close
        </Button>
      </header>
      <div className="flex-1 relative overflow-hidden">
        <BuilderEngine document={document} onChange={setDocument} />
      </div>
    </div>
  )
}

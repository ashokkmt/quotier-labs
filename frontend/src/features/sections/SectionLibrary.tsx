import { useState, useEffect } from 'react'
import { Plus, Search, Library, Copy, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { SectionForm } from './SectionForm'
import {
  ListSectionDefinitions,
  CreateSectionDefinition,
  UpdateSectionDefinition,
  DeleteSectionDefinition,
  CloneSectionDefinition,
} from '../../../wailsjs/go/wails/SectionHandler'

export function SectionLibrary() {
  const [sections, setSections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const loadSections = async () => {
    setLoading(true)
    try {
      const res = await ListSectionDefinitions()
      setSections(res || [])
    } catch (err) {
      console.error(err)
      toast({ title: 'Failed to load sections', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClone = async (id: string) => {
    try {
      await CloneSectionDefinition(id)
      toast({ title: 'Section cloned successfully' })
      loadSections()
    } catch (err: any) {
      toast({ title: 'Failed to clone', description: err.toString(), variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this section? Templates using it might be affected.',
      )
    )
      return
    try {
      await DeleteSectionDefinition(id)
      toast({ title: 'Section deleted' })
      loadSections()
    } catch (err: any) {
      toast({ title: 'Failed to delete', description: err.toString(), variant: 'destructive' })
    }
  }

  const handleSubmit = async (data: any) => {
    try {
      if (editingId) {
        await UpdateSectionDefinition({ id: editingId, ...data })
        toast({ title: 'Section updated' })
      } else {
        await CreateSectionDefinition(data)
        toast({ title: 'Section created' })
      }
      setIsCreating(false)
      setEditingId(null)
      loadSections()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.toString(), variant: 'destructive' })
    }
  }

  const filtered = sections.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))

  // Group by category
  const grouped = filtered.reduce(
    (acc, s) => {
      const cat = s.category || 'Uncategorized'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(s)
      return acc
    },
    {} as Record<string, any[]>,
  )

  if (isCreating || editingId) {
    const activeSection = editingId ? sections.find((s) => s.id === editingId) : null
    return (
      <div className="max-w-4xl mx-auto py-6">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => {
              setIsCreating(false)
              setEditingId(null)
            }}
          >
            Back to Library
          </Button>
          <h2 className="text-2xl font-bold font-heading">
            {activeSection
              ? activeSection.is_builtin
                ? 'View Section'
                : 'Edit Section'
              : 'New Section Definition'}
          </h2>
        </div>
        <Card className="p-6">
          <SectionForm
            initialData={activeSection}
            isBuiltin={activeSection?.is_builtin}
            onSubmit={handleSubmit}
            onCancel={() => {
              setIsCreating(false)
              setEditingId(null)
            }}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
            <Library className="w-8 h-8 text-primary" /> Section Library
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage reusable section blueprints for your templates.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Section
        </Button>
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute ml-3" />
        <Input
          placeholder="Search sections..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-muted rounded"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-32" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">{category}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {((items as any[]) || []).map((s) => (
                  <Card
                    key={s.id}
                    className="p-4 flex flex-col hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setEditingId(s.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-foreground line-clamp-1">{s.name}</h4>
                      {s.is_builtin && (
                        <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Built-in
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                      {s.description || 'No description provided.'}
                    </p>
                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleClone(s.id)
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" /> Clone
                      </Button>
                      {!s.is_builtin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(s.id)
                          }}
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No section definitions found matching your search.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

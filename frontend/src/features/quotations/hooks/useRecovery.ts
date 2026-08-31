import { useEffect } from 'react'
import { ClearRecovery, LoadRecovery, SaveRecovery } from '../../../../wailsjs/go/wails/AppHandler'

export function useRecovery(quotationId: string, document: any) {
  useEffect(() => {
    if (!document || !quotationId) return
    const timer = window.setTimeout(() => {
      SaveRecovery(quotationId, JSON.stringify(document)).catch((error) => {
        console.error('Could not write recovery checkpoint', error)
      })
    }, 750)
    return () => window.clearTimeout(timer)
  }, [document, quotationId])

  const clearRecovery = () => ClearRecovery(quotationId)

  const checkRecovery = async (): Promise<any | null> => {
    const checkpoint = await LoadRecovery(quotationId)
    return checkpoint?.document ?? null
  }

  return { clearRecovery, checkRecovery }
}

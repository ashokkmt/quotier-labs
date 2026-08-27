import { useEffect } from "react"

const RECOVERY_PREFIX = "quotier_recovery_"

export function useRecovery(quotationId: string, document: any) {
  useEffect(() => {
    if (!document || !quotationId) return
    // Write checkpoint to localStorage
    localStorage.setItem(RECOVERY_PREFIX + quotationId, JSON.stringify({
      timestamp: Date.now(),
      document: document
    }))
  }, [document, quotationId])

  const clearRecovery = () => {
    localStorage.removeItem(RECOVERY_PREFIX + quotationId)
  }

  const checkRecovery = (): any | null => {
    const data = localStorage.getItem(RECOVERY_PREFIX + quotationId)
    if (data) {
      try {
        return JSON.parse(data)
      } catch {
        return null
      }
    }
    return null
  }

  return { clearRecovery, checkRecovery }
}

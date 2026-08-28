import { useState, useEffect } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CustomerCreateDialog } from './CustomerCreateDialog'
import { SearchCustomers } from '../../../wailsjs/go/wails/CustomerHandler'

export function CustomerCombobox({
  value,
  onChange,
}: {
  value?: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [customers, setCustomers] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    // Basic debounce for search
    const timer = setTimeout(() => {
      SearchCustomers(search)
        .then((res) => setCustomers(res || []))
        .catch(console.error)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const selectedCustomer = customers.find((c) => c.id === value)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedCustomer ? selectedCustomer.name : 'Select customer...'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search customers..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No customers found.</CommandEmpty>
              <CommandGroup>
                {customers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.id}
                    onSelect={(currentValue: string) => {
                      onChange(currentValue === value ? '' : currentValue)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === customer.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {customer.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false)
                    setDialogOpen(true)
                  }}
                  className="text-primary font-medium border-t rounded-none justify-center mt-1"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create New Customer
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {dialogOpen && (
        <CustomerCreateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={(c) => {
            setDialogOpen(false)
            // Add to list and select it
            setCustomers((prev) => [c, ...prev])
            onChange(c.id)
          }}
        />
      )}
    </>
  )
}

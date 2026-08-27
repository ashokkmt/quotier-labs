import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  LayoutTemplate,
  Users,
  Package,
  Building2,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Quotations', href: '/quotations', icon: FileText },
  { name: 'Templates', href: '/templates', icon: LayoutTemplate },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Products', href: '/products', icon: Package, disabled: true },
  { name: 'Company', href: '/company', icon: Building2 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  collapsed?: boolean
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  return (
    <div
      className={cn(
        'flex flex-col h-full border-r bg-card transition-all duration-300',
        collapsed ? 'w-[80px]' : 'w-[240px]',
      )}
    >
      <div className="flex h-14 items-center px-4 border-b">
        <div className="font-heading font-bold text-lg text-primary truncate">
          {collapsed ? 'QL' : 'Quotier Labs'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  item.disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
                  collapsed ? 'justify-center px-0' : '',
                )
              }
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn('h-5 w-5 flex-shrink-0', collapsed ? 'mr-0' : 'mr-3')} />
              {!collapsed && <span>{item.name}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

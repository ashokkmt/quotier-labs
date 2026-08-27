import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './hooks/use-theme'
import { AppLayout } from './layouts/AppLayout'
import { Dashboard } from './features/dashboard/Dashboard'
import { OnboardingWizard } from './features/onboarding/components/OnboardingWizard'
import { PlaceholderPage } from './features/PlaceholderPage'
import { CustomerList } from './features/customers/CustomerList'
import { SectionLibrary } from './features/sections/SectionLibrary'
import { TemplateList } from './features/templates/TemplateList'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    path: '/onboarding',
    element: <OnboardingWizard />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        path: 'sections',
        element: <SectionLibrary />
      },
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'quotations',
        element: <PlaceholderPage title="Quotations" />,
      },
      {
        path: 'templates',
        element: <TemplateList />,
      },
      {
        path: 'customers',
        element: <CustomerList />,
      },
      {
        path: 'company',
        element: <PlaceholderPage title="Company Settings" />,
      },
      {
        path: 'settings',
        element: <PlaceholderPage title="Application Settings" />,
      },
    ],
  },
])

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="quotierlabs-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App

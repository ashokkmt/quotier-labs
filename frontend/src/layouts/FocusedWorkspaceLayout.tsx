import { Outlet } from 'react-router-dom'

export function FocusedWorkspaceLayout() {
  // Builder headers own their single Back action. The application sidebar is
  // already excluded for focused routes by AppLayout.
  return <Outlet />
}

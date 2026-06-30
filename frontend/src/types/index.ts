export type TicketType = 'bug' | 'feature' | 'fix'

export type TicketState =
  | 'new'
  | 'ready_for_implementation'
  | 'in_progress'
  | 'ready_for_acceptance'
  | 'done'

export interface User {
  id: string
  email: string
  emailVerified: boolean
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface Team {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Epic {
  id: string
  teamId: string
  title: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface Ticket {
  id: string
  type: TicketType
  state: TicketState
  title: string
  body: string
  team: { id: string; name: string }
  epic: { id: string; title: string } | null
  createdBy: { id: string; email: string }
  createdAt: string
  modifiedAt: string
}

export interface Comment {
  id: string
  body: string
  createdAt: string
  author: { id: string; email: string }
}

export interface ApiResponse<T> {
  data: T
  error: string | null
}

export const TICKET_STATES: TicketState[] = [
  'new',
  'ready_for_implementation',
  'in_progress',
  'ready_for_acceptance',
  'done',
]

export const TICKET_TYPES: TicketType[] = ['bug', 'feature', 'fix']

export const STATE_LABEL: Record<TicketState, string> = {
  new: 'New',
  ready_for_implementation: 'Ready for Implementation',
  in_progress: 'In Progress',
  ready_for_acceptance: 'Ready for Acceptance',
  done: 'Done',
}

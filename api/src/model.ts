export type Role = 'employee' | 'manager' | 'admin';
export type Status = 'new' | 'in_review' | 'in_progress' | 'awaiting_clarification' | 'implemented' | 'rejected' | 'closed';
export type ComplaintType = 'problem' | 'suggestion' | 'praise';
export type Priority = 'low' | 'medium' | 'high';
export interface User { id: string; name: string; role: Role; departmentId: string }
export interface Category { id: string; name: string; assigneeId: string | null; dueInDays: number }
export interface ReferenceData {
  departments: { id: string; name: string }[];
  categories: Category[];
  assignees: User[];
}
export interface Attachment { name: string; mediaType: string; sizeBytes: number; isPlaceholder: true }
export interface Comment {
  id: string; author: User; kind: 'comment' | 'clarification_request' | 'clarification_response';
  text: string; createdAt: string;
}
export interface HistoryEvent {
  id: string; kind: 'created' | 'assigned' | 'status_changed' | 'commented' | 'decided' | 'undone';
  actor: User | null; createdAt: string; fromStatus: Status | null; toStatus: Status | null; text: string; simulated?: boolean;
}
export interface Decision {
  outcome: 'implemented' | 'rejected' | 'closed'; explanation: string; actions: string | null;
  author: User; createdAt: string;
}
export interface Complaint {
  id: string; number: string; type: ComplaintType; categoryId: string; departmentId: string;
  author: User; description: string; proposedSolution: string | null; priority: Priority;
  attachments: Attachment[]; status: Status; assignee: User | null;
  routing: { queue: 'assigned' | 'unassigned'; reason: 'category_rule' | 'no_rule' | 'manual_assignment' };
  createdAt: string; updatedAt: string; dueAt: string; firstResponseAt: string | null;
  closedAt: string | null; overdue: boolean; comments: Comment[]; history: HistoryEvent[];
  decision: Decision | null; nextAction: string;
  /** Created by the demo simulator (X-Demo-Source header, DEMO_SIMULATION_ENABLED=true). */
  simulated?: boolean;
  canUndo?: boolean; undoExpiresAt?: string | null;
  anonymous?: boolean;
  /** Optional author-chosen point; absent when not chosen. */
  location?: GeoPoint;
}

export interface GeoPoint { latitude: number; longitude: number }

export interface AnonymousActor { name: 'Аноним' | 'Автор (аноним)' }
/** Response-only shape. Never save it: the store retains the real author for access checks. */
export type ComplaintView = Omit<Complaint, 'author' | 'comments' | 'history'> & {
  author: User | AnonymousActor;
  comments: (Omit<Comment, 'author'> & { author: User | AnonymousActor })[];
  history: (Omit<HistoryEvent, 'actor'> & { actor: User | AnonymousActor | null })[];
};

export const terminalStatuses: Status[] = ['implemented', 'rejected', 'closed'];

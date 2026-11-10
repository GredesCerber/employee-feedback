// Generated from contracts/api.yaml; do not edit.
export const statusTransitions = {
  "new": [
    "in_review",
    "awaiting_clarification",
    "rejected"
  ],
  "in_review": [
    "in_progress",
    "awaiting_clarification",
    "implemented",
    "rejected",
    "closed"
  ],
  "in_progress": [
    "in_review",
    "awaiting_clarification",
    "implemented",
    "rejected",
    "closed"
  ],
  "awaiting_clarification": [
    "in_review"
  ],
  "implemented": [],
  "rejected": [],
  "closed": []
} as const;

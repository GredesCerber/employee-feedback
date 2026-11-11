export interface paths {
    "/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Resolve the demo user
         * @description Returns the synthetic identity selected by X-Demo-User. Role and department are resolved server-side, never accepted from request JSON. Available to all three roles.
         */
        get: operations["getSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reference-data": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get form and routing reference data
         * @description All roles can read categories and departments. Only managers/admins receive eligible assignees; employees get assignees=[]. Missing category rules are represented by assigneeId=null. This read-only MVP catalogue has no administration mutations.
         */
        get: operations["getReferenceData"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List visible complaints with filters
         * @description Employees see only their own complaints. Managers and admins see all synthetic complaints, including unassigned across departments. Apply access restriction before all filters, totals and pagination. Combine filters with AND; inclusive dueAfter/dueBefore bounds, UTC comparison. Inverted dates return 422. q is trimmed and split on whitespace; every search word must occur as a literal substring in at least one of number, description, proposedSolution or comments.text (AND across words, order independent). Search is case-insensitive and normalizes ё to е on both sides; no regex, SQL or morphology. Different words may match different fields. Stable order createdAt descending then id ascending. Empty results return 200 with items=[]. Optional query filter simulated=true|false (boolean, not listed in parameters to keep the established filter set unchanged): false hides complaints created by the demo simulator, true selects only them, omitted returns all.
         */
        get: operations["listComplaints"];
        put?: never;
        /**
         * Register and route an employee complaint
         * @description Employee only. Creates status=new and a unique number, derives author/department from session, routes by category, sets dueAt=createdAt + category.dueInDays calendar days and appends created/assigned history in one transaction. Missing routing owner is a successful unassigned complaint visible to managers. firstResponseAt, closedAt and decision start null; comments empty. Return the complete persisted Complaint.
         */
        post: operations["createComplaint"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/{complaintId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        /**
         * Read complaint, history and result
         * @description Employee author only; managers/admins can read all complaints. Other employees receive the same 404 as an unknown ID. Includes ordered comments/history, responsible person, deadline, nextAction and explanation of any terminal outcome. No edit/delete operation is part of this MVP.
         */
        get: operations["getComplaint"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/{complaintId}/assignment": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Assign or reassign a complaint
         * @description Manager only, across departments including fallback queue. assigneeId must identify an existing manager (422 otherwise). Reject terminal complaints with 409; preserve status/dueAt, set routing to assigned/manual_assignment and append assigned history. Selecting the existing assignee is a 200 no-op. Assignment does not count as a first response.
         */
        patch: operations["assignComplaint"];
        trace?: never;
    };
    "/complaints/{complaintId}/status": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Move to review or work
         * @description Manager only. Check x-status-transitions against current persisted status. Only in_review/in_progress targets accepted here; clarification uses comments, terminal outcomes use decision. Invalid known transition or same-state change is 409; unsupported target is 422. Save status plus actor/time history atomically. First successful manager status action sets firstResponseAt if absent.
         */
        patch: operations["changeComplaintStatus"];
        trace?: never;
    };
    "/complaints/{complaintId}/comments": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Comment, request clarification or answer
         * @description Manager may add comment or clarification_request on any nonterminal complaint. Employee author may add comment, or clarification_response only while awaiting_clarification; other employees get 404. Admin cannot post. Manager request requires nonblank text and moves new/in_review/in_progress to awaiting_clarification. A repeated request while waiting is 409. Author response moves awaiting_clarification to in_review. Save comment, status and history atomically in ascending timestamp/id order. Ordinary comment preserves status. First manager comment/request sets firstResponseAt if absent; author response never sets it. Wrong kind for role is 403; terminal modification or incompatible current status is 409.
         */
        post: operations["addComment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/{complaintId}/decision": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Close with a result or motivated refusal
         * @description Manager only. outcome implemented/rejected/closed must be allowed by x-status-transitions. Nonblank explanation is mandatory for every outcome, including refusal; blank/missing is 422. Save decision, terminal status, closedAt and history atomically and make them visible to author. First manager decision sets firstResponseAt if absent. Repeat decision or closing while awaiting clarification is 409. Terminal records are immutable in MVP.
         */
        post: operations["recordDecision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read administrative summary
         * @description Admin only; employees/managers receive 403. Aggregate all synthetic complaints into one consistent snapshot. Terminal states implemented/rejected/closed all count toward closedShare. Only manager status/comment/decision actions count as first response, never registration, auto/manual assignment or author comments. Recurring topics are counts grouped by category. Empty dataset returns total=0, all three type counts=0, closedCount=0, closedShare=0, respondedCount=0, averageFirstResponseHours=null, recurringTopics=[].
         */
        get: operations["getSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/{complaintId}/undo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Undo the latest eligible manager action
         * @description Manager only. Undo the latest outstanding status change or assignment made by this same user within UNDO_WINDOW_S (default 600 seconds). At the exact expiry instant and later return 409 UNDO_EXPIRED; if the last outstanding action is by another user, a comment, decision or submission, or the complaint is terminal, return 409 NOTHING_TO_UNDO. Restore the previous status, assignee, routing, firstResponseAt and dueAt snapshot atomically, recompute overdue/nextAction, update updatedAt and append an undone history event without deleting prior history. Undo itself is not an eligible action: a repeated call can unwind the previous eligible action while that action is still inside its own window. No request body is needed. Return the complete current Complaint with refreshed manager canUndo/undoExpiresAt. Errors leave all state unchanged.
         */
        post: operations["undoLastAction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the simulated notification feed
         * @description Employee authors receive clarification requests and decisions for their own complaints only. Managers receive unassigned-queue events, author clarification responses for complaints assigned to them, and due-soon events for their assigned or unassigned nonterminal complaints when 0 < dueAt-now < 24 hours. Other assigned complaints do not enter a manager feed. For due-soon events use createdAt=dueAt minus 24 hours and a stable id tied to complaint/deadline, so polling does not create duplicates. History events keep their original timestamp and stable id. since is an exclusive date-time lower bound; unreadCount counts returned events. No server read state or POST endpoint, no external delivery. Apply anonymity before serializing text, IDs and links. Admin is not a feed recipient and receives 403.
         */
        get: operations["listNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Find visible complaints with similar wording
         * @description Search only complaints readable by the current role: employees see their own records, managers/admins see the ordinary list scope. Normalize case and ё to е, tokenize Unicode letters/digits, remove a fixed documented Russian stop-word set, and compare description plus proposedSolution token sets using Jaccard similarity. Return the top three positive matches with number, category, status and score 0..1; stable tie-break by createdAt descending then id ascending. Trimmed input shorter than 10 characters, all stopwords or no matches yields items=[] with 200. Never expose other employees records to an employee via this endpoint; no real LLM or external requests.
         */
        get: operations["findSimilarComplaints"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/suggest-category": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Suggest a category from offline demo examples
         * @description All demo roles may request a category suggestion for their submitted text. Preserve the category id/name or null response format. The baseline #121 uses recorded api/data/ai-fixtures.json examples or deterministic demo rules with source=demo-fixture. The optional #149 provider reports source=llm only after successful live inference, source=rules for local fallback without a configured key or after failure, and source=none with category=null for unknown or trimmed-short text. Never expose provider keys or raw upstream errors. The client identifies the actual source and preserves a category the user already chose.
         */
        get: operations["suggestCategory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/complaints/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Export the filtered complaint list as CSV
         * @description Manager/admin only. Apply the same authorization and AND filters as listComplaints, including q, but export all matching records without limit/offset pagination in createdAt descending then id ascending order. Return text/csv; charset=utf-8 with a UTF-8 BOM, CRLF rows and RFC 4180 quoting: double embedded quotes and quote cells containing commas, quotes or line breaks. Protect spreadsheet formula injection by prefixing an apostrophe before values beginning with =, +, - or @ (also after leading whitespace/control characters); quote the resulting value as needed. Header columns in order: номер, тип, категория, подразделение, статус, ответственный, создано, срок, просрочено, первый ответ, итог. Labels are Russian, dates ISO 8601 UTC, missing values empty, просрочено is да/нет. No author column; anonymous author identity must not appear in generated metadata or result text. Empty result returns BOM and the header row. This endpoint has no JSON success representation.
         */
        get: operations["exportComplaints"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/demo/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Restore the original synthetic demonstration dataset
         * @description Admin only, no request body. Replace all complaints, comments, history and undo state with the immutable seed and restart numbering after the maximum seed number. Clear derived notification state; if PERSIST_FILE is enabled, persist the reset snapshot atomically before success. Return loadedCount and log a reset event without complaint text or secrets. DEMO_RESET_ENABLED=false returns 404 NOT_FOUND without changing data; after identity/role authorization, use a safe disabled-feature message. Errors must not leave a partially reset store. This is a demo feature, disabled in production.
         */
        post: operations["resetDemo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check local API liveness
         * @description Public liveness endpoint available without X-Demo-User. Returns status=ok and the version from api/package.json. It does not assert database durability, external integration readiness or authenticated user access.
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/summary/digest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a weekly digest with an honest fallback
         * @description Manager/admin only; employees receive 403. Select complaints by createdAt in the half-open UTC period [from,to), then apply optional department. If omitted, to is the snapshot time and from is seven days before to. If only from is supplied, to defaults to now; if only to is supplied, from defaults to seven days before it. Invalid timestamps or from >= to return 422. Compute total, category/department counts and overdue count from this same selected cohort; empty input returns a readable no-complaints template and highlights=[]. Send aggregates only to the optional provider: category/department labels and counts, no raw complaint text, author data, identifiers, comments or attachments. Provider failure returns 200 with source=template, never a provider exception or secret. Successful generation alone may use source=llm. Cache identical selected aggregate facts and filters for at most 60 seconds; return the cached generatedAt/period so the snapshot age remains visible. Changes to aggregate facts invalidate reuse. This endpoint does not change permissions or fields of GET /summary.
         */
        get: operations["getSummaryDigest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/analytics/trends": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read dashboard trends and aggregate totals
         * @description Manager/admin only; employees receive 403. Apply optional department to every block before calculations, using the ordinary manager/admin readable scope and one generatedAt snapshot. Return 14 zero-filled UTC day buckets and 8 zero-filled Monday-based week buckets, including the current day/week. Other blocks cover the whole filtered store: byCategory, byDepartment, totals, topThemes and all overdue nonterminal complaints including unassigned. In an empty store chart buckets contain zero counts, other arrays are empty, totals are zero and averageResolutionHours is null. topThemes are the five most frequent repeated words across description/proposedSolution after lowercase and ё-to-е normalization, Unicode letter/digit tokenization and the documented Russian stop-word set; count a word once per complaint, require two complaints and use alphabetical tie-breaks. This is deterministic word counting, not LLM inference. Do not return author identities, complaint text or comments; category/theme labels are untrusted plain text. User-entered wording can contain indirect identifying clues, so aggregate themes do not guarantee full anonymity. The new totals/byDepartment fields support manager dashboards without changing the existing admin-only /summary endpoint.
         */
        get: operations["getAnalyticsTrends"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @enum {string} */
        Role: "employee" | "manager" | "admin";
        /** @enum {string} */
        ComplaintType: "problem" | "suggestion" | "praise";
        /** @enum {string} */
        Status: "new" | "in_review" | "in_progress" | "awaiting_clarification" | "implemented" | "rejected" | "closed";
        /**
         * @default medium
         * @enum {string}
         */
        Priority: "low" | "medium" | "high";
        User: {
            id: string;
            /** @description Synthetic display name */
            name: string;
            role: components["schemas"]["Role"];
            departmentId: string;
        };
        Department: {
            id: string;
            /** @description Department label */
            name: string;
        };
        Category: {
            id: string;
            /** @description Category label */
            name: string;
            assigneeId: string | null;
            /** @description Calendar days from creation to deadline. Used even when assigneeId is null. */
            dueInDays: number;
        };
        /**
         * @example {
         *       "departments": [
         *         {
         *           "id": "procurement",
         *           "name": "Закупки"
         *         }
         *       ],
         *       "categories": [
         *         {
         *           "id": "cross_department",
         *           "name": "Межотдельное взаимодействие",
         *           "assigneeId": "manager-1",
         *           "dueInDays": 7
         *         },
         *         {
         *           "id": "no_rule_demo",
         *           "name": "Категория без ответственного (демо)",
         *           "assigneeId": null,
         *           "dueInDays": 7
         *         }
         *       ],
         *       "assignees": [
         *         {
         *           "id": "manager-1",
         *           "name": "Руководитель закупок",
         *           "role": "manager",
         *           "departmentId": "procurement"
         *         }
         *       ]
         *     }
         */
        ReferenceData: {
            departments: components["schemas"]["Department"][];
            categories: components["schemas"]["Category"][];
            /** @description Only manager users eligible for assignment. Employees receive an empty array. */
            assignees: components["schemas"]["User"][];
        };
        /** @description MVP attachment metadata only. No bytes, URLs, download, antivirus or external fetching. UI must label it as a test-file placeholder, not an uploaded file. */
        Attachment: {
            /** @description Synthetic placeholder filename; display as plain text, never interpret as a filesystem path. */
            name: string;
            /** @enum {string} */
            mediaType: "text/plain" | "application/pdf" | "image/png" | "image/jpeg";
            sizeBytes: number;
            /** @constant */
            isPlaceholder: true;
        };
        /** @description Author and department come from the server-resolved session, never from this body. Unknown fields are rejected. Category must exist; a category without an assignee is valid. */
        CreateComplaint: {
            type: components["schemas"]["ComplaintType"];
            categoryId: string;
            /** @description Trimmed nonblank problem or proposal text */
            description: string;
            /** @description Optional proposed solution; omit when blank */
            proposedSolution?: string;
            priority?: components["schemas"]["Priority"];
            /** @default [] */
            attachments?: components["schemas"]["Attachment"][];
            /**
             * @description Optional author redaction from managers and admins, including comments/history. Ownership is still stored internally. Omitted or false preserves existing identified behavior; no real authentication or protection against clues in text is promised.
             * @default false
             */
            anonymous?: boolean;
        };
        /** @description At creation, a valid configured manager yields assigned/category_rule; missing or unavailable assignee yields unassigned/no_rule and assignee=null. Never discard the complaint. Manual assignment sets assigned/manual_assignment. */
        Routing: {
            /** @enum {string} */
            queue: "assigned" | "unassigned";
            /** @enum {string} */
            reason: "category_rule" | "no_rule" | "manual_assignment";
        };
        Comment: {
            id: string;
            /** @description Anonymous author comments use Автор (аноним) for manager/admin readers; other actors remain User. */
            author: components["schemas"]["User"] | components["schemas"]["AnonymousActor"];
            /** @enum {string} */
            kind: "comment" | "clarification_request" | "clarification_response";
            /** @description Plain text comment */
            text: string;
            /** Format: date-time */
            createdAt: string;
        };
        CommentInput: {
            /** @enum {string} */
            kind: "comment" | "clarification_request" | "clarification_response";
            /** @description Trimmed nonblank text */
            text: string;
        };
        /**
         * @example {
         *       "outcome": "implemented",
         *       "explanation": "Добавлены обязательные поля.",
         *       "actions": "Опубликован новый шаблон."
         *     }
         * @example {
         *       "outcome": "rejected",
         *       "explanation": "Сейчас нет подходящего помещения; вернуться к вопросу при перепланировке."
         *     }
         */
        DecisionInput: {
            /** @enum {string} */
            outcome: "implemented" | "rejected" | "closed";
            /** @description Required result or reason for refusal. Whitespace-only is invalid. */
            explanation: string;
            /** @description Actions taken or agreed follow-up; optional */
            actions?: string;
        };
        Decision: {
            /** @enum {string} */
            outcome: "implemented" | "rejected" | "closed";
            /** @description Result visible to author */
            explanation: string;
            actions: string | null;
            author: components["schemas"]["User"];
            /** Format: date-time */
            createdAt: string;
        };
        /** @description Append-only timeline. actor=null means automatic routing by the system; every user action records the resolved user. Ordered by createdAt ascending then id ascending; timestamps are server generated UTC. Anonymous-author actions are redacted according to x-anonymity. Undo appends kind=undone without deleting or rewriting prior events. */
        HistoryEvent: {
            id: string;
            /** @enum {string} */
            kind: "created" | "assigned" | "status_changed" | "commented" | "decided" | "undone";
            actor: components["schemas"]["User"] | null | components["schemas"]["AnonymousActor"];
            /** Format: date-time */
            createdAt: string;
            fromStatus: components["schemas"]["Status"] | null;
            toStatus: components["schemas"]["Status"] | null;
            /** @description Readable event text, without private/internal notes */
            text: string;
            /** @description true when the action was made by the demo simulator. Always false otherwise. */
            simulated?: boolean;
        };
        Complaint: {
            id: string;
            /** @description Unique human-readable registration number; synthetic seed uses A-001..A-020. */
            number: string;
            type: components["schemas"]["ComplaintType"];
            categoryId: string;
            departmentId: string;
            /** @description User for identified submissions and the author viewing their own submission; AnonymousActor for manager/admin readers of an anonymous submission. See x-anonymity. */
            author: components["schemas"]["User"] | components["schemas"]["AnonymousActor"];
            /** @description Original description */
            description: string;
            proposedSolution: string | null;
            priority: components["schemas"]["Priority"];
            attachments: components["schemas"]["Attachment"][];
            status: components["schemas"]["Status"];
            assignee: components["schemas"]["User"] | null;
            routing: components["schemas"]["Routing"];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** Format: date-time */
            dueAt: string;
            firstResponseAt: string | null;
            closedAt: string | null;
            /** @description True iff dueAt < server now and status is not implemented, rejected or closed. Terminal complaints are never overdue. */
            overdue: boolean;
            /** @description Ascending createdAt then id; no hidden comments in MVP. */
            comments: components["schemas"]["Comment"][];
            history: components["schemas"]["HistoryEvent"][];
            decision: components["schemas"]["Decision"] | null;
            /** @description Readable server-derived next step for the author, including unassigned or awaiting clarification. */
            nextAction: string;
            /**
             * @description Whether author identity is redacted from other readers. Optional for compatibility; absence means false. The author can still read their own complaint and reply.
             * @default false
             */
            anonymous?: boolean;
            /** @description Optional manager-view capability: true only if the latest eligible outstanding status/assignment action belongs to the current manager, is inside the undo window and the complaint is not terminal. Other roles omit this property. */
            canUndo?: boolean;
            /**
             * Format: date-time
             * @description Optional manager-view deadline for the action described by canUndo. Non-null iff canUndo=true; null when no action is available. Computed by the server with UNDO_WINDOW_S; UI may hide the button at this time but API rechecks eligibility.
             */
            undoExpiresAt?: string | null;
            /** @description true when created by the demo simulator (X-Demo-Source: simulator with DEMO_SIMULATION_ENABLED=true). Always false otherwise. */
            simulated?: boolean;
        };
        /** @description total is the count after authorization and filters, before pagination. Stable order: createdAt descending then id ascending. */
        ComplaintList: {
            items: components["schemas"]["Complaint"][];
            total: number;
            limit: number;
            offset: number;
        };
        /** @description Only ordinary nonterminal transitions use this operation. Use comments for clarification and decision for terminal status. */
        StatusInput: {
            /** @enum {string} */
            status: "in_review" | "in_progress";
        };
        /** @description Existing manager user ID. Assignment preserves status and deadline and appends history atomically. Terminal complaints cannot be reassigned. */
        AssignmentInput: {
            assigneeId: string;
        };
        TypeCount: {
            type: components["schemas"]["ComplaintType"];
            count: number;
        };
        CategoryCount: {
            categoryId: string;
            /** @description Category label */
            categoryName: string;
            count: number;
        };
        /**
         * @example {
         *       "total": 0,
         *       "byType": [
         *         {
         *           "type": "problem",
         *           "count": 0
         *         },
         *         {
         *           "type": "suggestion",
         *           "count": 0
         *         },
         *         {
         *           "type": "praise",
         *           "count": 0
         *         }
         *       ],
         *       "closedCount": 0,
         *       "closedShare": 0,
         *       "averageFirstResponseHours": null,
         *       "respondedCount": 0,
         *       "recurringTopics": [],
         *       "generatedAt": "2026-11-10T09:00:00Z"
         *     }
         */
        Summary: {
            /** @description All complaints, including terminal statuses, at generatedAt. */
            total: number;
            /** @description Exactly one item for each problem, suggestion, praise; zero counts included. */
            byType: components["schemas"]["TypeCount"][];
            /** @description Number with status implemented, rejected or closed. */
            closedCount: number;
            /** @description closedCount / total, ratio 0..1; 0 when total=0. UI multiplies by 100 for percent. */
            closedShare: number;
            /** @description Mean of (firstResponseAt-createdAt) in hours over complaints with a firstResponseAt, excluding unanswered. null if none. No rounding required. */
            averageFirstResponseHours: number | null;
            /** @description Denominator used by averageFirstResponseHours; number with firstResponseAt != null. */
            respondedCount: number;
            /** @description Categories with at least 2 complaints of any type/status, sorted count descending then categoryId ascending. Counts each complaint once; no AI clustering. */
            recurringTopics: components["schemas"]["CategoryCount"][];
            /**
             * Format: date-time
             * @description Server UTC timestamp for one consistent aggregate snapshot.
             */
            generatedAt: string;
            /** @description Optional breakdown for every known department, sorted departmentId ascending; zero counts and closedShare=0 are included. Counts all visible complaints; contains no author identity. */
            byDepartment?: components["schemas"]["DepartmentSummary"][];
            /** @description Optional completion-time breakdown for every known category, sorted categoryId ascending. Include closedCount=0 and averageResolutionHours=null when no completed records exist. */
            avgResolutionHoursByCategory?: components["schemas"]["CategoryResolution"][];
            /** @description Optional count of nonterminal complaints with dueAt < generatedAt, including unassigned complaints. Zero for an empty store; terminal records do not contribute. */
            overdueCount?: number;
        };
        Error: {
            /** @enum {string} */
            code: "BAD_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_TRANSITION" | "VALIDATION_ERROR" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "INTERNAL_ERROR" | "RATE_LIMITED" | "UNDO_EXPIRED" | "NOTHING_TO_UNDO";
            /** @description Safe human-readable explanation without stack traces or secrets */
            message: string;
            details?: {
                /** @description Invalid field or query parameter */
                field: string;
                /** @description Reason */
                message: string;
            }[];
        };
        /** @description Public projection of an anonymous author. No id, departmentId, role or extra properties are allowed; no recoverable author identifier is embedded in another field. */
        AnonymousActor: {
            /**
             * @description Аноним in Complaint.author; Автор (аноним) in author comments and history.
             * @enum {string}
             */
            name: "Аноним" | "Автор (аноним)";
        };
        DepartmentSummary: {
            departmentId: string;
            /** @description Department label */
            departmentName: string;
            count: number;
            closedCount: number;
            /** @description closedCount / count, or 0 if count=0. Closed means implemented, rejected or closed. */
            closedShare: number;
        };
        CategoryResolution: {
            categoryId: string;
            /** @description Category label */
            categoryName: string;
            closedCount: number;
            /** @description Mean (closedAt-createdAt) / 3600000 for terminal complaints in this category with a closedAt. null if no completed records; unfinished records are excluded. closedCount is the denominator. */
            averageResolutionHours: number | null;
        };
        /** @description Deterministic stable id per event, without an author identifier. Simulated internal feed, not actual email or Bitrix delivery. */
        Notification: {
            id: string;
            /** @enum {string} */
            kind: "clarification_requested" | "decision_recorded" | "unassigned" | "clarification_received" | "due_soon";
            complaintId: string;
            /** @description Unique human-readable registration number; synthetic seed uses A-001..A-020. */
            complaintNumber: string;
            /** Format: date-time */
            createdAt: string;
            /** @description Safe readable event description, never exposing a redacted author identity. */
            message: string;
            /** @description Relative UI link to the complaint: /my/id for its employee author, /queue/id for a manager. Never an external URL. */
            href: string;
            /** @constant */
            simulated: true;
            /** @constant */
            disclaimer: "Имитация: в промышленной версии email / Битрикс24";
        };
        /** @description Only events with createdAt strictly greater than since are included; omitted since includes all eligible events. unreadCount equals returned items.length, since is a client-owned lastSeen marker, no read-state mutation/storage. Stable order createdAt descending then id ascending. */
        NotificationList: {
            items: components["schemas"]["Notification"][];
            unreadCount: number;
            /** Format: date-time */
            generatedAt: string;
        };
        SimilarComplaint: {
            id: string;
            /** @description Unique human-readable registration number; synthetic seed uses A-001..A-020. */
            number: string;
            categoryId: string;
            /** @description Category label */
            categoryName: string;
            status: components["schemas"]["Status"];
            /** @description Jaccard similarity: intersection size / union size of normalized non-stopword token sets. Zero if either set is empty. No live LLM call. */
            score: number;
        };
        /** @description At most three visible complaints with positive similarity, sorted score descending then createdAt descending then id ascending. No private description, author or comments returned. */
        SimilarComplaints: {
            items: components["schemas"]["SimilarComplaint"][];
        };
        SuggestedCategory: {
            id: string;
            /** @description Category label */
            name: string;
        };
        CategorySuggestion: {
            /** @description Recognized existing category; null when there is no confident demo match. */
            category: components["schemas"]["SuggestedCategory"] | null;
            /**
             * @description Actual provenance: llm is a successful live provider response; demo-fixture is a recorded demo example; rules is deterministic local matching, including fallback without a key or after provider failure; none means no suggestion. The client labels the source honestly.
             * @enum {string}
             */
            source: "llm" | "demo-fixture" | "rules" | "none";
        };
        /** @description Number of complaints loaded from the immutable seed after a successful reset. */
        DemoResetResult: {
            loadedCount: number;
        };
        Health: {
            /** @constant */
            status: "ok";
            /** @description API package version, independent of the OpenAPI contract version. */
            version: string;
        };
        /** @description UTC half-open interval [from,to): createdAt >= from and createdAt < to. from must precede to. Returned timestamps describe the aggregate snapshot, not a promise that all time buckets have observations. */
        AnalyticsPeriod: {
            /** Format: date-time */
            from: string;
            /** Format: date-time */
            to: string;
        };
        /**
         * @description No authors, complaint IDs, descriptions, comments or attachments. Text must report the supplied aggregate counts faithfully and stay readable as text. Cached responses retain the original generatedAt and period, up to 60 seconds old.
         * @example {
         *       "text": "Обращений за период нет.",
         *       "highlights": [],
         *       "period": {
         *         "from": "2026-11-03T09:00:00Z",
         *         "to": "2026-11-10T09:00:00Z"
         *       },
         *       "source": "template",
         *       "generatedAt": "2026-11-10T09:00:00Z"
         *     }
         * @example {
         *       "text": "За период поступило 3 обращения. Чаще всего встречается межотдельное взаимодействие: 2 обращения. Просрочено 1 обращение из этого периода.",
         *       "highlights": [
         *         "Всего за период: 3.",
         *         "Межотдельное взаимодействие: 2.",
         *         "Просрочено: 1."
         *       ],
         *       "period": {
         *         "from": "2026-11-03T09:00:00Z",
         *         "to": "2026-11-10T09:00:00Z"
         *       },
         *       "source": "template",
         *       "generatedAt": "2026-11-10T09:00:00Z"
         *     }
         */
        SummaryDigest: {
            /** @description Plain text weekly digest. No HTML rendering or embedded executable markup; empty-period template explicitly says обращений за период нет. */
            text: string;
            /** @description Up to five facts based on the same aggregates and period. Empty when there are no complaints in the selected period. */
            highlights: string[];
            period: components["schemas"]["AnalyticsPeriod"];
            /**
             * @description llm only for a successful model-generated digest; template when no provider is configured, generation fails, or the period is empty. Both use exactly the same aggregate facts.
             * @enum {string}
             */
            source: "llm" | "template";
            /** Format: date-time */
            generatedAt: string;
        };
        DayCount: {
            /**
             * Format: date
             * @description UTC calendar date, YYYY-MM-DD.
             */
            date: string;
            count: number;
        };
        WeekCount: {
            /**
             * Format: date
             * @description UTC Monday starting the week, YYYY-MM-DD.
             */
            weekStart: string;
            count: number;
        };
        ThemeCount: {
            /** @description Normalized repeated word, displayed as plain text. */
            theme: string;
            /** @description Number of distinct visible complaints containing this token; repeated occurrences within one complaint count once. */
            count: number;
        };
        /** @description Minimal manager/admin drill-down data. No author object, name, description, comments or personal identifiers. id identifies the complaint, never its author. */
        OverdueComplaint: {
            id: string;
            /** @description Unique human-readable registration number; synthetic seed uses A-001..A-020. */
            number: string;
            categoryId: string;
            /** @description Category label. */
            categoryName: string;
            /** Format: date-time */
            dueAt: string;
            /** @description (generatedAt - dueAt) / 3600000 without mandatory rounding. Only nonterminal overdue complaints appear. */
            overdueHours: number;
        };
        /** @description Whole filtered store snapshot, not only the chart window. openCount=total-closedCount; overdueCount includes unassigned nonterminal complaints with dueAt < generatedAt. Empty input yields counts=0 and averageResolutionHours=null. */
        AnalyticsTotals: {
            total: number;
            openCount: number;
            closedCount: number;
            overdueCount: number;
            /** @description Mean (closedAt-createdAt)/3600000 for terminal complaints with closedAt, null if none. Terminal statuses are implemented, rejected and closed. */
            averageResolutionHours: number | null;
        };
        /**
         * @description Every block uses the same department filter and generatedAt. Time series use their fixed chart windows; other aggregates and overdue use the whole filtered store. Zero-filled time buckets coexist with empty category/department/theme/overdue arrays. Illustrative examples below are not totals from the seed dataset.
         * @example {
         *       "generatedAt": "2026-11-10T09:00:00.000Z",
         *       "byDay": [
         *         {
         *           "date": "2026-10-28",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-10-29",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-10-30",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-10-31",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-01",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-02",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-03",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-04",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-05",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-06",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-07",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-08",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-09",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-10",
         *           "count": 0
         *         }
         *       ],
         *       "byWeek": [
         *         {
         *           "weekStart": "2026-09-21",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-09-28",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-05",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-12",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-19",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-26",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-11-02",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-11-09",
         *           "count": 0
         *         }
         *       ],
         *       "byCategory": [],
         *       "byDepartment": [],
         *       "topThemes": [],
         *       "overdue": [],
         *       "totals": {
         *         "total": 0,
         *         "openCount": 0,
         *         "closedCount": 0,
         *         "overdueCount": 0,
         *         "averageResolutionHours": null
         *       }
         *     }
         * @example {
         *       "generatedAt": "2026-11-10T09:00:00.000Z",
         *       "byDay": [
         *         {
         *           "date": "2026-10-28",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-10-29",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-10-30",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-10-31",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-01",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-02",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-03",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-04",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-05",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-06",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-07",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-08",
         *           "count": 2
         *         },
         *         {
         *           "date": "2026-11-09",
         *           "count": 0
         *         },
         *         {
         *           "date": "2026-11-10",
         *           "count": 1
         *         }
         *       ],
         *       "byWeek": [
         *         {
         *           "weekStart": "2026-09-21",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-09-28",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-05",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-12",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-19",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-10-26",
         *           "count": 0
         *         },
         *         {
         *           "weekStart": "2026-11-02",
         *           "count": 2
         *         },
         *         {
         *           "weekStart": "2026-11-09",
         *           "count": 1
         *         }
         *       ],
         *       "byCategory": [
         *         {
         *           "categoryId": "cross_department",
         *           "categoryName": "Межотдельное взаимодействие",
         *           "count": 2
         *         },
         *         {
         *           "categoryId": "catalog",
         *           "categoryName": "Каталог и данные",
         *           "count": 1
         *         }
         *       ],
         *       "byDepartment": [
         *         {
         *           "departmentId": "engineering",
         *           "departmentName": "Проектирование",
         *           "count": 1,
         *           "closedCount": 0,
         *           "closedShare": 0
         *         },
         *         {
         *           "departmentId": "procurement",
         *           "departmentName": "Закупки",
         *           "count": 2,
         *           "closedCount": 1,
         *           "closedShare": 0.5
         *         }
         *       ],
         *       "topThemes": [
         *         {
         *           "theme": "заявка",
         *           "count": 2
         *         }
         *       ],
         *       "overdue": [
         *         {
         *           "id": "complaint-101",
         *           "number": "A-101",
         *           "categoryId": "cross_department",
         *           "categoryName": "Межотдельное взаимодействие",
         *           "dueAt": "2026-11-10T08:00:00Z",
         *           "overdueHours": 1
         *         }
         *       ],
         *       "totals": {
         *         "total": 3,
         *         "openCount": 2,
         *         "closedCount": 1,
         *         "overdueCount": 1,
         *         "averageResolutionHours": 24
         *       }
         *     }
         */
        AnalyticsTrends: {
            /** Format: date-time */
            generatedAt: string;
            /** @description Exactly 14 UTC dates ending with the snapshot date, ascending. Counts createdAt within each day up to generatedAt. Include a zero for every empty day, also for a fully empty store. */
            byDay: components["schemas"]["DayCount"][];
            /** @description Exactly 8 UTC Monday-based weeks including the current week, ascending. Count records created within each week up to generatedAt; zero-fill empty weeks. */
            byWeek: components["schemas"]["WeekCount"][];
            /** @description Counts across the whole filtered store, all types/statuses. Only nonempty categories, sorted count descending then categoryId ascending. Empty store yields []. */
            byCategory: components["schemas"]["CategoryCount"][];
            /** @description Counts and closed shares across the whole filtered store. Only nonempty departments, sorted departmentId ascending. Empty store yields []. This supplies manager widgets without granting access to GET /summary. */
            byDepartment: components["schemas"]["DepartmentSummary"][];
            /** @description At most five repeated normalized tokens from description and proposedSolution. Count each token once per complaint, require at least two complaints, sort count descending then theme ascending. Empty store or no repetitions yields []. */
            topThemes: components["schemas"]["ThemeCount"][];
            /** @description All nonterminal overdue complaints in the filtered store, including unassigned, sorted overdueHours descending then id ascending. Empty store yields []. */
            overdue: components["schemas"]["OverdueComplaint"][];
            totals: components["schemas"]["AnalyticsTotals"];
        };
    };
    responses: {
        /** @description Malformed JSON or malformed query syntax. */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "BAD_REQUEST",
                 *       "message": "Malformed JSON or malformed query syntax."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Missing or unknown demo identity. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "UNAUTHENTICATED",
                 *       "message": "Missing or unknown demo identity."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Known identity lacks the operation role. */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "FORBIDDEN",
                 *       "message": "Known identity lacks the operation role."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Complaint does not exist or is hidden from this user. Use the same response for both. */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "NOT_FOUND",
                 *       "message": "Complaint does not exist or is hidden from this user. Use the same response for both."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Transition not allowed from the current state, duplicate terminal decision, or terminal complaint modification. No partial write. */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "INVALID_TRANSITION",
                 *       "message": "Transition not allowed from the current state, duplicate terminal decision, or terminal complaint modification. No partial write."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Invalid fields, blank text, unknown reference, unsupported status, or invalid filter. No partial write. */
        Validation: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "VALIDATION_ERROR",
                 *       "message": "Invalid fields, blank text, unknown reference, unsupported status, or invalid filter. No partial write."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Request or attachment metadata exceeds documented limits. */
        TooLarge: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "PAYLOAD_TOO_LARGE",
                 *       "message": "Request or attachment metadata exceeds documented limits."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Request body must use application/json. */
        Unsupported: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "UNSUPPORTED_MEDIA_TYPE",
                 *       "message": "Request body must use application/json."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Unexpected failure; no stack traces or sensitive values. */
        Internal: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "INTERNAL_ERROR",
                 *       "message": "Unexpected failure; no stack traces or sensitive values."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Per-demo-user write rate limit exceeded. No mutation or history entry is applied. Wait Retry-After seconds before retrying. Limits are process-local in the MVP; a known role may still receive 429 before operation authorization when its write bucket is exhausted. */
        TooManyRequests: {
            headers: {
                /** @description Positive integer seconds until the current write window permits a retry. */
                "Retry-After": number;
                [name: string]: unknown;
            };
            content: {
                /**
                 * @example {
                 *       "code": "RATE_LIMITED",
                 *       "message": "Слишком много запросов. Повторите после указанного интервала."
                 *     }
                 */
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    getReferenceData: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReferenceData"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    listComplaints: {
        parameters: {
            query?: {
                /** @description Filter by author's department ID; unknown ID returns an empty list. */
                departmentId?: string;
                /** @description Filter by category ID; unknown ID returns an empty list. */
                categoryId?: string;
                /** @description Exact status; unknown value is 422. */
                status?: components["schemas"]["Status"];
                /** @description Exact type. */
                type?: components["schemas"]["ComplaintType"];
                /** @description Deadline greater than or equal to this timestamp. */
                dueAfter?: string;
                /** @description Deadline less than or equal to this timestamp. */
                dueBefore?: string;
                /** @description true selects overdue; false selects non-overdue. Omitted means both. */
                overdue?: boolean;
                /** @description Filter routing queue; assignment state is independent of status. */
                queue?: "assigned" | "unassigned";
                /** @description Trimmed case-insensitive search words separated by whitespace, AND across words in number, description, proposedSolution and comments.text. Normalize ё and е to the same letter. Blank-only or more than 200 characters returns 422. Authorization, other filters and stable date/id ordering still apply. */
                q?: string;
                /** @description Page size. */
                limit?: number;
                /** @description Number of matching records to skip. */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComplaintList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    createComplaint: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional. simulator marks the request as made by the background demo simulator: the complaint and the history events it creates get simulated=true. Honored only when DEMO_SIMULATION_ENABLED=true, otherwise ignored. Grants no extra rights; roles, validation and rate limits are unchanged. */
                "X-Demo-Source"?: "simulator";
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "type": "problem",
                 *       "categoryId": "cross_department",
                 *       "description": "В заявках не хватает назначения изделия и параметров.",
                 *       "proposedSolution": "Добавить обязательные поля в форму заявки.",
                 *       "attachments": [
                 *         {
                 *           "name": "sample-request.txt",
                 *           "mediaType": "text/plain",
                 *           "sizeBytes": 120,
                 *           "isPlaceholder": true
                 *         }
                 *       ]
                 *     }
                 */
                "application/json": components["schemas"]["CreateComplaint"];
            };
        };
        responses: {
            /** @description Created and persisted atomically. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            413: components["responses"]["TooLarge"];
            415: components["responses"]["Unsupported"];
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    getComplaint: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    assignComplaint: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional. simulator marks the request as made by the background demo simulator: the complaint and the history events it creates get simulated=true. Honored only when DEMO_SIMULATION_ENABLED=true, otherwise ignored. Grants no extra rights; roles, validation and rate limits are unchanged. */
                "X-Demo-Source"?: "simulator";
            };
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AssignmentInput"];
            };
        };
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            415: components["responses"]["Unsupported"];
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    changeComplaintStatus: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional. simulator marks the request as made by the background demo simulator: the complaint and the history events it creates get simulated=true. Honored only when DEMO_SIMULATION_ENABLED=true, otherwise ignored. Grants no extra rights; roles, validation and rate limits are unchanged. */
                "X-Demo-Source"?: "simulator";
            };
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StatusInput"];
            };
        };
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            415: components["responses"]["Unsupported"];
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    addComment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional. simulator marks the request as made by the background demo simulator: the complaint and the history events it creates get simulated=true. Honored only when DEMO_SIMULATION_ENABLED=true, otherwise ignored. Grants no extra rights; roles, validation and rate limits are unchanged. */
                "X-Demo-Source"?: "simulator";
            };
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommentInput"];
            };
        };
        responses: {
            /** @description Created and persisted atomically. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            415: components["responses"]["Unsupported"];
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    recordDecision: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional. simulator marks the request as made by the background demo simulator: the complaint and the history events it creates get simulated=true. Honored only when DEMO_SIMULATION_ENABLED=true, otherwise ignored. Grants no extra rights; roles, validation and rate limits are unchanged. */
                "X-Demo-Source"?: "simulator";
            };
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DecisionInput"];
            };
        };
        responses: {
            /** @description Created and persisted atomically. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["TooLarge"];
            415: components["responses"]["Unsupported"];
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    getSummary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Summary"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    undoLastAction: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional. simulator marks the request as made by the background demo simulator: the complaint and the history events it creates get simulated=true. Honored only when DEMO_SIMULATION_ENABLED=true, otherwise ignored. Grants no extra rights; roles, validation and rate limits are unchanged. */
                "X-Demo-Source"?: "simulator";
            };
            path: {
                /** @description Opaque complaint ID (not its displayed registration number). */
                complaintId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Complaint"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            /** @description UNDO_EXPIRED when the eligible action is outside its own window; NOTHING_TO_UNDO for unsupported action, different actor, empty stack or terminal complaint. No partial write. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    listNotifications: {
        parameters: {
            query?: {
                /** @description Exclusive event timestamp lower bound (ISO 8601); invalid values return 422. A future timestamp yields an empty feed, not an error. */
                since?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotificationList"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    findSimilarComplaints: {
        parameters: {
            query: {
                /** @description Text to compare; trimmed length <10 returns an empty list. Omitted or oversized input returns 422. */
                text: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SimilarComplaints"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    suggestCategory: {
        parameters: {
            query: {
                /** @description Text for an offline demo suggestion; omitted or more than 5000 characters returns 422. Trimmed length <10 returns category=null and source=none. */
                text: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategorySuggestion"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    exportComplaints: {
        parameters: {
            query?: {
                /** @description Filter by author's department ID; unknown ID returns an empty list. */
                departmentId?: string;
                /** @description Filter by category ID; unknown ID returns an empty list. */
                categoryId?: string;
                /** @description Exact status; unknown value is 422. */
                status?: components["schemas"]["Status"];
                /** @description Exact type. */
                type?: components["schemas"]["ComplaintType"];
                /** @description Deadline greater than or equal to this timestamp. */
                dueAfter?: string;
                /** @description Deadline less than or equal to this timestamp. */
                dueBefore?: string;
                /** @description true selects overdue; false selects non-overdue. Omitted means both. */
                overdue?: boolean;
                /** @description Filter routing queue; assignment state is independent of status. */
                queue?: "assigned" | "unassigned";
                /** @description Trimmed case-insensitive search words separated by whitespace, AND across words in number, description, proposedSolution and comments.text. Normalize ё and е to the same letter. Blank-only or more than 200 characters returns 422. Authorization, other filters and stable date/id ordering still apply. */
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description UTF-8 CSV with BOM and eleven columns, including an empty data set header. */
            200: {
                headers: {
                    /**
                     * @description Attachment filename for the export.
                     * @example attachment; filename="obrasheniya-2026-11-10.csv"
                     */
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    /** @example номер,тип,категория,подразделение,статус,ответственный,создано,срок,просрочено,первый ответ,итог */
                    "text/csv": string;
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    resetDemo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DemoResetResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            /** @description Reset disabled by DEMO_RESET_ENABLED=false; authorized admins receive a safe unavailable-feature response. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    /**
                     * @example {
                     *       "code": "NOT_FOUND",
                     *       "message": "Сброс демо недоступен в этой среде."
                     *     }
                     */
                    "application/json": components["schemas"]["Error"];
                };
            };
            422: components["responses"]["Validation"];
            429: components["responses"]["TooManyRequests"];
            500: components["responses"]["Internal"];
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            500: components["responses"]["Internal"];
        };
    };
    getSummaryDigest: {
        parameters: {
            query?: {
                /** @description Inclusive start. Default is to minus seven days. */
                from?: string;
                /** @description Exclusive end. Default is the snapshot time; cached snapshots may be up to 60 seconds old. */
                to?: string;
                /** @description Optional author department ID (not its label). Applies to every block before aggregation; unknown valid ID yields the documented empty result. Does not expose individual authors. */
                department?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful aggregate snapshot, including an empty result. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SummaryDigest"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
    getAnalyticsTrends: {
        parameters: {
            query?: {
                /** @description Optional author department ID (not its label). Applies to every block before aggregation; unknown valid ID yields the documented empty result. Does not expose individual authors. */
                department?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful aggregate snapshot, including an empty result. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsTrends"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            422: components["responses"]["Validation"];
            500: components["responses"]["Internal"];
        };
    };
}

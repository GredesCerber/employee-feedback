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
         * @description Employees see only their own complaints. Managers and admins see all synthetic complaints, including unassigned across departments. Apply access restriction before all filters, totals and pagination. Combine filters with AND; inclusive dueAfter/dueBefore bounds, UTC comparison. Inverted dates return 422. q is a case-insensitive literal substring of number, description or proposedSolution (not regex/SQL). Stable order createdAt descending then id ascending. Empty results return 200 with items=[].
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
            author: components["schemas"]["User"];
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
        /** @description Append-only timeline. actor=null means automatic routing by the system; every user action records the resolved user. Ordered by createdAt ascending then id ascending; timestamps are server generated UTC. */
        HistoryEvent: {
            id: string;
            /** @enum {string} */
            kind: "created" | "assigned" | "status_changed" | "commented" | "decided";
            actor: components["schemas"]["User"] | null;
            /** Format: date-time */
            createdAt: string;
            fromStatus: components["schemas"]["Status"] | null;
            toStatus: components["schemas"]["Status"] | null;
            /** @description Readable event text, without private/internal notes */
            text: string;
        };
        Complaint: {
            id: string;
            /** @description Unique human-readable registration number; synthetic seed uses A-001..A-020. */
            number: string;
            type: components["schemas"]["ComplaintType"];
            categoryId: string;
            departmentId: string;
            author: components["schemas"]["User"];
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
        };
        Error: {
            /** @enum {string} */
            code: "BAD_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_TRANSITION" | "VALIDATION_ERROR" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "INTERNAL_ERROR";
            /** @description Safe human-readable explanation without stack traces or secrets */
            message: string;
            details?: {
                /** @description Invalid field or query parameter */
                field: string;
                /** @description Reason */
                message: string;
            }[];
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
                /** @description Literal case-insensitive search. */
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
            header?: never;
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
            header?: never;
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
            500: components["responses"]["Internal"];
        };
    };
    changeComplaintStatus: {
        parameters: {
            query?: never;
            header?: never;
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
            500: components["responses"]["Internal"];
        };
    };
    addComment: {
        parameters: {
            query?: never;
            header?: never;
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
            500: components["responses"]["Internal"];
        };
    };
    recordDecision: {
        parameters: {
            query?: never;
            header?: never;
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
}

// Central permission matrix for the task tracker.
//
// Roles: ADMIN | PM | DEVELOPER | QA | QA_AUTO
//
// | Action                     | ADMIN | PM | DEVELOPER | QA | QA_AUTO |
// |----------------------------|:-----:|:--:|:---------:|:--:|:-------:|
// | View projects / tasks      |   ✓   | ✓  |     ✓     | ✓  |    ✓    |
// | Create / update tasks      |   ✓   | ✓  |     ✓     | ✓  |    ✓    |
// | Manage projects (create)   |   ✓   | ✓  |     —     | —  |    —    |
// | Delete tasks               |   ✓   | ✓  |     —     | —  |    —    |
//
// Viewing, creating and updating tasks is open to any authenticated team
// member. Organisational/destructive actions (creating projects, deleting
// tasks) are restricted to ADMIN and PM.

export const ALL_ROLES = ['ADMIN', 'PM', 'DEVELOPER', 'QA', 'QA_AUTO'] as const

/** Roles allowed to create/manage projects. */
export const CAN_MANAGE_PROJECTS = ['ADMIN', 'PM'] as const

/** Roles allowed to delete tasks (destructive). */
export const CAN_DELETE_TASKS = ['ADMIN', 'PM'] as const

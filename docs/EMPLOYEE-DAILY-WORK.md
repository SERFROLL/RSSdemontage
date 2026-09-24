# Employee functions and daily tasks

Functions belong to an employee and an area (PID, or no PID for stripping).
A logical warehouse resolves from its responsible employee and optional PID.
There must be one such warehouse per pair. A warehouse's legacy kind remains
for historical compatibility, but is not an input to new daily assignments.

`duties` stores employee, PID, functions and enabled state. Cable selection is
not a function assignment: PID cables are configured once on the PID; stripping
uses the cables available on the master's warehouse. At 09:00 the scheduler
creates one `dailyTasks` record per date and warehouse, freezing the responsible
employee, functions, allowed PID cables and reporting delegates. Changing a
duty affects only tasks created afterwards. Days with no duties are also marked
as scheduled, so enabling a duty later that day cannot create a retroactive task.

The personal inbox uses the authenticated employee, independently of admin
rights. Admins have a separate all-tasks view with employee, PID, function and
state filters. Delegates work on the same task and do not receive another copy
or another disciplinary obligation. Material responsibility stays with the MOL.
Actual document authors always use the authenticated employee ID.

Daily submission is atomic. Only assigned functions may be entered; each
function must have a result or an explained zero. Multiple actual cable lines
are permitted. Stripping uses a single shift crew and KTU allocation; the fund
is the sum of the cable quantities multiplied by their approved tariffs.
Accounting work rows remain separate document records per function/material
under the shared daily task, supporting the existing balance drilldowns.
Creating a task itself never creates material movements.

The WEB document editor can correct a complete daily report. It checks the
versions loaded when the editor was opened, retains old versions and zeroes
superseded lines through a new explained version rather than deleting them.
Existing frozen conversion coefficients, tariffs and norms remain in document
history. Server ledger posting reversals preserve the audit trail.

The one-time scheduling migration runs under the accounting transaction lock.
It groups legacy task rows, keeps all existing documents and task IDs, snapshots
the pre-migration state in `operational_backups`, and compares the complete
document and posting sets before writing. Any accounting difference or ambiguous
responsibility aborts the transaction. Historical restored work stays excluded
from reporting-discipline statistics. `dailyVersion: 1` marks completion;
repeated startup and concurrent requests do not repeat the migration.

Legacy `assignments` and task rows remain as historical compatibility data;
the production scheduler and settings no longer use them as the active matrix.
Only the server may create daily tasks or work-row task records. The database
state revision, request idempotency key and transaction lock protect simultaneous
submissions by the owner and delegate.

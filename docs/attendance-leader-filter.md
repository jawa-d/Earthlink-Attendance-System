# Attendance leader filtering

The attendance list and Excel/PDF exports share `getAttendanceList`.
`teamLeaderId` is optional, UUID validated, and combined with all other filters.
The existing `teamLeader` parameter remains supported for compatibility.

Leader and department attribution use EmployeeAssignment intervals:
`effectiveFrom <= attendanceDate < effectiveTo` (null end means open ended).
Reassignments already become effective on the next Baghdad calendar day.
Historical names come from assignment snapshots, including inactive leaders.
No schema change or migration is required.

Records preceding confirmed assignment history remain visible under all leaders
and display “غير معروف تاريخياً”. They do not match a specific leader or
“بدون ليدر”; current assignments are never used as historical evidence.
Synthetic UNREGISTERED rows require a confirmed ACTIVE assignment on that day.
Department filters also use the historical department so transfers remain accurate.

Actual events use a shared Prisma predicate for database count and pagination,
within a repeatable-read transaction. Date-correlated relation clauses are bounded
by the existing 366-day range limit. Exports omit pagination and preserve each event.
The existing authenticated read authorization and deleted-record visibility are
unchanged. No production data is changed.

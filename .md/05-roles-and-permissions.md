# 05 · Roles and permissions

The role comes from the person's **active profile** (Admin sets it on Logins). A switched-off login loses every
power immediately. An `operator` account is treated as a **Supervisor** everywhere.

## Screens per role

| Role | App | Screens (menu) |
|---|---|---|
| Admin | Web | Home · Batches · Tickets · People · Logins · More (Today checks, Monthly schedule, Process steps, Reference data) · batch page with the failsafe panel |
| Supervisor | APK (web also works) | My Work → task screen |
| Lab technician | APK | Lab queue → Lab check |
| GM | APK and web | Progress · Approvals · People · Batches (web) · batch page |
| Manager | Web | Batches · Progress · People (read-only) |

## What each role can and cannot do

| Action | Admin | Supervisor | Lab | GM | Manager |
|---|---|---|---|---|---|
| Create / onboard / cancel a batch, mark DEMO | ✅ | ❌ | ❌ | cancel only | ❌ |
| Start / finish field tasks, take field photos | ❌ | ✅ | ❌ | ❌ | ❌ |
| Lab samples, readings, Lab photos | ❌ | ❌ | ✅ | ❌ | ❌ |
| Enter initial material data (pre-H0) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Raise a late ticket | ❌ | own tasks | own checks | ❌ | ❌ |
| Decide a late ticket | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve a Lab submission | ❌ | ❌ | never own | ✅ | ❌ |
| Accept a deviation / verify corrective action | ❌ | ❌ | ❌ | ✅ | ❌ |
| Hold / release / send back a field task | ❌ | ✅ (limited) | ❌ | ❌ | ❌ |
| Correct a recorded time | ✅ (reason) | ❌ | ❌ | ❌ | ❌ |
| Failsafe: open / mark done / reopen a task | ✅ (reason) | ❌ | ❌ | ❌ | ❌ |
| Create logins, set passwords, change roles, switch off | ✅ | ❌ | ❌ | ❌ | ❌ |
| See People monitoring and the overrides log | ✅ | ❌ | ❌ | ✅ | ✅ |
| Read the audit trail | ✅ | ❌ | ❌ | ✅ | ✅ |
| Publish / switch process version | ✅ | ❌ | ❌ | ✅ | ❌ |

Limits on hold / release / send back (Supervisor): hold only open field work; release only a supervisor hold
(the task returns to its work, never straight to done); send back only field work under way or finished.

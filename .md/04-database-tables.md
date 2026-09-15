# 04 · Database: tables, views and server functions

Supabase Postgres, schema `public`, project `szwosmyqwvpaqugjtzcp`. The app has **no direct write access to any
table**: every change goes through a SECURITY DEFINER server function that checks the caller's role. Reads are
controlled by row-level security. Photos are files in the Storage bucket `evidence`.

Row counts are approximate, 15 Sep 2026.

## 1 · Process definition (the SOP as data)

| Table | Holds |
|---|---|
| `process_definition` (9) | One row per process version (2026B … 2026J); status draft/published; frozen once published |
| `process_catalogue` (1) | Which version is current for new batches |
| `process_activity` (869) | The tasks of each version: code, name, stream, role, durations, day-plan hours, hold flag, stage, instructions |
| `activity_field` (567) | Readings and checklist items per task (label, unit, SOP value/range, choice options) |
| `evidence_requirement` (1178) | Photos per task (before / after / sample…), count and capture phase (`after_start`, `after_duration`, `any`) |
| `gate_rule` (1409) | Rules per task: entry (PREDECESSOR, rests, "when started", LAB_APPROVED) and exit (EVIDENCE_COMPLETE, MIN_DURATION time gate with temperature trigger) |
| `activity_variant` (4), `process_day` (35) | Water/dry pass variants; day labels |
| `lab_checkpoint` (70), `lab_checkpoint_activity` (293), `lab_checkpoint_conflict` (166) | Lab checkpoints, which task each belongs to, which production step it gates |
| `lab_parameter` (15), `lab_method` (9), `lab_spec` (37), `lab_setting` (2), `lab_instrument` (0) | What the Lab measures, value kinds, spec bands |
| `lab_approval_reading` (2) | Who approves Lab submissions (answered: GM) |
| `conflict_register` (112) | Every SOP question/conflict, with its status and the factory's answer |
| `material` (11), `material_spec` (33), `material_role_eligibility` (14) | Raw materials and which can fill which role |
| `location` (26), `machine` (11), `vessel_scope_map` (7), `movement_rule` (11), `movement_template` (5), `resource_policy` (4), `resource_requirement` (26), `phase2_control_band` (15) | Plant reference data |
| `factory_clock` (1) | Factory timezone (Asia/Kolkata) and H0 hour |
| `extension_policy` (1) | Late-ticket rules: who may raise, Admin decides, **grace 30 min** |

## 2 · Batches and work

| Table | Holds |
|---|---|
| `master_batch` (15) | A batch: code, label, status (draft / active / cancelled), process version, H0, **is_demo** |
| `batch_material_role` (62) | Which material fills each role in a batch |
| `batch_activity` (1776) | Every task of every batch: state, planned start/end, actual start/end, who started / submitted, before-tracking / onboarded position |
| `batch_activity_value` (777) | Readings and checklist values recorded for a task |
| `batch_activity_evidence_req` (2460) | A batch's photo requirements and how many are satisfied |
| `evidence_media` (17) | Each bound photo: storage path, uploader, time, superseded |
| `actual_correction` (0) | Every change to a recorded time, with the original kept |
| `deviation` (0), `corrective_action` (0) | Out-of-range values and their resolution (GM decides) |
| `extension_request` (3), `extension_request_media` (3) | Late tickets: hours asked / granted, reason, photos, Admin decision |
| `lab_sample` (15), `lab_test` (45), `lab_result` (36), `lab_decision` (2) | Lab work and the GM's decisions |
| `checkpoint_decision` (0), `management_checkpoint` (0) | Management checkpoints |
| `batch_movement` (3), `batch_vessel_allocation` (0), `location_occupancy` (0), `machine_usage` (0), `individual_batch` (0), `batch_process_config` (0) | Movements, vessels, machines |
| `monthly_schedule_import` (0), `monthly_schedule_group` (0) | Monthly schedule import |
| `notification` (218) | Messages to roles/people (tickets, returns, assignments) |
| `audit_event` (326k) | **Every action**: who, role, what, when, before/after, reason |
| `profiles` (6) | Staff: name, role, shift, active |
| `dev_effective_clock`, `dev_environment_marker` | Development clock (not used by any rule) |

## 3 · Views (read models the screens use)

| View | Used for |
|---|---|
| `v_my_work` | Supervisor and Lab task lists (own role's work on active batches) |
| `v_lab_queue`, `v_lab_gate`, `v_lab_result_current`, `v_lab_result_history`, `v_lab_checkpoint_map` | Lab screens |
| `v_lab_approval_queue`, `v_lab_approval_question` | GM approvals |
| `v_evidence_state` | Photos per requirement per task |
| `v_batch_monitor`, `v_batch_timeline` | Admin/GM batch cards and the batch timeline (steps, who, readings, photos, tickets) |
| `v_activity_schedule` | Planned / extended / due / actual and variance per task (late tickets) |
| `v_extension_request` | Tickets screen |
| `v_person_activity` | GM People: per person today (Admin/GM/Manager only) |
| `v_override_log` | Overrides and decisions (Admin/GM/Manager only) |
| `v_process_catalogue`, `v_process_standard`, `v_process_envelope*`, `v_process_confidence`, `v_gate_rest_rule`, `v_sop_limit_mapping` | Process explorer and process picker |
| `v_batch_forecast`, `v_batch_slip`, `v_batch_variance`, `v_stream_variance`, `v_variance_contributor`, `v_activity_forecast`, `v_activity_timing`, `v_activity_expectation`, `v_actual_history`, `v_batch_event`, `v_task_sheet` | Forecast, variance and history |
| `v_batch_movement`, `v_batch_vessel`, `v_batch_vessel_slot`, `v_vessel_availability`, `v_machine_utilisation`, `v_plant_now`, `v_live_batch` | Plant and vessels |
| `v_checkpoint_status`, `v_deviation_open`, `v_prebatch_material_check` | Checkpoints, deviations, initial material |
| `v_unguarded_writer` | Audit helper: callable functions that name no role |

## 4 · Key server functions

| Area | Functions |
|---|---|
| Batches (Admin) | `create_master_batch`, `generate_activity_plan`, `activate_batch`, `onboard_batch`, `mark_batch_demo`, `cancel_batch`, `set_batch_start_at` |
| Field work (Supervisor) | `start_activity`, `complete_activity` / `submit_activity`, `bind_evidence`, `hold_activity`, `release_activity`, `return_activity` |
| Lab | `open_lab_sample`, `request_lab_test`, `record_lab_result`, `order_retest`, `open_prebatch_sample` |
| GM | `decide_lab_submission`, `accept_with_deviation`, `gm_decide_override`, `verify_corrective_action` |
| Late tickets | `request_extension`, `attach_extension_photo`, `cancel_extension`, `admin_decide_extension` |
| Rules engine | `evaluate_gates`, `advance_batch`, `time_gate_status`, `activity_due`, `late_block_reason`, `batch_clock_waived`, `assert_role`, `assert_may_execute`, `current_app_role` |
| Logins (Admin) | `admin_list_users`, `admin_create_user`, `admin_set_password`, `admin_set_user_role`, `admin_set_user_active` |
| Failsafe (Admin) | `admin_force_open`, `admin_mark_done`, `admin_reopen_task`, `correct_actual` |
| Process (Admin/GM) | `publish_process_definition`, `set_current_process` |

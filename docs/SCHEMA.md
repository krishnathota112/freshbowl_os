# Schema — generated from the deployed database

**Generated 2026-09-11 by `scripts/schema-snapshot.mjs`. Do not edit by hand.**

> **Read this before writing any migration, any table name, or any RPC signature.**
> Migration files describe intent. This file describes what is actually deployed.
> A table name that appears here is TAKEN. Check before you specify a new one.

59 tables · 38 views · 302 functions

## Name index — every relation in `public`

| name | kind | RLS |
|---|---|---|
| `activity_field` | table | on |
| `activity_variant` | table | on |
| `actual_correction` | table | on |
| `audit_event` | table | on |
| `batch_activity` | table | on |
| `batch_activity_evidence_req` | table | on |
| `batch_activity_value` | table | on |
| `batch_material_role` | table | on |
| `batch_movement` | table | on |
| `batch_process_config` | table | on |
| `batch_vessel_allocation` | table | on |
| `checkpoint_decision` | table | on |
| `conflict_register` | table | on |
| `corrective_action` | table | on |
| `dev_effective_clock` | table | on |
| `dev_environment_marker` | table | on |
| `deviation` | table | on |
| `evidence_media` | table | on |
| `evidence_requirement` | table | on |
| `extension_policy` | table | on |
| `extension_request` | table | on |
| `factory_clock` | table | on |
| `gate_rule` | table | on |
| `individual_batch` | table | on |
| `lab_approval_reading` | table | on |
| `lab_checkpoint` | table | on |
| `lab_checkpoint_activity` | table | on |
| `lab_checkpoint_conflict` | table | on |
| `lab_decision` | table | on |
| `lab_instrument` | table | on |
| `lab_method` | table | on |
| `lab_result` | table | on |
| `lab_sample` | table | on |
| `lab_setting` | table | on |
| `lab_spec` | table | on |
| `lab_test` | table | on |
| `location` | table | on |
| `location_occupancy` | table | on |
| `machine` | table | on |
| `machine_usage` | table | on |
| `management_checkpoint` | table | on |
| `master_batch` | table | on |
| `material` | table | on |
| `material_role_eligibility` | table | on |
| `material_spec` | table | on |
| `monthly_schedule_group` | table | on |
| `monthly_schedule_import` | table | on |
| `movement_rule` | table | on |
| `movement_template` | table | on |
| `notification` | table | on |
| `phase2_control_band` | table | on |
| `process_activity` | table | on |
| `process_catalogue` | table | on |
| `process_day` | table | on |
| `process_definition` | table | on |
| `profiles` | table | on |
| `resource_policy` | table | on |
| `resource_requirement` | table | on |
| `vessel_scope_map` | table | on |
| `v_activity_expectation` | view | — |
| `v_activity_forecast` | view | — |
| `v_activity_timing` | view | — |
| `v_actual_history` | view | — |
| `v_batch_event` | view | — |
| `v_batch_forecast` | view | — |
| `v_batch_movement` | view | — |
| `v_batch_slip` | view | — |
| `v_batch_variance` | view | — |
| `v_batch_vessel` | view | — |
| `v_batch_vessel_slot` | view | — |
| `v_checkpoint_status` | view | — |
| `v_deviation_open` | view | — |
| `v_evidence_state` | view | — |
| `v_extension_request` | view | — |
| `v_gate_rest_rule` | view | — |
| `v_lab_approval_question` | view | — |
| `v_lab_approval_queue` | view | — |
| `v_lab_checkpoint_map` | view | — |
| `v_lab_gate` | view | — |
| `v_lab_queue` | view | — |
| `v_lab_result_current` | view | — |
| `v_lab_result_history` | view | — |
| `v_live_batch` | view | — |
| `v_machine_utilisation` | view | — |
| `v_my_work` | view | — |
| `v_plant_now` | view | — |
| `v_prebatch_material_check` | view | — |
| `v_process_catalogue` | view | — |
| `v_process_confidence` | view | — |
| `v_process_envelope` | view | — |
| `v_process_envelope_reconciliation` | view | — |
| `v_process_standard` | view | — |
| `v_sop_limit_mapping` | view | — |
| `v_stream_variance` | view | — |
| `v_unguarded_writer` | view | — |
| `v_variance_contributor` | view | — |
| `v_vessel_availability` | view | — |

## Function index — every callable in `public`

| function | definer | owner | granted to |
|---|---|---|---|
| `_pa(p_code text)` | invoker | postgres | authenticated |
| `accept_lab_result(p_result uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `accept_with_deviation(p_deviation uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `activate_batch(p_batch_id uuid)` | **DEFINER** | postgres | authenticated |
| `add_corrective_action(p_deviation uuid, p_description text)` | **DEFINER** | postgres | authenticated |
| `advance_batch(p_batch uuid)` | **DEFINER** | postgres | — |
| `allocate_vessel(p_batch uuid, p_scope text, p_instance_no integer, p_location uuid, p_note text)` | **DEFINER** | postgres | authenticated |
| `assert_dev_clock_writer()` | **DEFINER** | postgres | authenticated |
| `assert_may_execute(p_activity uuid, p_action text)` | **DEFINER** | postgres | authenticated |
| `assert_role(p_allowed app_role[], p_action text)` | invoker | postgres | authenticated |
| `assign_activity(p_activity uuid, p_person uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `bind_evidence(p_activity uuid, p_requirement_key text, p_storage_path text, p_media_kind text, p_supersedes uuid, p_supersede_reason text)` | **DEFINER** | postgres | authenticated |
| `can_capture_for_activity(p_activity uuid)` | **DEFINER** | postgres | authenticated |
| `cancel_batch(p_batch uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `cancel_extension(p_request uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `cancel_monthly_schedule_group(p_group uuid)` | **DEFINER** | postgres | authenticated |
| `cash_dist(money, money)` | invoker | supabase_admin | anon, authenticated |
| `checkpoint_package(p_batch uuid, p_checkpoint integer)` | **DEFINER** | postgres | authenticated |
| `claim_monthly_schedule_group(p_schedule_group uuid, p_master_batch uuid)` | **DEFINER** | postgres | authenticated |
| `clear_planned_time(p_activity uuid)` | **DEFINER** | postgres | authenticated |
| `close_machine_stint(p_activity uuid, p_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `complete_activity(p_activity uuid, p_values jsonb, p_remarks text)` | **DEFINER** | postgres | authenticated |
| `correct_actual(p_activity uuid, p_field text, p_value timestamp with time zone, p_reason text)` | **DEFINER** | postgres | authenticated |
| `create_master_batch(p_code text, p_label text, p_start_date date, p_config jsonb, p_roles jsonb, p_supervisor text, p_weather text, p_start_at timestamp with time zone, p_process_definition_id uuid)` | **DEFINER** | postgres | authenticated |
| `current_app_role()` | invoker | postgres | authenticated |
| `current_process_definition()` | **DEFINER** | postgres | authenticated |
| `custom_access_token_hook(event jsonb)` | invoker | postgres | — |
| `date_dist(date, date)` | invoker | supabase_admin | anon, authenticated |
| `decide_lab_submission(p_activity uuid, p_verdict text, p_reason text)` | **DEFINER** | postgres | authenticated |
| `demo_day0_config()` | invoker | postgres | authenticated |
| `dev_environment_enabled()` | **DEFINER** | postgres | authenticated |
| `enabled_policy(p_question text)` | invoker | postgres | authenticated |
| `escalate_deviation(p_deviation uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `evaluate_cardinality(p_rule jsonb, p_config jsonb)` | invoker | postgres | authenticated |
| `evaluate_cardinality_v1(p_rule jsonb, p_config jsonb)` | invoker | postgres | authenticated |
| `evaluate_gates(p_activity uuid, p_phase text)` | **DEFINER** | postgres | authenticated |
| `evidence_path_is_consistent(p_batch text, p_activity text)` | **DEFINER** | postgres | authenticated |
| `expire_extensions()` | **DEFINER** | postgres | authenticated |
| `extension_is_effective(p_status extension_status)` | invoker | postgres | authenticated |
| `factory_h0_instant(p_start_date date)` | invoker | postgres | authenticated |
| `factory_instant(p_date date, p_time time without time zone)` | invoker | postgres | authenticated |
| `float4_dist(real, real)` | invoker | supabase_admin | anon, authenticated |
| `float8_dist(double precision, double precision)` | invoker | supabase_admin | anon, authenticated |
| `fn_activation_is_one_way()` | invoker | postgres | authenticated |
| `fn_actual_is_append_only()` | **DEFINER** | postgres | authenticated |
| `fn_audit()` | **DEFINER** | postgres | authenticated |
| `fn_audit_is_append_only()` | invoker | postgres | authenticated |
| `fn_audit_plan_generated()` | **DEFINER** | postgres | authenticated |
| `fn_checkpoint_decision_is_append_only()` | invoker | postgres | authenticated |
| `fn_correction_is_append_only()` | invoker | postgres | authenticated |
| `fn_definition_is_frozen()` | invoker | postgres | authenticated |
| `fn_extension_is_append_only()` | invoker | postgres | authenticated |
| `fn_factory_clock_validate()` | invoker | postgres | authenticated |
| `fn_gate_rule_protection()` | **DEFINER** | postgres | authenticated |
| `fn_inherit_activity_routing()` | **DEFINER** | postgres | authenticated |
| `fn_inherit_hold()` | invoker | postgres | authenticated |
| `fn_make_extension_effective(p_request uuid, p_hours numeric)` | **DEFINER** | postgres | — |
| `fn_new_table_is_read_only()` | invoker | postgres | authenticated |
| `fn_new_view_is_not_public()` | invoker | postgres | authenticated |
| `fn_plan_is_frozen()` | invoker | postgres | authenticated |
| `fn_recount_checkpoint_state()` | **DEFINER** | postgres | authenticated |
| `fn_recount_evidence()` | **DEFINER** | postgres | authenticated |
| `fn_replan_hours()` | **DEFINER** | postgres | authenticated |
| `fn_revoke_public_execute()` | invoker | postgres | authenticated |
| `fn_sync_role_claim()` | **DEFINER** | postgres | authenticated |
| `fn_track_occupancy()` | **DEFINER** | postgres | authenticated |
| `gate_predecessor_status(p_batch uuid, p_instance_no integer, p_codes jsonb, p_binding text)` | invoker | postgres | authenticated |
| `gate_rule_is_protected(p_activity_code text, p_kind text, p_config jsonb)` | invoker | postgres | authenticated |
| `gbt_bit_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bit_consistent(internal, bit, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bit_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bit_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bit_same(gbtreekey_var, gbtreekey_var, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bit_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_consistent(internal, boolean, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_same(gbtreekey2, gbtreekey2, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bool_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bpchar_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bpchar_consistent(internal, character, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bytea_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bytea_consistent(internal, bytea, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bytea_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bytea_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bytea_same(gbtreekey_var, gbtreekey_var, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_bytea_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_consistent(internal, money, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_distance(internal, money, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_cash_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_consistent(internal, date, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_distance(internal, date, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_same(gbtreekey8, gbtreekey8, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_date_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_decompress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_consistent(internal, anyenum, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_same(gbtreekey8, gbtreekey8, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_enum_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_consistent(internal, real, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_distance(internal, real, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_same(gbtreekey8, gbtreekey8, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float4_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_consistent(internal, double precision, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_distance(internal, double precision, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_float8_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_inet_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_inet_consistent(internal, inet, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_inet_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_inet_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_inet_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_inet_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_consistent(internal, smallint, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_distance(internal, smallint, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_same(gbtreekey4, gbtreekey4, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int2_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_consistent(internal, integer, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_distance(internal, integer, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_same(gbtreekey8, gbtreekey8, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int4_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_consistent(internal, bigint, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_distance(internal, bigint, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_int8_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_consistent(internal, interval, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_decompress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_distance(internal, interval, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_same(gbtreekey32, gbtreekey32, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_intv_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_consistent(internal, macaddr8, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad8_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_consistent(internal, macaddr, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_macad_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_numeric_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_numeric_consistent(internal, numeric, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_numeric_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_numeric_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_numeric_same(gbtreekey_var, gbtreekey_var, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_numeric_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_consistent(internal, oid, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_distance(internal, oid, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_same(gbtreekey8, gbtreekey8, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_oid_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_text_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_text_consistent(internal, text, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_text_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_text_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_text_same(gbtreekey_var, gbtreekey_var, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_text_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_consistent(internal, time without time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_distance(internal, time without time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_time_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_timetz_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_timetz_consistent(internal, time with time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_consistent(internal, timestamp without time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_distance(internal, timestamp without time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_same(gbtreekey16, gbtreekey16, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_ts_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_tstz_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_tstz_consistent(internal, timestamp with time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_tstz_distance(internal, timestamp with time zone, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_compress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_consistent(internal, uuid, smallint, oid, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_penalty(internal, internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_picksplit(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_same(gbtreekey32, gbtreekey32, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_uuid_union(internal, internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_var_decompress(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbt_var_fetch(internal)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey16_in(cstring)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey16_out(gbtreekey16)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey2_in(cstring)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey2_out(gbtreekey2)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey32_in(cstring)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey32_out(gbtreekey32)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey4_in(cstring)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey4_out(gbtreekey4)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey8_in(cstring)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey8_out(gbtreekey8)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey_var_in(cstring)` | invoker | supabase_admin | anon, authenticated |
| `gbtreekey_var_out(gbtreekey_var)` | invoker | supabase_admin | anon, authenticated |
| `generate_activity_plan(p_batch_id uuid)` | **DEFINER** | postgres | authenticated |
| `get_effective_now()` | **DEFINER** | postgres | authenticated |
| `gm_decide_extension(p_request uuid, p_approve boolean, p_reason text, p_granted_hr numeric)` | **DEFINER** | postgres | authenticated |
| `gm_decide_override(p_deviation uuid, p_approve boolean, p_reason text)` | **DEFINER** | postgres | authenticated |
| `has_role(VARIADIC roles app_role[])` | invoker | postgres | authenticated |
| `hold_activity(p_activity uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `hour_within_batch_day(p_start_at timestamp with time zone, p_planned time without time zone)` | invoker | postgres | authenticated |
| `import_monthly_schedule(p_schedule_month date, p_source_filename text, p_column_map jsonb, p_rows jsonb)` | **DEFINER** | postgres | authenticated |
| `int2_dist(smallint, smallint)` | invoker | supabase_admin | anon, authenticated |
| `int4_dist(integer, integer)` | invoker | supabase_admin | anon, authenticated |
| `int8_dist(bigint, bigint)` | invoker | supabase_admin | anon, authenticated |
| `interval_dist(interval, interval)` | invoker | supabase_admin | anon, authenticated |
| `manager_decide_extension(p_request uuid, p_approve boolean, p_reason text, p_granted_hr numeric)` | **DEFINER** | postgres | authenticated |
| `oid_dist(oid, oid)` | invoker | supabase_admin | anon, authenticated |
| `open_lab_sample(p_activity uuid, p_checkpoint uuid, p_label text, p_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `open_machine_stint(p_activity uuid, p_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `open_prebatch_sample(p_batch uuid, p_checkpoint uuid, p_label text, p_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `order_retest(p_test uuid, p_reason lab_retest_reason, p_numeric numeric, p_text text, p_instrument uuid, p_invalid_reason text, p_measured_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `pause_dev_clock()` | **DEFINER** | postgres | authenticated |
| `play_dev_clock()` | **DEFINER** | postgres | authenticated |
| `publish_process_definition(p_definition uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `raise_deviation(p_activity uuid, p_summary text, p_kind deviation_kind, p_detail jsonb)` | **DEFINER** | postgres | authenticated |
| `record_checkpoint_decision(p_batch uuid, p_checkpoint integer, p_verdict text, p_reason text)` | **DEFINER** | postgres | authenticated |
| `record_lab_result(p_test uuid, p_numeric numeric, p_text text, p_instrument uuid, p_invalid_reason text, p_raw jsonb, p_measured_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `record_occupancy(p_activity uuid, p_from timestamp with time zone, p_to timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `release_activity(p_activity uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `release_elapsed_rests(p_batch uuid)` | **DEFINER** | postgres | authenticated |
| `release_vessel(p_batch uuid, p_scope text, p_instance_no integer)` | **DEFINER** | postgres | authenticated |
| `render_gate_reason(p_template text, p_vars jsonb)` | invoker | postgres | authenticated |
| `repair_plan_states()` | **DEFINER** | postgres | — |
| `repoint_batch_activities(p_batch uuid)` | **DEFINER** | postgres | — |
| `repoint_one_activity(p_activity uuid)` | **DEFINER** | postgres | — |
| `request_extension(p_activity uuid, p_hours numeric, p_reason text, p_evidence uuid)` | **DEFINER** | postgres | authenticated |
| `request_lab_test(p_sample uuid, p_parameter text, p_via text)` | **DEFINER** | postgres | authenticated |
| `reset_dev_clock_to_live()` | **DEFINER** | postgres | authenticated |
| `resolve_activity_label(p_batch_id uuid, p_template text, p_material_role material_role_code, p_index integer)` | invoker | postgres | authenticated |
| `return_activity(p_activity uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `rls_auto_enable()` | **DEFINER** | postgres | authenticated |
| `safe_uuid(t text)` | invoker | postgres | authenticated |
| `scope_count_field(p_scope activity_scope)` | invoker | postgres | authenticated |
| `scope_noun(p_scope activity_scope)` | invoker | postgres | authenticated |
| `send_alert(p_activity uuid, p_role app_role, p_message text, p_reason text)` | **DEFINER** | postgres | authenticated |
| `set_activity_plan(p_activity uuid, p_patch jsonb)` | **DEFINER** | postgres | authenticated |
| `set_batch_start_at(p_batch uuid, p_start_at timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `set_current_process(p_definition uuid, p_reason text)` | **DEFINER** | postgres | authenticated |
| `set_dev_clock_h(p_batch uuid, p_h integer)` | **DEFINER** | postgres | authenticated |
| `set_factory_timezone(p_timezone text, p_reason text)` | **DEFINER** | postgres | authenticated |
| `set_individual_batches(p_batch uuid, p_numbers text)` | **DEFINER** | postgres | authenticated |
| `set_movement_vessel(p_batch uuid, p_movement text, p_location uuid, p_individual uuid, p_planned_at timestamp with time zone, p_note text)` | **DEFINER** | postgres | authenticated |
| `set_process_envelope(p_definition uuid, p_hours integer, p_confidence process_confidence, p_source_ref text)` | **DEFINER** | postgres | authenticated |
| `start_activity(p_activity uuid)` | **DEFINER** | postgres | authenticated |
| `submit_activity(p_activity uuid, p_values jsonb, p_remarks text, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone)` | **DEFINER** | postgres | authenticated |
| `sync_role_claim(p_user uuid)` | **DEFINER** | postgres | — |
| `time_dist(time without time zone, time without time zone)` | invoker | supabase_admin | anon, authenticated |
| `ts_dist(timestamp without time zone, timestamp without time zone)` | invoker | supabase_admin | anon, authenticated |
| `tstz_dist(timestamp with time zone, timestamp with time zone)` | invoker | supabase_admin | anon, authenticated |
| `validate_batch(p_batch uuid)` | **DEFINER** | postgres | authenticated |
| `verify_corrective_action(p_action uuid, p_note text)` | **DEFINER** | postgres | authenticated |

## Views — write-bypass check

| view | owner | security_invoker |
|---|---|---|
| `v_activity_expectation` | postgres | true |
| `v_activity_forecast` | postgres | true |
| `v_activity_timing` | postgres | true |
| `v_actual_history` | postgres | true |
| `v_batch_event` | postgres | true |
| `v_batch_forecast` | postgres | true |
| `v_batch_movement` | postgres | true |
| `v_batch_slip` | postgres | true |
| `v_batch_variance` | postgres | true |
| `v_batch_vessel` | postgres | true |
| `v_batch_vessel_slot` | postgres | true |
| `v_checkpoint_status` | postgres | true |
| `v_deviation_open` | postgres | true |
| `v_evidence_state` | postgres | true |
| `v_extension_request` | postgres | true |
| `v_gate_rest_rule` | postgres | true |
| `v_lab_approval_question` | postgres | true |
| `v_lab_approval_queue` | postgres | true |
| `v_lab_checkpoint_map` | postgres | true |
| `v_lab_gate` | postgres | true |
| `v_lab_queue` | postgres | true |
| `v_lab_result_current` | postgres | true |
| `v_lab_result_history` | postgres | true |
| `v_live_batch` | postgres | true |
| `v_machine_utilisation` | postgres | true |
| `v_my_work` | postgres | true |
| `v_plant_now` | postgres | true |
| `v_prebatch_material_check` | postgres | true |
| `v_process_catalogue` | postgres | true |
| `v_process_confidence` | postgres | true |
| `v_process_envelope` | postgres | true |
| `v_process_envelope_reconciliation` | postgres | true |
| `v_process_standard` | postgres | true |
| `v_sop_limit_mapping` | postgres | true |
| `v_stream_variance` | postgres | true |
| `v_unguarded_writer` | postgres | true |
| `v_variance_contributor` | postgres | true |
| `v_vessel_availability` | postgres | true |

---

## Detail

### `activity_field` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| process_activity_id | uuid | NO |  |
| key | text | NO |  |
| label | text | NO |  |
| datatype | text | NO |  |
| unit | text | YES |  |
| sop_value | text | YES |  |
| sop_min | numeric | YES |  |
| sop_max | numeric | YES |  |
| sop_source_ref | text | YES |  |
| conflict_id | text | YES |  |
| day0_editable | boolean | NO | true |
| day0_required | boolean | NO | false |
| default_variance | text | YES |  |
| operator_input | text | NO | 'required'::text |
| remarks_default | text | YES |  |
| section | text | YES |  |
| step_no | integer | YES |  |
| display_order | integer | YES |  |

**Constraints**

- `activity_field_operator_input_check` — CHECK ((operator_input = ANY (ARRAY['required'::text, 'optional'::text, 'not_collected'::text])))
- `activity_field_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `activity_field_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `activity_field_pkey` — PRIMARY KEY (id)
- `activity_field_process_activity_id_key_key` — UNIQUE (process_activity_id, key)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`

### `activity_variant` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| process_activity_id | uuid | NO |  |
| code | text | NO |  |
| label | text | NO |  |
| selection_rule | jsonb | YES |  |
| auto_select_enabled | boolean | NO | false |
| requires_reason_on_override | boolean | NO | true |
| conflict_id | text | YES |  |

**Constraints**

- `activity_variant_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `activity_variant_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `activity_variant_pkey` — PRIMARY KEY (id)
- `activity_variant_process_activity_id_code_key` — UNIQUE (process_activity_id, code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `actual_correction` — table
_Every change to an actual that already had a value. The ORIGINAL survives here — this table is what makes "actuals are append-only" true rather than aspirational. Append-only itself. 0049._

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| batch_activity_id | uuid | NO |  |
| master_batch_id | uuid | NO |  |
| field | text | NO |  |
| previous_value | timestamp with time zone | NO |  |
| new_value | timestamp with time zone | NO |  |
| reason | text | NO |  |
| corrected_by | uuid | YES |  |
| corrected_role | USER-DEFINED | YES |  |
| corrected_at | timestamp with time zone | NO | now() |

**Constraints**

- `actual_correction_field_check` — CHECK ((field = ANY (ARRAY['actual_start'::text, 'actual_end'::text])))
- `actual_correction_reason_check` — CHECK ((length(TRIM(BOTH FROM reason)) >= 10))
- `actual_correction_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `actual_correction_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `actual_correction_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `actual_correction_read` SELECT to {authenticated} — using `true` check `—`

**Triggers**

- `trg_correction_is_append_only`

### `audit_event` — table

| column | type | null | default |
|---|---|---|---|
| id | bigint | NO | nextval('audit_event_id_seq'::regclass) |
| occurred_at | timestamp with time zone | NO | now() |
| actor_id | uuid | YES |  |
| actor_role | USER-DEFINED | YES |  |
| action | text | NO |  |
| entity_table | text | NO |  |
| entity_id | text | NO |  |
| before_state | jsonb | YES |  |
| after_state | jsonb | YES |  |
| reason | text | YES |  |
| request_id | text | YES |  |

**Constraints**

- `audit_event_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `audit_read` SELECT to {authenticated} — using `has_role(VARIADIC ARRAY['gm'::app_role, 'manager'::app_role, 'admin'::app_role, 'supervisor'::app_role])` check `—`

**Triggers**

- `trg_audit_event_immutable`

### `batch_activity` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| process_activity_id | uuid | NO |  |
| code | text | NO |  |
| title | text | NO |  |
| stream | USER-DEFINED | NO |  |
| rel_day | integer | NO |  |
| seq | integer | NO |  |
| scope | USER-DEFINED | NO |  |
| scope_label | text | NO |  |
| instance_no | integer | NO |  |
| planned_qty_mt | numeric | YES |  |
| planned_start_at | timestamp with time zone | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| duration_target_min_hr | numeric | YES |  |
| duration_target_max_hr | numeric | YES |  |
| day0_duration_hr | numeric | YES |  |
| is_time_gate | boolean | NO | false |
| golden_rule | text | YES |  |
| tbd_marker | text | YES |  |
| state | USER-DEFINED | NO | 'LOCKED'::activity_state |
| blocked_reason | text | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| duration_actual_min | integer | YES |  |
| submitted_at | timestamp with time zone | YES |  |
| submitted_by | uuid | YES |  |
| instance_count | integer | YES |  |
| responsible_role | USER-DEFINED | NO | 'operator'::app_role |
| assigned_person_id | uuid | YES |  |
| assigned_machine_id | uuid | YES |  |
| assigned_vehicle_id | uuid | YES |  |
| source_location_id | uuid | YES |  |
| destination_location_id | uuid | YES |  |
| variant_code | text | YES |  |
| variant_reason | text | YES |  |
| planned_time | time without time zone | YES |  |
| planned_qty_override_mt | numeric | YES |  |
| lab_parameters | ARRAY | YES |  |
| assignment_reason | text | YES |  |
| unblocks_at | timestamp with time zone | YES |  |
| baseline_start_hour | numeric | YES |  |
| baseline_end_hour | numeric | YES |  |
| variance_minutes | integer | YES |  |
| actual_recorded_at | timestamp with time zone | YES |  |
| planned_hour_source | USER-DEFINED | NO | 'standard'::plan_hour_source |
| is_pre_h0 | boolean | NO | false |
| pre_h0_offset | integer | YES |  |
| is_hold | boolean | NO | false |

**Constraints**

- `batch_activity_actual_end_after_start` — CHECK (((actual_start IS NULL) OR (actual_end IS NULL) OR (actual_end >= actual_start)))
- `batch_activity_reason_required` — CHECK (((state <> ALL (ARRAY['LOCKED'::activity_state, 'WAITING_TIME'::activity_state, 'WAITING_CONDITION'::activity_state, 'AWAITING_LAB'::activity_state, 'BLOCKED'::activity_state, 'DEVIATION'::activity_state])) OR (COALESCE(blocked_reason, ''::text) <> ''::text)))
- `batch_activity_assigned_machine_id_fkey` — FOREIGN KEY (assigned_machine_id) REFERENCES machine(id)
- `batch_activity_assigned_person_id_fkey` — FOREIGN KEY (assigned_person_id) REFERENCES profiles(id)
- `batch_activity_assigned_vehicle_id_fkey` — FOREIGN KEY (assigned_vehicle_id) REFERENCES machine(id)
- `batch_activity_destination_location_id_fkey` — FOREIGN KEY (destination_location_id) REFERENCES location(id)
- `batch_activity_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `batch_activity_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id)
- `batch_activity_source_location_id_fkey` — FOREIGN KEY (source_location_id) REFERENCES location(id)
- `batch_activity_submitted_by_fkey` — FOREIGN KEY (submitted_by) REFERENCES profiles(id)
- `batch_activity_pkey` — PRIMARY KEY (id)
- `batch_activity_master_batch_id_process_activity_id_instance_key` — UNIQUE (master_batch_id, process_activity_id, instance_no)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `batch_read` SELECT to {authenticated} — using `true` check `—`

**Triggers**

- `trg_actual_is_append_only`
- `trg_inherit_hold`
- `trg_inherit_routing`
- `trg_plan_is_frozen`
- `trg_replan_hours`
- `trg_track_occupancy`

### `batch_activity_evidence_req` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| batch_activity_id | uuid | NO |  |
| key | text | NO |  |
| label | text | NO |  |
| media_kinds | ARRAY | NO |  |
| min_count | integer | NO | 1 |
| gates_submission | boolean | NO | true |
| capture_hint | text | YES |  |
| ordering | integer | NO |  |
| satisfied_count | integer | NO | 0 |

**Constraints**

- `batch_activity_evidence_req_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `batch_activity_evidence_req_pkey` — PRIMARY KEY (id)
- `batch_activity_evidence_req_batch_activity_id_key_key` — UNIQUE (batch_activity_id, key)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `batch_read` SELECT to {authenticated} — using `true` check `—`

### `batch_activity_value` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| batch_activity_id | uuid | NO |  |
| field_key | text | NO |  |
| label | text | NO |  |
| unit | text | YES |  |
| sop_value | text | YES |  |
| sop_min | numeric | YES |  |
| sop_max | numeric | YES |  |
| sop_source_ref | text | YES |  |
| conflict_id | text | YES |  |
| day0_value | text | YES |  |
| variance_allowed | text | YES |  |
| actual_value | text | YES |  |
| remarks | text | YES |  |
| section | text | YES |  |
| operator_input | text | NO | 'required'::text |
| display_order | integer | YES |  |
| variance_flag | text | YES |  |
| actual_recorded_at | timestamp with time zone | YES |  |
| actual_recorded_by | uuid | YES |  |

**Constraints**

- `batch_activity_value_actual_recorded_by_fkey` — FOREIGN KEY (actual_recorded_by) REFERENCES profiles(id)
- `batch_activity_value_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `batch_activity_value_pkey` — PRIMARY KEY (id)
- `batch_activity_value_batch_activity_id_field_key_key` — UNIQUE (batch_activity_id, field_key)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `batch_read` SELECT to {authenticated} — using `true` check `—`

### `batch_material_role` — table

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | NO |  |
| role | USER-DEFINED | NO |  |
| material_id | uuid | NO |  |
| is_role_lead | boolean | NO | false |
| pct_of_role | numeric | YES |  |
| moisture_pct | numeric | YES |  |
| n_pct | numeric | YES |  |
| ash_pct | numeric | YES |  |
| cn_ratio | numeric | YES |  |
| age_months | numeric | YES |  |
| source_note | text | YES |  |
| dry_wt_mt | numeric | YES |  |
| fresh_wt_mt | numeric | YES |  |

**Constraints**

- `batch_material_role_moisture_pct_check` — CHECK (((moisture_pct >= (0)::numeric) AND (moisture_pct < (100)::numeric)))
- `batch_material_role_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `batch_material_role_material_id_fkey` — FOREIGN KEY (material_id) REFERENCES material(id)
- `batch_material_role_pkey` — PRIMARY KEY (master_batch_id, role, material_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `batch_read` SELECT to {authenticated} — using `true` check `—`
- `bmr_admin_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `batch_movement` — table
_One movement of a batch into a vessel, with the instant it happened. A batch may return to a bunker it used earlier - first fill Bunker 3, reload-1 Bunker 5, reload-2 Bunker 3 again._

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| individual_batch_id | uuid | YES |  |
| movement_code | text | NO |  |
| from_location_id | uuid | YES |  |
| to_location_id | uuid | YES |  |
| planned_at | timestamp with time zone | YES |  |
| actual_at | timestamp with time zone | YES |  |
| fill_height_m | numeric | YES |  |
| note | text | YES |  |
| conflict_id | text | YES |  |
| recorded_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |

**Constraints**

- `batch_movement_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `batch_movement_from_location_id_fkey` — FOREIGN KEY (from_location_id) REFERENCES location(id)
- `batch_movement_individual_batch_id_fkey` — FOREIGN KEY (individual_batch_id) REFERENCES individual_batch(id) ON DELETE CASCADE
- `batch_movement_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `batch_movement_movement_code_fkey` — FOREIGN KEY (movement_code) REFERENCES movement_template(code)
- `batch_movement_recorded_by_fkey` — FOREIGN KEY (recorded_by) REFERENCES profiles(id)
- `batch_movement_to_location_id_fkey` — FOREIGN KEY (to_location_id) REFERENCES location(id)
- `batch_movement_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `movement_read` SELECT to {authenticated} — using `true` check `—`

### `batch_process_config` — table

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | NO |  |
| config | jsonb | NO | '{}'::jsonb |
| updated_at | timestamp with time zone | NO | now() |

**Constraints**

- `batch_process_config_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `batch_process_config_pkey` — PRIMARY KEY (master_batch_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `batch_read` SELECT to {authenticated} — using `true` check `—`
- `cfg_admin_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `batch_vessel_allocation` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| scope | text | NO |  |
| instance_no | integer | NO |  |
| location_id | uuid | NO |  |
| conflict_id | text | YES |  |
| note | text | YES |  |
| allocated_by | uuid | YES |  |
| allocated_at | timestamp with time zone | NO | now() |

**Constraints**

- `batch_vessel_allocation_instance_no_check` — CHECK ((instance_no >= 1))
- `batch_vessel_allocation_allocated_by_fkey` — FOREIGN KEY (allocated_by) REFERENCES profiles(id)
- `batch_vessel_allocation_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `batch_vessel_allocation_location_id_fkey` — FOREIGN KEY (location_id) REFERENCES location(id)
- `batch_vessel_allocation_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `batch_vessel_allocation_scope_fkey` — FOREIGN KEY (scope) REFERENCES vessel_scope_map(scope)
- `batch_vessel_allocation_pkey` — PRIMARY KEY (id)
- `batch_vessel_allocation_master_batch_id_scope_instance_no_key` — UNIQUE (master_batch_id, scope, instance_no)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `vessel_read` SELECT to {authenticated} — using `true` check `—`

### `checkpoint_decision` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| management_checkpoint_id | uuid | NO |  |
| verdict | USER-DEFINED | NO |  |
| reason | text | NO |  |
| package_snapshot | jsonb | NO |  |
| decided_at | timestamp with time zone | NO | now() |
| decided_by | uuid | NO |  |
| decided_by_role | USER-DEFINED | NO |  |
| seq | bigint | NO | nextval('checkpoint_decision_seq_seq'::regclass) |

**Constraints**

- `checkpoint_decision_reason_check` — CHECK ((length(btrim(reason)) > 0))
- `checkpoint_decision_decided_by_fkey` — FOREIGN KEY (decided_by) REFERENCES profiles(id)
- `checkpoint_decision_management_checkpoint_id_fkey` — FOREIGN KEY (management_checkpoint_id) REFERENCES management_checkpoint(id) ON DELETE CASCADE
- `checkpoint_decision_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `checkpoint_read` SELECT to {authenticated} — using `true` check `—`

**Triggers**

- `trg_checkpoint_decision_immutable`
- `trg_recount_checkpoint_state`

### `conflict_register` — table

| column | type | null | default |
|---|---|---|---|
| conflict_id | text | NO |  |
| kind | text | NO |  |
| severity | text | YES |  |
| question | text | NO |  |
| sources | text | YES |  |
| ship_with_default | text | YES |  |
| status | text | NO | 'open'::text |
| blocks_phase | text | YES |  |

**Constraints**

- `conflict_register_kind_check` — CHECK ((kind = ANY (ARRAY['conflict'::text, 'tbd'::text])))
- `conflict_register_severity_check` — CHECK ((severity = ANY (ARRAY['blocks_build'::text, 'blocks_behaviour'::text, 'cosmetic'::text])))
- `conflict_register_status_check` — CHECK ((status = ANY (ARRAY['open'::text, 'decided'::text, 'resolved'::text])))
- `conflict_register_pkey` — PRIMARY KEY (conflict_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`

### `corrective_action` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| deviation_id | uuid | NO |  |
| description | text | NO |  |
| created_at | timestamp with time zone | NO | now() |
| created_by | uuid | YES |  |
| verified_at | timestamp with time zone | YES |  |
| verified_by | uuid | YES |  |
| verification_note | text | YES |  |

**Constraints**

- `corrective_action_description_check` — CHECK ((length(TRIM(BOTH FROM description)) > 0))
- `corrective_action_verification_is_attributed` — CHECK (((verified_at IS NULL) OR ((verified_by IS NOT NULL) AND (COALESCE(verification_note, ''::text) <> ''::text))))
- `corrective_action_created_by_fkey` — FOREIGN KEY (created_by) REFERENCES profiles(id)
- `corrective_action_deviation_id_fkey` — FOREIGN KEY (deviation_id) REFERENCES deviation(id) ON DELETE CASCADE
- `corrective_action_verified_by_fkey` — FOREIGN KEY (verified_by) REFERENCES profiles(id)
- `corrective_action_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `dev_read` SELECT to {authenticated} — using `true` check `—`

### `dev_effective_clock` — table

| column | type | null | default |
|---|---|---|---|
| id | boolean | NO | true |
| enabled | boolean | NO | false |
| is_playing | boolean | NO | false |
| effective_now | timestamp with time zone | NO | clock_timestamp() |
| updated_at | timestamp with time zone | NO | clock_timestamp() |
| updated_by | uuid | YES |  |

**Constraints**

- `dev_effective_clock_id_check` — CHECK (id)
- `dev_effective_clock_updated_by_fkey` — FOREIGN KEY (updated_by) REFERENCES profiles(id)
- `dev_effective_clock_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `dev_environment_marker` — table

| column | type | null | default |
|---|---|---|---|
| marker | text | NO |  |

**Constraints**

- `dev_environment_marker_marker_check` — CHECK ((marker = 'development'::text))
- `dev_environment_marker_pkey` — PRIMARY KEY (marker)

**Grants** — authenticated: SELECT · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `deviation` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| batch_activity_id | uuid | YES |  |
| kind | USER-DEFINED | NO |  |
| summary | text | NO |  |
| detail | jsonb | NO | '{}'::jsonb |
| gate_rule_id | uuid | YES |  |
| raised_at | timestamp with time zone | NO | now() |
| raised_by | uuid | YES |  |
| raised_by_role | USER-DEFINED | YES |  |
| state | USER-DEFINED | NO | 'open'::deviation_state |
| decided_at | timestamp with time zone | YES |  |
| decided_by | uuid | YES |  |
| decided_by_role | USER-DEFINED | YES |  |
| decision_reason | text | YES |  |

**Constraints**

- `deviation_summary_check` — CHECK ((length(TRIM(BOTH FROM summary)) > 0))
- `deviation_verdict_is_attributed` — CHECK (((state = 'open'::deviation_state) OR ((decided_at IS NOT NULL) AND (decided_by IS NOT NULL) AND (COALESCE(decision_reason, ''::text) <> ''::text))))
- `deviation_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `deviation_decided_by_fkey` — FOREIGN KEY (decided_by) REFERENCES profiles(id)
- `deviation_gate_rule_id_fkey` — FOREIGN KEY (gate_rule_id) REFERENCES gate_rule(id)
- `deviation_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `deviation_raised_by_fkey` — FOREIGN KEY (raised_by) REFERENCES profiles(id)
- `deviation_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `dev_read` SELECT to {authenticated} — using `true` check `—`

### `evidence_media` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| batch_activity_id | uuid | NO |  |
| requirement_id | uuid | NO |  |
| requirement_key | text | NO |  |
| storage_path | text | NO |  |
| media_kind | text | NO |  |
| mime_type | text | YES |  |
| byte_size | bigint | YES |  |
| uploaded_by | uuid | NO |  |
| uploaded_at | timestamp with time zone | NO | now() |
| superseded_by_id | uuid | YES |  |
| superseded_reason | text | YES |  |

**Constraints**

- `evidence_media_media_kind_check` — CHECK ((media_kind = ANY (ARRAY['photo'::text, 'video'::text])))
- `evidence_media_not_self_superseding` — CHECK ((superseded_by_id IS DISTINCT FROM id))
- `evidence_media_supersede_has_reason` — CHECK (((superseded_by_id IS NULL) OR (COALESCE(TRIM(BOTH FROM superseded_reason), ''::text) <> ''::text)))
- `evidence_media_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `evidence_media_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `evidence_media_requirement_id_fkey` — FOREIGN KEY (requirement_id) REFERENCES batch_activity_evidence_req(id) ON DELETE CASCADE
- `evidence_media_superseded_by_id_fkey` — FOREIGN KEY (superseded_by_id) REFERENCES evidence_media(id)
- `evidence_media_uploaded_by_fkey` — FOREIGN KEY (uploaded_by) REFERENCES profiles(id)
- `evidence_media_pkey` — PRIMARY KEY (id)
- `evidence_media_storage_path_key` — UNIQUE (storage_path)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `evidence_media_read` SELECT to {authenticated} — using `true` check `—`

**Triggers**

- `trg_recount_evidence`

### `evidence_requirement` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| process_activity_id | uuid | NO |  |
| key | text | NO |  |
| label | text | NO |  |
| media_kinds | ARRAY | NO | '{photo}'::text[] |
| min_count | integer | NO | 1 |
| max_count | integer | YES |  |
| is_required | boolean | NO | true |
| gates_submission | boolean | NO | true |
| capture_hint | text | YES |  |
| ordering | integer | NO |  |

**Constraints**

- `evidence_requirement_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `evidence_requirement_pkey` — PRIMARY KEY (id)
- `evidence_requirement_process_activity_id_key_key` — UNIQUE (process_activity_id, key)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`

### `extension_policy` — table
_The configurable half of the extension model. Every factory rule that is still open is a column here with a TBD marker, so answering one is a settings change, not a migration. 0036 / F2._

| column | type | null | default |
|---|---|---|---|
| id | boolean | NO | true |
| requester_roles | ARRAY | NO | ARRAY['operator'::app_role, 'supervisor'::app_role, 'lab_tech'::app_role] |
| manager_approval_required | boolean | NO | true |
| gm_approval_required | boolean | NO | true |
| strict_approval_order | boolean | NO | true |
| max_requested_hr | numeric | YES |  |
| evidence_required | boolean | NO | false |
| allow_late_request | boolean | NO | true |
| allow_after_completion | boolean | NO | false |
| max_open_per_activity | integer | NO | 1 |
| max_total_per_activity | integer | YES |  |
| request_expiry_hr | numeric | YES |  |
| updated_at | timestamp with time zone | NO | now() |
| updated_by | uuid | YES |  |

**Constraints**

- `extension_policy_id_check` — CHECK (id)
- `extension_policy_updated_by_fkey` — FOREIGN KEY (updated_by) REFERENCES profiles(id)
- `extension_policy_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `extension_policy_read` SELECT to {authenticated} — using `true` check `—`
- `extension_policy_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `extension_request` — table
_Authorisation to differ from the plan. Additive: never rewrites the baseline, never rewrites the execution record. The approved hours are a THIRD number beside planned end and actual end, so the original variance stays visible. 0036 / F2._

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| batch_activity_id | uuid | NO |  |
| requested_by | uuid | YES |  |
| requested_by_role | USER-DEFINED | YES |  |
| requested_at | timestamp with time zone | NO | now() |
| requested_extension_hr | numeric | NO |  |
| requested_reason | text | NO |  |
| evidence_id | uuid | YES |  |
| planned_end_at_at_request | timestamp with time zone | YES |  |
| activity_state_at_request | text | YES |  |
| manager_decision | USER-DEFINED | YES |  |
| manager_decided_by | uuid | YES |  |
| manager_decided_at | timestamp with time zone | YES |  |
| manager_granted_hr | numeric | YES |  |
| manager_reason | text | YES |  |
| gm_decision | USER-DEFINED | YES |  |
| gm_decided_by | uuid | YES |  |
| gm_decided_at | timestamp with time zone | YES |  |
| gm_granted_hr | numeric | YES |  |
| gm_reason | text | YES |  |
| status | USER-DEFINED | NO | 'REQUESTED'::extension_status |
| approved_extension_hr | numeric | YES |  |
| effective_from | timestamp with time zone | YES |  |
| effective_to | timestamp with time zone | YES |  |
| cancelled_at | timestamp with time zone | YES |  |
| cancelled_by | uuid | YES |  |
| cancel_reason | text | YES |  |
| expired_at | timestamp with time zone | YES |  |

**Constraints**

- `extension_approved_has_hours` — CHECK (((status = 'GM_APPROVED'::extension_status) = (approved_extension_hr IS NOT NULL)))
- `extension_approved_has_window` — CHECK (((approved_extension_hr IS NULL) OR ((effective_from IS NOT NULL) AND (effective_to IS NOT NULL) AND (effective_to > effective_from))))
- `extension_cancel_attributed` — CHECK (((status <> 'CANCELLED'::extension_status) OR ((cancelled_at IS NOT NULL) AND (COALESCE(TRIM(BOTH FROM cancel_reason), ''::text) <> ''::text))))
- `extension_gm_decision_attributed` — CHECK (((gm_decision IS NULL) OR ((gm_decided_by IS NOT NULL) AND (gm_decided_at IS NOT NULL))))
- `extension_manager_decision_attributed` — CHECK (((manager_decision IS NULL) OR ((manager_decided_by IS NOT NULL) AND (manager_decided_at IS NOT NULL))))
- `extension_request_approved_extension_hr_check` — CHECK (((approved_extension_hr IS NULL) OR (approved_extension_hr > (0)::numeric)))
- `extension_request_gm_granted_hr_check` — CHECK (((gm_granted_hr IS NULL) OR (gm_granted_hr > (0)::numeric)))
- `extension_request_manager_granted_hr_check` — CHECK (((manager_granted_hr IS NULL) OR (manager_granted_hr > (0)::numeric)))
- `extension_request_requested_extension_hr_check` — CHECK ((requested_extension_hr > (0)::numeric))
- `extension_request_requested_reason_check` — CHECK ((length(TRIM(BOTH FROM requested_reason)) > 0))
- `extension_request_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `extension_request_cancelled_by_fkey` — FOREIGN KEY (cancelled_by) REFERENCES profiles(id)
- `extension_request_evidence_id_fkey` — FOREIGN KEY (evidence_id) REFERENCES evidence_media(id)
- `extension_request_gm_decided_by_fkey` — FOREIGN KEY (gm_decided_by) REFERENCES profiles(id)
- `extension_request_manager_decided_by_fkey` — FOREIGN KEY (manager_decided_by) REFERENCES profiles(id)
- `extension_request_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `extension_request_requested_by_fkey` — FOREIGN KEY (requested_by) REFERENCES profiles(id)
- `extension_request_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `extension_request_read` SELECT to {authenticated} — using `true` check `—`

**Triggers**

- `trg_extension_is_append_only`

### `factory_clock` — table

| column | type | null | default |
|---|---|---|---|
| id | integer | NO | 1 |
| h0_hour_of_day | integer | NO |  |
| h0_minute_of_hour | integer | NO | 0 |
| timezone | text | YES |  |
| timezone_conflict_id | text | YES |  |
| h0_source_ref | text | NO |  |
| updated_at | timestamp with time zone | NO | now() |

**Constraints**

- `factory_clock_h0_hour_of_day_check` — CHECK (((h0_hour_of_day >= 0) AND (h0_hour_of_day <= 23)))
- `factory_clock_h0_minute_of_hour_check` — CHECK (((h0_minute_of_hour >= 0) AND (h0_minute_of_hour <= 59)))
- `factory_clock_id_check` — CHECK ((id = 1))
- `factory_clock_timezone_conflict_id_fkey` — FOREIGN KEY (timezone_conflict_id) REFERENCES conflict_register(conflict_id)
- `factory_clock_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`
- `trg_factory_clock_validate`

### `gate_rule` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| process_activity_id | uuid | NO |  |
| phase | text | NO |  |
| kind | text | NO |  |
| config | jsonb | NO | '{}'::jsonb |
| predecessor_binding | text | YES |  |
| is_enabled | boolean | NO | true |
| mapping_confidence | text | NO | 'dictated'::text |
| conflict_id | text | YES |  |
| blocked_reason_template | text | NO |  |
| ordering | integer | NO | 10 |
| is_protected | boolean | NO | false |

**Constraints**

- `gate_rule_blocked_reason_template_check` — CHECK ((length(TRIM(BOTH FROM blocked_reason_template)) > 0))
- `gate_rule_mapping_confidence_check` — CHECK ((mapping_confidence = ANY (ARRAY['dictated'::text, 'sop_direct'::text, 'sop_inferred'::text, 'unmapped'::text])))
- `gate_rule_phase_check` — CHECK ((phase = ANY (ARRAY['entry'::text, 'exit'::text])))
- `gate_rule_predecessor_binding_check` — CHECK ((predecessor_binding = ANY (ARRAY['ALL_INSTANCES'::text, 'ANY_INSTANCE'::text, 'SAME_SCOPE_INSTANCE'::text])))
- `gate_rule_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `gate_rule_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `gate_rule_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`
- `trg_gate_rule_protection`

### `individual_batch` — table
_One of the two-to-four batches inside a master batch. Shares the early process; separates at tunnel loading, where each takes its own tunnel and its own quality result._

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| batch_no | text | NO |  |
| seq | integer | NO |  |
| created_at | timestamp with time zone | NO | now() |

**Constraints**

- `individual_batch_seq_check` — CHECK ((seq >= 1))
- `individual_batch_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `individual_batch_pkey` — PRIMARY KEY (id)
- `individual_batch_master_batch_id_seq_key` — UNIQUE (master_batch_id, seq)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `movement_read` SELECT to {authenticated} — using `true` check `—`

### `lab_approval_reading` — table

| column | type | null | default |
|---|---|---|---|
| reading_code | text | NO |  |
| approver_role | USER-DEFINED | NO |  |
| statement | text | NO |  |
| source_ref | text | NO |  |
| consequence | text | NO |  |
| is_enabled | boolean | NO | false |

**Constraints**

- `lab_approval_reading_pkey` — PRIMARY KEY (reading_code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_approval_reading_read` SELECT to {authenticated} — using `true` check `—`

### `lab_checkpoint` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| checkpoint_map | USER-DEFINED | NO |  |
| code | text | NO |  |
| name | text | NO |  |
| rel_day | integer | YES |  |
| scope | text | NO |  |
| parameters | ARRAY | NO |  |
| spec_checkpoint_code | text | YES |  |
| source_ref | text | NO |  |
| is_prebatch | boolean | NO | false |
| kind | text | NO | 'RECORD'::text |
| evidence_kinds | ARRAY | NO | ARRAY[]::text[] |
| per_pile | boolean | NO | false |
| stage | text | YES |  |
| where_note | text | YES |  |
| guidance | text | YES |  |
| sort_order | integer | YES |  |
| confidence | text | YES |  |

**Constraints**

- `lab_checkpoint_kind_known` — CHECK ((kind = ANY (ARRAY['GATE'::text, 'DECISION'::text, 'RECORD'::text])))
- `lab_checkpoint_pkey` — PRIMARY KEY (id)
- `lab_checkpoint_checkpoint_map_code_key` — UNIQUE (checkpoint_map, code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `lab_checkpoint_activity` — table
_Which planned activity carries which laboratory checkpoint, and — for a GATE — which PRODUCTION activity it holds. lab_checkpoints.json supplies blocks_activity_code as null on purpose: real activity codes are read from process_activity, never invented. 0052._

| column | type | null | default |
|---|---|---|---|
| checkpoint_map | USER-DEFINED | NO |  |
| checkpoint_code | text | NO |  |
| process_activity_id | uuid | NO |  |
| gates_activity_code | text | YES |  |

**Constraints**

- `lab_checkpoint_activity_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `lab_checkpoint_activity_pkey` — PRIMARY KEY (checkpoint_map, checkpoint_code, process_activity_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_checkpoint_activity_read` SELECT to {authenticated} — using `true` check `—`

### `lab_checkpoint_conflict` — table

| column | type | null | default |
|---|---|---|---|
| checkpoint_id | uuid | NO |  |
| conflict_id | text | NO |  |
| note | text | YES |  |

**Constraints**

- `lab_checkpoint_conflict_checkpoint_id_fkey` — FOREIGN KEY (checkpoint_id) REFERENCES lab_checkpoint(id) ON DELETE CASCADE
- `lab_checkpoint_conflict_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `lab_checkpoint_conflict_pkey` — PRIMARY KEY (checkpoint_id, conflict_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `lab_decision` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| seq | bigint | NO | nextval('lab_decision_seq_seq'::regclass) |
| batch_activity_id | uuid | NO |  |
| verdict | text | NO |  |
| reason | text | NO |  |
| decided_by | uuid | YES |  |
| decided_role | USER-DEFINED | YES |  |
| authorised_under_reading | text | NO |  |
| reading_was_enabled | boolean | NO |  |
| decided_at | timestamp with time zone | NO | now() |

**Constraints**

- `lab_decision_verdict_check` — CHECK ((verdict = ANY (ARRAY['approved'::text, 'rejected'::text])))
- `lab_decision_authorised_under_reading_fkey` — FOREIGN KEY (authorised_under_reading) REFERENCES lab_approval_reading(reading_code)
- `lab_decision_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `lab_decision_decided_by_fkey` — FOREIGN KEY (decided_by) REFERENCES profiles(id)
- `lab_decision_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `lab_instrument` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO |  |
| name | text | NO |  |
| kind | USER-DEFINED | NO |  |
| serial | text | YES |  |
| last_calibrated_on | date | YES |  |
| calibration_interval_days | integer | YES |  |
| status | text | NO | 'available'::text |
| source_ref | text | YES |  |
| tbd_marker | text | YES |  |

**Constraints**

- `lab_instrument_tbd_marker_fkey` — FOREIGN KEY (tbd_marker) REFERENCES conflict_register(conflict_id)
- `lab_instrument_pkey` — PRIMARY KEY (id)
- `lab_instrument_code_key` — UNIQUE (code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `lab_method` — table

| column | type | null | default |
|---|---|---|---|
| code | text | NO |  |
| name | text | NO |  |
| apparatus | ARRAY | YES |  |
| procedure_steps | ARRAY | YES |  |
| calculation_formula | text | YES |  |
| calibration_note | text | YES |  |
| source_ref | text | NO |  |
| conflict_id | text | YES |  |

**Constraints**

- `lab_method_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `lab_method_pkey` — PRIMARY KEY (code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `lab_result` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| test_id | uuid | NO |  |
| version | integer | NO | 1 |
| value_numeric | numeric | YES |  |
| value_text | text | YES |  |
| unit | text | YES |  |
| target_min | numeric | YES |  |
| target_max | numeric | YES |  |
| invalid_reason | text | YES |  |
| measured_at | timestamp with time zone | NO | now() |
| technician_id | uuid | YES |  |
| instrument_id | uuid | YES |  |
| calibration_status | USER-DEFINED | NO | 'unknown'::lab_calibration_status |
| calibrated_on | date | YES |  |
| raw_readings | jsonb | YES |  |
| retest_reason | USER-DEFINED | YES |  |
| supersedes_result_id | uuid | YES |  |
| superseded_by_result_id | uuid | YES |  |
| accepted | boolean | NO | false |
| accepted_by | uuid | YES |  |
| accepted_at | timestamp with time zone | YES |  |
| deviation_id | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| verdict | text | YES |  |

**Constraints**

- `lab_result_has_a_value` — CHECK (((value_numeric IS NOT NULL) OR (value_text IS NOT NULL) OR (invalid_reason IS NOT NULL)))
- `lab_result_retest_needs_reason` — CHECK (((version > 1) = (retest_reason IS NOT NULL)))
- `lab_result_v1_supersedes_nothing` — CHECK (((version = 1) = (supersedes_result_id IS NULL)))
- `lab_result_verdict_domain` — CHECK ((verdict = ANY (ARRAY['pass'::text, 'fail'::text, 'no_spec'::text, 'invalid'::text])))
- `lab_result_version_check` — CHECK ((version > 0))
- `lab_result_accepted_by_fkey` — FOREIGN KEY (accepted_by) REFERENCES profiles(id)
- `lab_result_deviation_id_fkey` — FOREIGN KEY (deviation_id) REFERENCES deviation(id)
- `lab_result_instrument_id_fkey` — FOREIGN KEY (instrument_id) REFERENCES lab_instrument(id)
- `lab_result_superseded_fk` — FOREIGN KEY (superseded_by_result_id) REFERENCES lab_result(id) DEFERRABLE INITIALLY DEFERRED
- `lab_result_supersedes_result_id_fkey` — FOREIGN KEY (supersedes_result_id) REFERENCES lab_result(id)
- `lab_result_technician_id_fkey` — FOREIGN KEY (technician_id) REFERENCES profiles(id)
- `lab_result_test_id_fkey` — FOREIGN KEY (test_id) REFERENCES lab_test(id) ON DELETE CASCADE
- `lab_result_pkey` — PRIMARY KEY (id)
- `lab_result_test_id_version_key` — UNIQUE (test_id, version)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `lab_sample` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| checkpoint_id | uuid | NO |  |
| master_batch_id | uuid | NO |  |
| batch_activity_id | uuid | YES |  |
| scope_ref | text | YES |  |
| vessel_id | uuid | YES |  |
| sample_ref_label | text | YES |  |
| condition_note | text | YES |  |
| collected_at | timestamp with time zone | NO | now() |
| collected_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |

**Constraints**

- `lab_sample_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE SET NULL
- `lab_sample_checkpoint_id_fkey` — FOREIGN KEY (checkpoint_id) REFERENCES lab_checkpoint(id)
- `lab_sample_collected_by_fkey` — FOREIGN KEY (collected_by) REFERENCES profiles(id)
- `lab_sample_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `lab_sample_vessel_id_fkey` — FOREIGN KEY (vessel_id) REFERENCES location(id)
- `lab_sample_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `lab_setting` — table

| column | type | null | default |
|---|---|---|---|
| key | text | NO |  |
| int_value | integer | YES |  |
| text_value | text | YES |  |
| source_ref | text | NO |  |
| conflict_id | text | YES |  |

**Constraints**

- `lab_setting_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `lab_setting_pkey` — PRIMARY KEY (key)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_setting_read` SELECT to {authenticated} — using `true` check `—`

### `lab_spec` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| checkpoint_code | text | NO |  |
| parameter_code | text | NO |  |
| min_value | numeric | YES |  |
| max_value | numeric | YES |  |
| unit | text | YES |  |
| source_ref | text | NO |  |
| conflict_id | text | YES |  |

**Constraints**

- `lab_spec_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `lab_spec_pkey` — PRIMARY KEY (id)
- `lab_spec_checkpoint_code_parameter_code_key` — UNIQUE (checkpoint_code, parameter_code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `lab_test` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| sample_id | uuid | NO |  |
| parameter_code | text | NO |  |
| method_code | text | YES |  |
| state | USER-DEFINED | NO | 'requested'::lab_test_state |
| requested_at | timestamp with time zone | NO | now() |
| requested_by | uuid | YES |  |
| requested_via | text | NO | 'user'::text |
| target_min | numeric | YES |  |
| target_max | numeric | YES |  |
| target_unit | text | YES |  |
| spec_source_ref | text | YES |  |
| spec_conflict_id | text | YES |  |
| spec_found | boolean | NO | false |

**Constraints**

- `lab_test_requested_via_check` — CHECK ((requested_via = ANY (ARRAY['system'::text, 'user'::text])))
- `lab_test_method_code_fkey` — FOREIGN KEY (method_code) REFERENCES lab_method(code)
- `lab_test_requested_by_fkey` — FOREIGN KEY (requested_by) REFERENCES profiles(id)
- `lab_test_sample_id_fkey` — FOREIGN KEY (sample_id) REFERENCES lab_sample(id) ON DELETE CASCADE
- `lab_test_spec_conflict_id_fkey` — FOREIGN KEY (spec_conflict_id) REFERENCES conflict_register(conflict_id)
- `lab_test_pkey` — PRIMARY KEY (id)
- `lab_test_sample_id_parameter_code_key` — UNIQUE (sample_id, parameter_code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `lab_read` SELECT to {authenticated} — using `true` check `—`

### `location` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| kind | USER-DEFINED | NO |  |
| code | text | NO |  |
| label | text | NO |  |
| capacity_mt | numeric | YES |  |
| max_fill_height_m | numeric | YES |  |
| is_persistent | boolean | NO | true |
| is_exclusive | boolean | NO | true |
| status | text | NO | 'available'::text |

**Constraints**

- `location_pkey` — PRIMARY KEY (id)
- `location_code_key` — UNIQUE (code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `location_occupancy` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| location_id | uuid | NO |  |
| master_batch_id | uuid | NO |  |
| batch_activity_id | uuid | YES |  |
| stream | USER-DEFINED | YES |  |
| material_state | text | YES |  |
| started_at | timestamp with time zone | NO |  |
| ended_at | timestamp with time zone | YES |  |
| policy_id | uuid | YES |  |
| tbd_marker | text | YES |  |
| during | tstzrange | YES |  |
| is_exclusive | boolean | NO | true |

**Constraints**

- `location_occupancy_ends_after_start` — CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
- `location_occupancy_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE SET NULL
- `location_occupancy_location_id_fkey` — FOREIGN KEY (location_id) REFERENCES location(id)
- `location_occupancy_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `location_occupancy_policy_id_fkey` — FOREIGN KEY (policy_id) REFERENCES resource_policy(id)
- `location_occupancy_pkey` — PRIMARY KEY (id)
- `location_occupancy_no_overlap` — EXCLUDE USING gist (location_id WITH =, during WITH &&) WHERE (is_exclusive)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `resource_read` SELECT to {authenticated} — using `true` check `—`

### `machine` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO |  |
| name | text | NO |  |
| kind | USER-DEFINED | NO |  |
| status | text | NO | 'available'::text |
| meters_hours | boolean | NO | false |
| meters_fuel | boolean | NO | false |
| tbd_marker | text | YES |  |

**Constraints**

- `machine_tbd_marker_fkey` — FOREIGN KEY (tbd_marker) REFERENCES conflict_register(conflict_id)
- `machine_pkey` — PRIMARY KEY (id)
- `machine_code_key` — UNIQUE (code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `machine_usage` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| machine_id | uuid | NO |  |
| master_batch_id | uuid | NO |  |
| batch_activity_id | uuid | NO |  |
| started_at | timestamp with time zone | NO |  |
| ended_at | timestamp with time zone | YES |  |
| opened_by | uuid | YES |  |
| closed_by | uuid | YES |  |
| during | tstzrange | YES |  |
| minutes | integer | YES |  |

**Constraints**

- `machine_usage_ends_after_start` — CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
- `machine_usage_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `machine_usage_closed_by_fkey` — FOREIGN KEY (closed_by) REFERENCES profiles(id)
- `machine_usage_machine_id_fkey` — FOREIGN KEY (machine_id) REFERENCES machine(id)
- `machine_usage_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `machine_usage_opened_by_fkey` — FOREIGN KEY (opened_by) REFERENCES profiles(id)
- `machine_usage_pkey` — PRIMARY KEY (id)
- `machine_usage_no_overlap` — EXCLUDE USING gist (machine_id WITH =, during WITH &&)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `resource_read` SELECT to {authenticated} — using `true` check `—`

### `management_checkpoint` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | NO |  |
| checkpoint_no | integer | NO |  |
| state | USER-DEFINED | NO | 'open'::checkpoint_state |
| opened_at | timestamp with time zone | NO | now() |

**Constraints**

- `management_checkpoint_checkpoint_no_check` — CHECK ((checkpoint_no > 0))
- `management_checkpoint_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `management_checkpoint_pkey` — PRIMARY KEY (id)
- `management_checkpoint_master_batch_id_checkpoint_no_key` — UNIQUE (master_batch_id, checkpoint_no)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `checkpoint_read` SELECT to {authenticated} — using `true` check `—`

### `master_batch` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO |  |
| label | text | NO |  |
| process_definition_id | uuid | NO |  |
| start_date | date | NO |  |
| status | USER-DEFINED | NO | 'draft'::batch_status |
| supervisor_name | text | YES |  |
| weather_note | text | YES |  |
| config | jsonb | NO | '{}'::jsonb |
| activated_at | timestamp with time zone | YES |  |
| activated_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| created_by | uuid | YES |  |
| start_at | timestamp with time zone | YES |  |
| schedule_group_id | uuid | YES |  |
| is_demo | boolean | NO | false |

**Constraints**

- `master_batch_process_definition_id_fkey` — FOREIGN KEY (process_definition_id) REFERENCES process_definition(id)
- `master_batch_schedule_group_id_fkey` — FOREIGN KEY (schedule_group_id) REFERENCES monthly_schedule_group(id) ON DELETE RESTRICT
- `master_batch_pkey` — PRIMARY KEY (id)
- `master_batch_code_key` — UNIQUE (code)
- `master_batch_schedule_group_id_key` — UNIQUE (schedule_group_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `batch_admin_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`
- `batch_read` SELECT to {authenticated} — using `true` check `—`

**Triggers**

- `trg_activation_is_one_way`
- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`
- `trg_plan_generated`

### `material` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO |  |
| name | text | NO |  |
| category | USER-DEFINED | NO |  |
| default_unit | text | NO | 'MT'::text |
| is_nitrogen_source | boolean | NO | false |
| notes | text | YES |  |

**Constraints**

- `material_pkey` — PRIMARY KEY (id)
- `material_code_key` — UNIQUE (code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `material_role_eligibility` — table

| column | type | null | default |
|---|---|---|---|
| role | USER-DEFINED | NO |  |
| material_id | uuid | NO |  |
| is_default_lead | boolean | NO | false |
| tbd_marker | text | YES |  |

**Constraints**

- `material_role_eligibility_material_id_fkey` — FOREIGN KEY (material_id) REFERENCES material(id) ON DELETE CASCADE
- `material_role_eligibility_tbd_marker_fkey` — FOREIGN KEY (tbd_marker) REFERENCES conflict_register(conflict_id)
- `material_role_eligibility_pkey` — PRIMARY KEY (role, material_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `material_spec` — table

| column | type | null | default |
|---|---|---|---|
| material_id | uuid | NO |  |
| parameter | text | NO |  |
| min_value | numeric | YES |  |
| max_value | numeric | YES |  |
| unit | text | YES |  |
| source_ref | text | NO |  |

**Constraints**

- `material_spec_material_id_fkey` — FOREIGN KEY (material_id) REFERENCES material(id) ON DELETE CASCADE
- `material_spec_pkey` — PRIMARY KEY (material_id, parameter)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `monthly_schedule_group` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| schedule_import_id | uuid | NO |  |
| source_row_number | integer | NO |  |
| group_code | text | NO |  |
| group_label | text | YES |  |
| scheduled_start_date | date | NO |  |
| resource_note | text | YES |  |
| raw_row | jsonb | NO | '{}'::jsonb |
| status | text | NO | 'scheduled'::text |
| master_batch_id | uuid | YES |  |
| instantiated_at | timestamp with time zone | YES |  |
| instantiated_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |

**Constraints**

- `monthly_schedule_group_group_code_check` — CHECK ((length(TRIM(BOTH FROM group_code)) > 0))
- `monthly_schedule_group_source_row_number_check` — CHECK ((source_row_number > 0))
- `monthly_schedule_group_status_check` — CHECK ((status = ANY (ARRAY['scheduled'::text, 'instantiated'::text, 'cancelled'::text])))
- `monthly_schedule_group_instantiated_by_fkey` — FOREIGN KEY (instantiated_by) REFERENCES profiles(id)
- `monthly_schedule_group_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE RESTRICT
- `monthly_schedule_group_schedule_import_id_fkey` — FOREIGN KEY (schedule_import_id) REFERENCES monthly_schedule_import(id) ON DELETE CASCADE
- `monthly_schedule_group_pkey` — PRIMARY KEY (id)
- `monthly_schedule_group_master_batch_id_key` — UNIQUE (master_batch_id)
- `monthly_schedule_group_schedule_import_id_group_code_key` — UNIQUE (schedule_import_id, group_code)
- `monthly_schedule_group_schedule_import_id_source_row_number_key` — UNIQUE (schedule_import_id, source_row_number)

**Grants** — authenticated: SELECT · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `monthly_schedule_group_management_read` SELECT to {authenticated} — using `has_role(VARIADIC ARRAY['gm'::app_role, 'manager'::app_role, 'admin'::app_role, 'supervisor'::app_role])` check `—`

### `monthly_schedule_import` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| schedule_month | date | NO |  |
| source_filename | text | NO |  |
| imported_at | timestamp with time zone | NO | now() |
| imported_by | uuid | YES |  |
| source_rows | integer | NO |  |
| is_current | boolean | NO | true |
| column_map | jsonb | NO | '{}'::jsonb |

**Constraints**

- `monthly_schedule_import_schedule_month_check` — CHECK ((schedule_month = (date_trunc('month'::text, (schedule_month)::timestamp with time zone))::date))
- `monthly_schedule_import_source_filename_check` — CHECK ((length(TRIM(BOTH FROM source_filename)) > 0))
- `monthly_schedule_import_source_rows_check` — CHECK ((source_rows > 0))
- `monthly_schedule_import_imported_by_fkey` — FOREIGN KEY (imported_by) REFERENCES profiles(id)
- `monthly_schedule_import_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `monthly_schedule_import_management_read` SELECT to {authenticated} — using `has_role(VARIADIC ARRAY['gm'::app_role, 'manager'::app_role, 'admin'::app_role, 'supervisor'::app_role])` check `—`

### `movement_rule` — table

| column | type | null | default |
|---|---|---|---|
| process_activity_id | uuid | NO |  |
| source_kind | USER-DEFINED | YES |  |
| destination_kind | USER-DEFINED | YES |  |
| requires_distinct_vessel | boolean | NO | false |
| allow_same_vessel_override | boolean | NO | false |
| creates_locations | jsonb | YES |  |
| consumes_locations | jsonb | YES |  |

**Constraints**

- `movement_rule_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `movement_rule_pkey` — PRIMARY KEY (process_activity_id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `movement_template` — table

| column | type | null | default |
|---|---|---|---|
| code | text | NO |  |
| label | text | NO |  |
| seq | integer | NO |  |
| vessel_kind | USER-DEFINED | YES |  |
| is_per_individual_batch | boolean | NO | false |
| source_ref | text | NO |  |

**Constraints**

- `movement_template_pkey` — PRIMARY KEY (code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `movement_read` SELECT to {authenticated} — using `true` check `—`

### `notification` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| master_batch_id | uuid | YES |  |
| batch_activity_id | uuid | YES |  |
| to_role | USER-DEFINED | YES |  |
| to_person_id | uuid | YES |  |
| kind | text | NO |  |
| message | text | NO |  |
| reason | text | YES |  |
| sent_by | uuid | YES |  |
| sent_at | timestamp with time zone | NO | now() |
| read_at | timestamp with time zone | YES |  |

**Constraints**

- `notification_kind_check` — CHECK ((kind = ANY (ARRAY['assignment'::text, 'alert'::text, 'gate_opened'::text, 'returned'::text])))
- `notification_batch_activity_id_fkey` — FOREIGN KEY (batch_activity_id) REFERENCES batch_activity(id) ON DELETE CASCADE
- `notification_master_batch_id_fkey` — FOREIGN KEY (master_batch_id) REFERENCES master_batch(id) ON DELETE CASCADE
- `notification_sent_by_fkey` — FOREIGN KEY (sent_by) REFERENCES profiles(id)
- `notification_to_person_id_fkey` — FOREIGN KEY (to_person_id) REFERENCES profiles(id)
- `notification_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `notif_read` SELECT to {authenticated} — using `true` check `—`

### `phase2_control_band` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| from_hr | integer | NO |  |
| to_hr | integer | NO |  |
| stage | text | NO |  |
| probe | text | NO |  |
| band_min | numeric | YES |  |
| band_max | numeric | YES |  |
| verdict | text | NO |  |
| action | text | NO |  |
| expected_outcome | text | YES |  |
| source_ref | text | NO |  |
| conflict_id | text | YES |  |

**Constraints**

- `phase2_control_band_probe_check` — CHECK ((probe = ANY (ARRAY['tunnel_top'::text, 'compost'::text, 'plenum'::text])))
- `phase2_control_band_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `phase2_control_band_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `process_activity` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| process_definition_id | uuid | NO |  |
| code | text | NO |  |
| label_template | text | NO |  |
| material_role | USER-DEFINED | YES |  |
| stream | USER-DEFINED | NO |  |
| rel_day | integer | NO |  |
| seq | integer | NO |  |
| scope | USER-DEFINED | NO |  |
| cardinality_rule | jsonb | NO |  |
| duration_target_min_hr | numeric | YES |  |
| duration_target_max_hr | numeric | YES |  |
| duration_required_at_day0 | boolean | NO | false |
| is_time_gate | boolean | NO | false |
| is_optional | boolean | NO | false |
| default_enabled | boolean | NO | true |
| golden_rule | text | YES |  |
| source_ref | text | NO |  |
| tbd_marker | text | YES |  |
| responsible_role | USER-DEFINED | YES | 'operator'::app_role |
| lab_parameters | ARRAY | YES |  |
| admin_question | text | YES |  |
| day_span_label | text | YES |  |
| standard_start_hour | numeric | YES |  |
| standard_end_hour | numeric | YES |  |
| standard_hour_source | text | YES |  |
| is_pre_h0 | boolean | NO | false |
| pre_h0_offset | integer | YES |  |
| timing_confidence | USER-DEFINED | NO | 'UNRESOLVED'::process_confidence |
| is_hold | boolean | NO | false |

**Constraints**

- `process_activity_code_has_no_material_name` — CHECK ((code !~* '(bagasse|paddy|mustard|wheat|gypsum|manure|urea|lime)'::text))
- `process_activity_hour_granularity` — CHECK ((((standard_start_hour IS NULL) OR ((standard_start_hour * (2)::numeric) = floor((standard_start_hour * (2)::numeric)))) AND ((standard_end_hour IS NULL) OR ((standard_end_hour * (2)::numeric) = floor((standard_end_hour * (2)::numeric))))))
- `process_activity_hour_not_before_h0` — CHECK (((standard_start_hour IS NULL) OR (standard_start_hour >= (0)::numeric)))
- `process_activity_hour_source_known` — CHECK (((standard_start_hour IS NULL) OR (standard_hour_source = ANY (ARRAY['factory_stated'::text, 'derived_from_rel_day'::text]))))
- `process_activity_hours_ordered` — CHECK (((standard_start_hour IS NULL) OR (standard_end_hour IS NULL) OR (standard_end_hour >= standard_start_hour)))
- `process_activity_range_has_both_bounds` — CHECK (((timing_confidence <> 'FACTORY_RANGE'::process_confidence) OR ((duration_target_min_hr IS NOT NULL) AND (duration_target_max_hr IS NOT NULL))))
- `process_activity_rel_day_derived` — CHECK (((standard_start_hour IS NULL) OR ((rel_day)::numeric = floor((standard_start_hour / (24)::numeric)))))
- `process_activity_process_definition_id_fkey` — FOREIGN KEY (process_definition_id) REFERENCES process_definition(id) ON DELETE CASCADE
- `process_activity_tbd_marker_fkey` — FOREIGN KEY (tbd_marker) REFERENCES conflict_register(conflict_id)
- `process_activity_pkey` — PRIMARY KEY (id)
- `process_activity_process_definition_id_code_key` — UNIQUE (process_definition_id, code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`
- `trg_definition_is_frozen`

### `process_catalogue` — table
_One row. Which process version a new batch is planned against when the caller does not name one. The replacement for a process code compiled into create_master_batch. 0044._

| column | type | null | default |
|---|---|---|---|
| id | integer | NO | 1 |
| current_definition_id | uuid | NO |  |
| set_by | uuid | YES |  |
| set_at | timestamp with time zone | NO | now() |
| reason | text | YES |  |

**Constraints**

- `process_catalogue_id_check` — CHECK ((id = 1))
- `process_catalogue_current_definition_id_fkey` — FOREIGN KEY (current_definition_id) REFERENCES process_definition(id)
- `process_catalogue_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `process_catalogue_read` SELECT to {authenticated} — using `true` check `—`

### `process_day` — table

| column | type | null | default |
|---|---|---|---|
| process_definition_id | uuid | NO |  |
| rel_day | integer | NO |  |
| title | text | NO |  |
| source_ref | text | NO |  |

**Constraints**

- `process_day_rel_day_check` — CHECK ((rel_day >= 0))
- `process_day_process_definition_id_fkey` — FOREIGN KEY (process_definition_id) REFERENCES process_definition(id) ON DELETE CASCADE
- `process_day_pkey` — PRIMARY KEY (process_definition_id, rel_day)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `process_definition` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO |  |
| name | text | NO |  |
| version | integer | NO | 1 |
| status | USER-DEFINED | NO | 'draft'::process_status |
| source_ref | text | NO |  |
| anchor_day_label | text | NO |  |
| total_days | integer | NO |  |
| published_by | uuid | YES |  |
| published_at | timestamp with time zone | YES |  |
| baseline_days | integer | YES |  |
| baseline_hours | integer | YES |  |
| envelope_confidence | USER-DEFINED | NO | 'UNRESOLVED'::process_confidence |
| envelope_hours | integer | YES |  |
| envelope_hour_source | text | YES |  |

**Constraints**

- `process_definition_envelope_positive` — CHECK (((envelope_hours IS NULL) OR (envelope_hours > 0)))
- `process_definition_envelope_source_known` — CHECK (((envelope_hours IS NULL) OR (envelope_hour_source = ANY (ARRAY['factory_stated'::text, 'derived_from_days'::text]))))
- `process_definition_stated_envelope_is_classified` — CHECK (((envelope_hours IS NULL) OR (envelope_confidence <> 'UNRESOLVED'::process_confidence)))
- `process_definition_pkey` — PRIMARY KEY (id)
- `process_definition_code_version_key` — UNIQUE (code, version)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`

### `profiles` — table
_The staff roster and the fallback source of truth for a role. Read-only to every client role: a role is granted by the service role or by SQL, never by the user who holds it. 0035 / F3._

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO |  |
| display_name | text | NO |  |
| role | USER-DEFINED | NO |  |
| shift | text | YES |  |
| is_active | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |

**Constraints**

- `profiles_id_fkey` — FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
- `profiles_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `profiles_no_self_delete` DELETE to {anon,authenticated} — using `false` check `—`
- `profiles_no_self_insert` INSERT to {anon,authenticated} — using `—` check `false`
- `profiles_no_self_write` UPDATE to {anon,authenticated} — using `false` check `false`
- `profiles_read_auth_admin` SELECT to {supabase_auth_admin} — using `true` check `—`
- `profiles_read_roster` SELECT to {authenticated} — using `is_active` check `—`
- `profiles_read_self` SELECT to {authenticated} — using `(id = auth.uid())` check `—`

**Triggers**

- `trg_audit_del`
- `trg_audit_ins`
- `trg_audit_upd`
- `trg_sync_role_claim`

### `resource_policy` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| question_id | text | NO |  |
| reading_code | text | NO |  |
| statement | text | NO |  |
| source_ref | text | NO |  |
| consequence | text | NO |  |
| is_enabled | boolean | NO | false |

**Constraints**

- `resource_policy_question_id_fkey` — FOREIGN KEY (question_id) REFERENCES conflict_register(conflict_id)
- `resource_policy_pkey` — PRIMARY KEY (id)
- `resource_policy_question_id_reading_code_key` — UNIQUE (question_id, reading_code)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `resource_policy_read` SELECT to {authenticated} — using `true` check `—`

### `resource_requirement` — table

| column | type | null | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| process_activity_id | uuid | NO |  |
| machine_kind | USER-DEFINED | NO |  |
| quantity | integer | NO | 1 |
| is_required | boolean | NO | true |
| role_hint | text | YES |  |

**Constraints**

- `resource_requirement_process_activity_id_fkey` — FOREIGN KEY (process_activity_id) REFERENCES process_activity(id) ON DELETE CASCADE
- `resource_requirement_pkey` — PRIMARY KEY (id)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `ref_read` SELECT to {authenticated} — using `true` check `—`
- `ref_write` ALL to {authenticated} — using `has_role(VARIADIC ARRAY['admin'::app_role])` check `has_role(VARIADIC ARRAY['admin'::app_role])`

### `vessel_scope_map` — table

| column | type | null | default |
|---|---|---|---|
| scope | text | NO |  |
| location_kind | USER-DEFINED | YES |  |
| unmapped_reason | text | YES |  |
| conflict_id | text | YES |  |
| source_ref | text | NO |  |

**Constraints**

- `vessel_scope_map_states_itself` — CHECK (((location_kind IS NOT NULL) OR (unmapped_reason IS NOT NULL)))
- `vessel_scope_map_conflict_id_fkey` — FOREIGN KEY (conflict_id) REFERENCES conflict_register(conflict_id)
- `vessel_scope_map_pkey` — PRIMARY KEY (scope)

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

**Policies**

- `vessel_read` SELECT to {authenticated} — using `true` check `—`

### `v_activity_expectation` — view

| column | type | null | default |
|---|---|---|---|
| activity_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| code | text | YES |  |
| title | text | YES |  |
| scope_label | text | YES |  |
| rel_day | integer | YES |  |
| planned_start_at | timestamp with time zone | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| approved_extension_hr | numeric | YES |  |
| approved_extension_count | bigint | YES |  |
| authorised_end_at | timestamp with time zone | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| original_variance_minutes | integer | YES |  |
| within_authorisation | boolean | YES |  |
| pending_extension_count | bigint | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_activity_forecast` — view
_PLAN · EXTENSION · AUTHORISED · ACTUAL · FORECAST, side by side and never collapsed. forecast_basis says which arithmetic produced the projection — a projection read as a measurement is how a screen promises a date the factory never committed to. 0056._

| column | type | null | default |
|---|---|---|---|
| activity_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| code | text | YES |  |
| title | text | YES |  |
| scope_label | text | YES |  |
| planned_start_at | timestamp with time zone | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| approved_extension_hr | numeric | YES |  |
| authorised_end_at | timestamp with time zone | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| original_variance_minutes | integer | YES |  |
| within_authorisation | boolean | YES |  |
| projected_end_at | timestamp with time zone | YES |  |
| forecast_basis | text | YES |  |
| forecast_unknown_reason | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_activity_timing` — view

| column | type | null | default |
|---|---|---|---|
| activity_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| rel_day | integer | YES |  |
| title | text | YES |  |
| scope_label | text | YES |  |
| hour_source | text | YES |  |
| standard_start_hour | numeric | YES |  |
| standard_end_hour | numeric | YES |  |
| standard_min_hr | numeric | YES |  |
| standard_max_hr | numeric | YES |  |
| planned_time | time without time zone | YES |  |
| planned_duration_hr | numeric | YES |  |
| baseline_start_hour | numeric | YES |  |
| baseline_end_hour | numeric | YES |  |
| planned_start_at | timestamp with time zone | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| duration_actual_min | integer | YES |  |
| variance_minutes | integer | YES |  |
| tbd_marker | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_actual_history` — view
_The current actuals beside what was FIRST recorded, and how many times they have moved. The answer to "was this always the finish time, or was it changed?". 0049._

| column | type | null | default |
|---|---|---|---|
| activity_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| code | text | YES |  |
| title | text | YES |  |
| scope_label | text | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| actual_recorded_at | timestamp with time zone | YES |  |
| correction_count | integer | YES |  |
| first_recorded_start | timestamp with time zone | YES |  |
| first_recorded_end | timestamp with time zone | YES |  |
| has_been_corrected | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_event` — view

| column | type | null | default |
|---|---|---|---|
| id | bigint | YES |  |
| occurred_at | timestamp with time zone | YES |  |
| master_batch_id | uuid | YES |  |
| action | text | YES |  |
| entity_table | text | YES |  |
| entity_id | text | YES |  |
| reason | text | YES |  |
| after_state | jsonb | YES |  |
| actor_id | uuid | YES |  |
| actor_role | USER-DEFINED | YES |  |
| actor_name | text | YES |  |
| server_decided | boolean | YES |  |
| activity_title | text | YES |  |
| scope_label | text | YES |  |
| batch_hour | integer | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_forecast` — view
_The batch story in five numbers: planned end (H0 + its own process standard), approved extension, authorised end, projected end, and the exposure between plan and projection. Writes nothing — a forecast that persisted would be a second plan. 0056._

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| code | text | YES |  |
| status | text | YES |  |
| process_code | text | YES |  |
| h0 | timestamp with time zone | YES |  |
| standard_hr | numeric | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| approved_extension_hr | numeric | YES |  |
| authorised_end_at | timestamp with time zone | YES |  |
| slip_minutes | integer | YES |  |
| measured_count | bigint | YES |  |
| finished_count | bigint | YES |  |
| running_count | bigint | YES |  |
| activity_count | bigint | YES |  |
| projected_end_at | timestamp with time zone | YES |  |
| forecast_basis | text | YES |  |
| exposure_minutes | integer | YES |  |
| forecast_unknown_reason | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_movement` — view
_Every movement a batch is expected to make, filled or not. A null to_location is a movement whose vessel has not been chosen yet - the main thing the picker exists to show._

| column | type | null | default |
|---|---|---|---|
| seq | integer | YES |  |
| movement_code | text | YES |  |
| movement_label | text | YES |  |
| needs_kind | text | YES |  |
| is_per_individual_batch | boolean | YES |  |
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| individual_batch_id | uuid | YES |  |
| batch_no | text | YES |  |
| movement_id | uuid | YES |  |
| from_location_id | uuid | YES |  |
| from_label | text | YES |  |
| to_location_id | uuid | YES |  |
| to_label | text | YES |  |
| to_code | text | YES |  |
| planned_at | timestamp with time zone | YES |  |
| actual_at | timestamp with time zone | YES |  |
| fill_height_m | numeric | YES |  |
| conflict_id | text | YES |  |
| recorded_by_name | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_slip` — view
_How far behind the batch actually is, measured on work that has FINISHED. The worst completed variance, not an average — averaging a rail whose slow step has already happened forecasts a recovery nobody has a reason to expect. 0056._

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| code | text | YES |  |
| status | text | YES |  |
| h0 | timestamp with time zone | YES |  |
| process_code | text | YES |  |
| standard_hr | numeric | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| finished_count | bigint | YES |  |
| running_count | bigint | YES |  |
| activity_count | bigint | YES |  |
| slip_minutes | integer | YES |  |
| measured_count | bigint | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_variance` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| code | text | YES |  |
| variance_minutes | integer | YES |  |
| worst_stream | text | YES |  |
| all_streams_sum_minutes | integer | YES |  |
| contributor_count | integer | YES |  |
| measured_count | integer | YES |  |
| activity_count | integer | YES |  |
| deviations_on_record | integer | YES |  |
| deviations_awaiting_verdict | integer | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_vessel` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| scope | text | YES |  |
| instance_no | integer | YES |  |
| location_id | uuid | YES |  |
| kind | text | YES |  |
| location_code | text | YES |  |
| location_label | text | YES |  |
| conflict_id | text | YES |  |
| note | text | YES |  |
| allocated_by_name | text | YES |  |
| allocated_at | timestamp with time zone | YES |  |
| first_occupied | timestamp with time zone | YES |  |
| currently_in | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_batch_vessel_slot` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| scope | text | YES |  |
| needs_kind | text | YES |  |
| instance_no | integer | YES |  |
| activity_count | integer | YES |  |
| first_day | integer | YES |  |
| last_day | integer | YES |  |
| location_id | uuid | YES |  |
| location_code | text | YES |  |
| location_label | text | YES |  |
| conflict_id | text | YES |  |
| allocated_at | timestamp with time zone | YES |  |
| allocated_by_name | text | YES |  |
| work_started | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_checkpoint_status` — view

| column | type | null | default |
|---|---|---|---|
| checkpoint_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| checkpoint_no | integer | YES |  |
| state | USER-DEFINED | YES |  |
| opened_at | timestamp with time zone | YES |  |
| latest_decision_id | uuid | YES |  |
| latest_verdict | USER-DEFINED | YES |  |
| latest_reason | text | YES |  |
| latest_decided_at | timestamp with time zone | YES |  |
| decided_by_name | text | YES |  |
| decided_by_role | USER-DEFINED | YES |  |
| decision_count | integer | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_deviation_open` — view

| column | type | null | default |
|---|---|---|---|
| id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| batch_activity_id | uuid | YES |  |
| kind | USER-DEFINED | YES |  |
| summary | text | YES |  |
| detail | jsonb | YES |  |
| gate_rule_id | uuid | YES |  |
| raised_at | timestamp with time zone | YES |  |
| raised_by | uuid | YES |  |
| raised_by_role | USER-DEFINED | YES |  |
| state | USER-DEFINED | YES |  |
| decided_at | timestamp with time zone | YES |  |
| decided_by | uuid | YES |  |
| decided_by_role | USER-DEFINED | YES |  |
| decision_reason | text | YES |  |
| awaiting_verdict | boolean | YES |  |
| stands_on_record | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_evidence_state` — view

| column | type | null | default |
|---|---|---|---|
| requirement_id | uuid | YES |  |
| batch_activity_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| key | text | YES |  |
| label | text | YES |  |
| media_kinds | ARRAY | YES |  |
| min_count | integer | YES |  |
| satisfied_count | integer | YES |  |
| gates_submission | boolean | YES |  |
| capture_hint | text | YES |  |
| ordering | integer | YES |  |
| media_id | uuid | YES |  |
| storage_path | text | YES |  |
| media_kind | text | YES |  |
| uploaded_at | timestamp with time zone | YES |  |
| uploaded_by | uuid | YES |  |
| uploaded_by_name | text | YES |  |
| uploaded_by_role | USER-DEFINED | YES |  |
| superseded_by_id | uuid | YES |  |
| superseded_reason | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_extension_request` — view

| column | type | null | default |
|---|---|---|---|
| id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_activity_id | uuid | YES |  |
| activity_title | text | YES |  |
| scope_label | text | YES |  |
| status | USER-DEFINED | YES |  |
| is_effective | boolean | YES |  |
| requested_extension_hr | numeric | YES |  |
| approved_extension_hr | numeric | YES |  |
| requested_reason | text | YES |  |
| requested_at | timestamp with time zone | YES |  |
| requested_by_name | text | YES |  |
| requested_by_role | USER-DEFINED | YES |  |
| manager_decision | USER-DEFINED | YES |  |
| manager_decided_at | timestamp with time zone | YES |  |
| manager_reason | text | YES |  |
| manager_name | text | YES |  |
| gm_decision | USER-DEFINED | YES |  |
| gm_decided_at | timestamp with time zone | YES |  |
| gm_reason | text | YES |  |
| gm_name | text | YES |  |
| effective_from | timestamp with time zone | YES |  |
| effective_to | timestamp with time zone | YES |  |
| cancel_reason | text | YES |  |
| cancelled_at | timestamp with time zone | YES |  |
| expired_at | timestamp with time zone | YES |  |
| evidence_id | uuid | YES |  |
| planned_end_at_at_request | timestamp with time zone | YES |  |
| planned_end_at_now | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_gate_rest_rule` — view
_Every rest-after-predecessor rule in every process version, as data. The Turner's eight hours live here, not in a function body. 0051._

| column | type | null | default |
|---|---|---|---|
| process_code | text | YES |  |
| process_version | integer | YES |  |
| activity_code | text | YES |  |
| label_template | text | YES |  |
| waits_for | text | YES |  |
| predecessor_binding | text | YES |  |
| min_rest_hr | numeric | YES |  |
| is_enabled | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_approval_question` — view

| column | type | null | default |
|---|---|---|---|
| reading_code | text | YES |  |
| approver_role | USER-DEFINED | YES |  |
| statement | text | YES |  |
| source_ref | text | YES |  |
| consequence | text | YES |  |
| is_enabled | boolean | YES |  |
| question | text | YES |  |
| conflict_status | text | YES |  |
| still_open | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_approval_queue` — view
_Lab submissions and the decision standing on each. Management only — a supervisor, manager, admin or GM. An operator or lab technician reads nothing here, and the database is what says so, not the route guard. 0063 created it, 0069 took its stray grants back, 0070 scoped its rows._

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_status | USER-DEFINED | YES |  |
| activity_id | uuid | YES |  |
| activity_code | text | YES |  |
| activity_title | text | YES |  |
| scope_label | text | YES |  |
| activity_state | USER-DEFINED | YES |  |
| actual_end | timestamp with time zone | YES |  |
| checkpoint_code | text | YES |  |
| checkpoint_name | text | YES |  |
| checkpoint_kind | text | YES |  |
| gates_activity_code | text | YES |  |
| gates_activity_title | text | YES |  |
| gates_activity_state | USER-DEFINED | YES |  |
| is_gate | boolean | YES |  |
| gate_is_enabled | boolean | YES |  |
| latest_verdict | text | YES |  |
| latest_reason | text | YES |  |
| decided_at | timestamp with time zone | YES |  |
| decided_role | USER-DEFINED | YES |  |
| decided_by_name | text | YES |  |
| decision_count | integer | YES |  |
| sample_count | integer | YES |  |
| result_count | integer | YES |  |
| awaiting_decision | boolean | YES |  |
| is_approved | boolean | YES |  |
| approver_roles | ARRAY | YES |  |
| approver_question_settled | boolean | YES |  |

**Grants** — authenticated: SELECT · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_checkpoint_map` — view
_BOTH lab checkpoint maps, carried side by side per BUILD_SEQUENCE_KIRO §B5 - "Do not merge, do not pick." checkpoint_map names which map a row belongs to; conflict_ids carries every open question the row touches, C-33 among them. spec_mapped is false wherever TBD-36 leaves the mapping to lab_spec unstated, and a test on such a checkpoint freezes no band at all._

| column | type | null | default |
|---|---|---|---|
| checkpoint_map | USER-DEFINED | YES |  |
| code | text | YES |  |
| name | text | YES |  |
| rel_day | integer | YES |  |
| scope | text | YES |  |
| parameters | ARRAY | YES |  |
| spec_checkpoint_code | text | YES |  |
| spec_mapped | boolean | YES |  |
| source_ref | text | YES |  |
| conflict_ids | ARRAY | YES |  |
| spec_rows | bigint | YES |  |
| spec_rows_without_a_band | bigint | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_gate` — view
_Every laboratory gate and decision, and the production activity it holds. A DECISION shows with rule_exists = false ON PURPOSE: LAB-MOIST-DEC branches the process, it does not block it, and the 67-68 % band it turns on is UNRESOLVED. 0054._

| column | type | null | default |
|---|---|---|---|
| process_code | text | YES |  |
| checkpoint_code | text | YES |  |
| checkpoint_name | text | YES |  |
| kind | text | YES |  |
| blocks_activity_code | text | YES |  |
| blocks_activity | text | YES |  |
| rule_exists | boolean | YES |  |
| is_enabled | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_queue` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_label | text | YES |  |
| current_day | integer | YES |  |
| activity_id | uuid | YES |  |
| activity_title | text | YES |  |
| scope_label | text | YES |  |
| parameters | ARRAY | YES |  |
| state | text | YES |  |
| action_required | boolean | YES |  |
| last_submission | text | YES |  |
| band | text | YES |  |
| overdue_unknown_reason | text | YES |  |
| samples | bigint | YES |  |
| results | bigint | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_result_current` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_activity_id | uuid | YES |  |
| checkpoint_map | USER-DEFINED | YES |  |
| checkpoint_code | text | YES |  |
| test_id | uuid | YES |  |
| parameter_code | text | YES |  |
| result_id | uuid | YES |  |
| version | integer | YES |  |
| value_numeric | numeric | YES |  |
| value_text | text | YES |  |
| unit | text | YES |  |
| verdict | text | YES |  |
| target_min | numeric | YES |  |
| target_max | numeric | YES |  |
| spec_found | boolean | YES |  |
| spec_source_ref | text | YES |  |
| spec_conflict_id | text | YES |  |
| retest_reason | USER-DEFINED | YES |  |
| supersedes_result_id | uuid | YES |  |
| superseded_by_result_id | uuid | YES |  |
| is_current | boolean | YES |  |
| measured_at | timestamp with time zone | YES |  |
| technician_name | text | YES |  |
| instrument_code | text | YES |  |
| calibration_status | USER-DEFINED | YES |  |
| accepted | boolean | YES |  |
| accepted_at | timestamp with time zone | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_lab_result_history` — view
_EVERY version of every lab result, with the superseding chain intact. LAB_MODEL §5 - "v1 is never hidden ... because we measured it twice is itself a material fact." Filter is_current for the head; do not filter it out of a decision package._

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_activity_id | uuid | YES |  |
| checkpoint_map | USER-DEFINED | YES |  |
| checkpoint_code | text | YES |  |
| test_id | uuid | YES |  |
| parameter_code | text | YES |  |
| result_id | uuid | YES |  |
| version | integer | YES |  |
| value_numeric | numeric | YES |  |
| value_text | text | YES |  |
| unit | text | YES |  |
| verdict | text | YES |  |
| target_min | numeric | YES |  |
| target_max | numeric | YES |  |
| spec_found | boolean | YES |  |
| spec_source_ref | text | YES |  |
| spec_conflict_id | text | YES |  |
| retest_reason | USER-DEFINED | YES |  |
| supersedes_result_id | uuid | YES |  |
| superseded_by_result_id | uuid | YES |  |
| is_current | boolean | YES |  |
| measured_at | timestamp with time zone | YES |  |
| technician_name | text | YES |  |
| instrument_code | text | YES |  |
| calibration_status | USER-DEFINED | YES |  |
| accepted | boolean | YES |  |
| accepted_at | timestamp with time zone | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_live_batch` — view

| column | type | null | default |
|---|---|---|---|
| id | uuid | YES |  |
| code | text | YES |  |
| label | text | YES |  |
| process_definition_id | uuid | YES |  |
| start_date | date | YES |  |
| status | USER-DEFINED | YES |  |
| supervisor_name | text | YES |  |
| weather_note | text | YES |  |
| config | jsonb | YES |  |
| activated_at | timestamp with time zone | YES |  |
| activated_by | uuid | YES |  |
| created_at | timestamp with time zone | YES |  |
| created_by | uuid | YES |  |
| start_at | timestamp with time zone | YES |  |
| schedule_group_id | uuid | YES |  |
| is_demo | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_machine_utilisation` — view
_Machine hours DERIVED from machine_usage windows. There is no editable hours column anywhere in the schema - DEMO_PLAN_V2 criterion 20 - and `minutes` on machine_usage is generated from the window, so nothing writes an hour. `minutes` is NULL while a stint is open._

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| machine_id | uuid | YES |  |
| machine_code | text | YES |  |
| machine_kind | USER-DEFINED | YES |  |
| stints | integer | YES |  |
| open_stints | integer | YES |  |
| minutes | integer | YES |  |
| first_started_at | timestamp with time zone | YES |  |
| last_ended_at | timestamp with time zone | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_my_work` — view
_The signed-in worker's own assigned work on active batches — or every row, for the roles whose job is to see other people's. Scoped in 0066 after an operator's My Work listed 41 laboratory checkpoints._

| column | type | null | default |
|---|---|---|---|
| activity_id | uuid | YES |  |
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| code | text | YES |  |
| title | text | YES |  |
| scope_label | text | YES |  |
| stream | text | YES |  |
| instance_no | integer | YES |  |
| state | text | YES |  |
| blocked_reason | text | YES |  |
| is_hold | boolean | YES |  |
| responsible_role | text | YES |  |
| assigned_person_id | uuid | YES |  |
| assigned_machine_id | uuid | YES |  |
| baseline_start_hour | numeric | YES |  |
| baseline_end_hour | numeric | YES |  |
| planned_start_at | timestamp with time zone | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| variance_minutes | integer | YES |  |
| required_count | integer | YES |  |
| satisfied_total | integer | YES |  |
| outstanding_labels | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_plant_now` — view

| column | type | null | default |
|---|---|---|---|
| location_id | uuid | YES |  |
| kind | text | YES |  |
| code | text | YES |  |
| label | text | YES |  |
| is_exclusive | boolean | YES |  |
| location_status | text | YES |  |
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_label | text | YES |  |
| occupied_since | timestamp with time zone | YES |  |
| stream | text | YES |  |
| activity_id | uuid | YES |  |
| activity_title | text | YES |  |
| scope_label | text | YES |  |
| activity_state | text | YES |  |
| batch_hour | integer | YES |  |
| tbd_marker | text | YES |  |
| allocated_not_started | integer | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_prebatch_material_check` — view
_The incoming-material check for a batch, recorded BEFORE H0 against the pending batch. `batch_activity_id is null` is what makes it pre-batch - it belongs to the batch without belonging to any activity, so nothing about it is on the hour axis. Client decision 2; the Day-0 reading of the same test is TBD-57._

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| batch_code | text | YES |  |
| batch_status | USER-DEFINED | YES |  |
| checkpoint_code | text | YES |  |
| checkpoint_map | USER-DEFINED | YES |  |
| sample_id | uuid | YES |  |
| sample_ref_label | text | YES |  |
| collected_at | timestamp with time zone | YES |  |
| collected_by_name | text | YES |  |
| tests_requested | integer | YES |  |
| results_current | integer | YES |  |
| failed | integer | YES |  |
| no_spec | integer | YES |  |
| accepted | integer | YES |  |
| before_h0 | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_process_catalogue` — view
_Every process version with its OWN calculated standard. What the Admin process picker reads: choose a version, and the standard shown is that version's, not the application's. 0044 / 0045._

| column | type | null | default |
|---|---|---|---|
| process_definition_id | uuid | YES |  |
| code | text | YES |  |
| version | integer | YES |  |
| status | USER-DEFINED | YES |  |
| name | text | YES |  |
| anchor_day_label | text | YES |  |
| source_ref | text | YES |  |
| published_at | timestamp with time zone | YES |  |
| standard_hr | numeric | YES |  |
| full_span_hr | numeric | YES |  |
| stated_envelope_hr | integer | YES |  |
| envelope_confidence | USER-DEFINED | YES |  |
| envelope_disagrees | boolean | YES |  |
| stated_minus_calculated_hr | numeric | YES |  |
| activity_count | bigint | YES |  |
| hold_count | bigint | YES |  |
| stream_count | bigint | YES |  |
| unplaced_activity_count | bigint | YES |  |
| is_current | boolean | YES |  |
| is_selectable | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_process_confidence` — view

| column | type | null | default |
|---|---|---|---|
| process_definition_id | uuid | YES |  |
| code | text | YES |  |
| version | integer | YES |  |
| envelope_confidence | USER-DEFINED | YES |  |
| activity_count | bigint | YES |  |
| unresolved_count | bigint | YES |  |
| simulation_count | bigint | YES |  |
| confirmed_count | bigint | YES |  |
| parallel_count | bigint | YES |  |
| envelope_is_defensible | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_process_envelope` — view
_The single resolver for "how long is this process". standard_hr is CALCULATED from the definition's own activities — never a constant, never the day grid. stated_envelope_hr is what the factory wrote down beside it, and envelope_disagrees says whether the two agree. 0045 supersedes 0041's coalesce, which could return (total_days+1)*24 to a caller that believed it was reading the standard._

| column | type | null | default |
|---|---|---|---|
| process_definition_id | uuid | YES |  |
| code | text | YES |  |
| version | integer | YES |  |
| status | USER-DEFINED | YES |  |
| total_days | integer | YES |  |
| baseline_hours | integer | YES |  |
| standard_hr | numeric | YES |  |
| calculated_standard_hr | numeric | YES |  |
| full_span_hr | numeric | YES |  |
| stated_envelope_hr | integer | YES |  |
| envelope_hour_source | text | YES |  |
| envelope_confidence | USER-DEFINED | YES |  |
| stated_minus_calculated_hr | numeric | YES |  |
| envelope_disagrees | boolean | YES |  |
| envelope_hr | numeric | YES |  |
| envelope_source | text | YES |  |
| envelope_is_a_derivation | boolean | YES |  |
| envelope_lands_on_a_day | boolean | YES |  |
| activity_count | bigint | YES |  |
| hold_count | bigint | YES |  |
| stream_count | bigint | YES |  |
| unplaced_activity_count | bigint | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_process_envelope_reconciliation` — view
_Does a stated envelope agree with the activities beneath it, and how far past the standard does the last stream run? The sum of durations is reported but is NOT the length — three parallel streams and 128 hours of holds are why. 0041, rebuilt on 0045's resolver._

| column | type | null | default |
|---|---|---|---|
| process_definition_id | uuid | YES |  |
| code | text | YES |  |
| version | integer | YES |  |
| standard_hr | numeric | YES |  |
| stated_envelope_hr | integer | YES |  |
| stated_minus_calculated_hr | numeric | YES |  |
| envelope_disagrees | boolean | YES |  |
| envelope_confidence | USER-DEFINED | YES |  |
| full_span_hr | numeric | YES |  |
| tail_beyond_standard_hr | numeric | YES |  |
| serial_duration_sum_hr | numeric | YES |  |
| parallel_duration_sum_hr | numeric | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_process_standard` — view
_What ONE process version's own activities add up to. The standard duration is a property of the SOP, not of the application — PROCESS-2026C computes 470 h and another version computes whatever its own stages compute. Nothing here is a literal. 0045._

| column | type | null | default |
|---|---|---|---|
| process_definition_id | uuid | YES |  |
| code | text | YES |  |
| version | integer | YES |  |
| status | USER-DEFINED | YES |  |
| calculated_standard_hr | numeric | YES |  |
| full_span_hr | numeric | YES |  |
| activity_count | bigint | YES |  |
| hold_count | bigint | YES |  |
| stream_count | bigint | YES |  |
| unplaced_activity_count | bigint | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_sop_limit_mapping` — view

| column | type | null | default |
|---|---|---|---|
| sop_activity | text | YES |  |
| sop_field | text | YES |  |
| sop_min | numeric | YES |  |
| sop_max | numeric | YES |  |
| unit | text | YES |  |
| sop_source_ref | text | YES |  |
| mapped_to_activity | text | YES |  |
| mapping_confidence | text | YES |  |
| is_enabled | boolean | YES |  |
| conflict_id | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_stream_variance` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| stream | text | YES |  |
| stream_variance_minutes | integer | YES |  |
| contributor_count | integer | YES |  |
| measured_count | integer | YES |  |
| minutes_late | integer | YES |  |
| minutes_early | integer | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_unguarded_writer` — view
_Every SECURITY DEFINER function a signed-in user may call that names no role. Not all of them are defects — several are reads — but the list must be looked at deliberately rather than grown by accident, which is how an operator came to be able to create a batch. 0058._

| column | type | null | default |
|---|---|---|---|
| function_name | name | YES |  |
| arguments | text | YES |  |
| authenticated_may_call | boolean | YES |  |
| anon_may_call | boolean | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_variance_contributor` — view

| column | type | null | default |
|---|---|---|---|
| master_batch_id | uuid | YES |  |
| activity_id | uuid | YES |  |
| code | text | YES |  |
| title | text | YES |  |
| scope_label | text | YES |  |
| stream | text | YES |  |
| seq | integer | YES |  |
| baseline_start_hour | numeric | YES |  |
| variance_minutes | integer | YES |  |
| planned_start_at | timestamp with time zone | YES |  |
| planned_end_at | timestamp with time zone | YES |  |
| actual_start | timestamp with time zone | YES |  |
| actual_end | timestamp with time zone | YES |  |
| person | text | YES |  |
| machine | text | YES |  |
| cause | text | YES |  |
| has_open_deviation | boolean | YES |  |
| rank | integer | YES |  |
| tbd_marker | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

### `v_vessel_availability` — view
_Every vessel in the plant with the reason it is or is not available: occupied_by_batch is physical (an open occupancy), allocated_to_batch is planned. They can differ, and both matter._

| column | type | null | default |
|---|---|---|---|
| location_id | uuid | YES |  |
| kind | text | YES |  |
| code | text | YES |  |
| label | text | YES |  |
| is_exclusive | boolean | YES |  |
| status | text | YES |  |
| occupied_by_batch_id | uuid | YES |  |
| occupied_by_batch | text | YES |  |
| occupied_since | timestamp with time zone | YES |  |
| allocated_to_batch_id | uuid | YES |  |
| allocated_to_batch | text | YES |  |

**Grants** — authenticated: SELECT, TRIGGER · service_role: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE

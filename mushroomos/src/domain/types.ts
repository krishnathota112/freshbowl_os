// Domain unions the database schema cannot express.
// Everything else is generated — see src/domain/database.types.ts.

/** docs/WORKFLOW_MODEL.md §2 — the full state set. */
export const ACTIVITY_STATES = [
  'LOCKED',
  'READY',
  'IN_PROGRESS',
  'SUBMITTED',
  'AWAITING_LAB',
  'WAITING_TIME',
  'WAITING_CONDITION',
  'AWAITING_SUPERVISOR',
  'BLOCKED',
  'DEVIATION',
  'RETURNED',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
] as const;

export type ActivityState = (typeof ACTIVITY_STATES)[number];

/**
 * docs/WORKFLOW_MODEL.md §2.1 — every one of these MUST carry a reason.
 * The UI never shows a grey card with no explanation.
 */
export const NON_ACTIONABLE_STATES: ReadonlySet<ActivityState> = new Set([
  'LOCKED',
  'WAITING_TIME',
  'WAITING_CONDITION',
  'AWAITING_LAB',
  'BLOCKED',
  'DEVIATION',
]);

export const MATERIAL_ROLES = [
  'PRIMARY_FIBRE',
  'SECONDARY_FIBRE',
  'STRUCTURAL_STRAW',
  'NITROGEN_SOURCE',
  'MINERAL',
  'PH_CORRECTOR',
] as const;
export type MaterialRoleCode = (typeof MATERIAL_ROLES)[number];

export const STREAMS = [
  'PRIMARY_FIBRE',
  'SECONDARY_FIBRE',
  'STRUCTURAL_STRAW',
  'NITROGEN_MINERAL',
  'YARD',
  'BUNKER',
  'TUNNEL',
] as const;
export type StreamCode = (typeof STREAMS)[number];

export const ACTIVITY_SCOPES = [
  'MASTER',
  'LOAD',
  'BUNKER_LINE',
  'PILE',
  'STRAW_PILE',
  'TUNNEL',
  'INDIVIDUAL_BATCH',
] as const;
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];

export type ProcessPhase = 'PRE_H0' | 'PRODUCTION';

export type AppRole = 'gm' | 'manager' | 'admin' | 'supervisor' | 'operator' | 'lab_tech';

/** docs/STEP_1_2_BUILD_SPEC.md §2.4 — six kinds, no literal counts anywhere. */
export type CardinalityRule =
  | { kind: 'SINGLETON' }
  | {
      kind: 'DERIVED_FROM_QUANTITY';
      quantity_field: string;
      capacity_field: string;
      formula: 'ceil';
      tail_instance_takes_remainder?: boolean;
    }
  /**
   * One instance per existing scope instance. `count_field` overrides the scope's default
   * config field, which matters because the pile set changes size through the process:
   * 2 yard piles → 1 mixed pile → 3 piles at the turner (mixed + 2 straw).
   */
  | { kind: 'PER_SCOPE_INSTANCE'; scope: ActivityScope; count_field?: string }
  | {
      kind: 'CREATES_SCOPE_INSTANCES';
      scope: ActivityScope;
      count_field: string;
      label_prefix: string;
    }
  | {
      kind: 'MERGES_SCOPE_INSTANCES';
      scope: ActivityScope;
      from: 'all_open';
      to_count: number;
      new_label: string;
    }
  | { kind: 'REPEAT'; count_field: string; index_label: string };

/** docs/UI_DESIGN_SPEC.md §2 — one component, five layers, six densities. */
export type LayerTone = 'ok' | 'warn' | 'crit' | 'muted';

export type LayerValue = {
  text: string;
  tone?: LayerTone;
  annotations?: string[];
  /** Layer ① only — e.g. 'S1a 0B'. Rendered when the layer is null too. */
  sourceRef?: string;
  /** e.g. 'C-01' — renders the amber marker. */
  conflictId?: string;
};

export type Density = 'operator' | 'lab' | 'supervisor' | 'admin' | 'manager' | 'gm';

export type FiveLayerNodeProps = {
  title: string;
  subtitle: string;
  instanceLabel?: string;
  state: ActivityState;
  blockedReason?: string;
  unblocksAt?: string;
  layers: {
    sop: LayerValue | null;
    plan: LayerValue | null;
    actual: LayerValue | null;
    evidence: LayerValue | null;
    decision: LayerValue | null;
  };
  density: Density;
  onExpand?: () => void;
};

/** A row of process_activity, as read. */
export type ProcessActivity = {
  id: string;
  code: string;
  label_template: string;
  material_role: MaterialRoleCode | null;
  stream: StreamCode;
  rel_day: number;
  seq: number;
  scope: ActivityScope;
  cardinality_rule: CardinalityRule;
  duration_target_min_hr: number | null;
  duration_target_max_hr: number | null;
  duration_required_at_day0: boolean;
  is_time_gate: boolean;
  golden_rule: string | null;
  source_ref: string;
  tbd_marker: string | null;
};

export type EvidenceRequirement = {
  process_activity_id: string;
  key: string;
  label: string;
  media_kinds: string[];
  min_count: number;
  gates_submission: boolean;
  ordering: number;
};

export type GateRule = {
  process_activity_id: string;
  phase: 'entry' | 'exit';
  kind: string;
  config: Record<string, unknown>;
  predecessor_binding: 'ALL_INSTANCES' | 'ANY_INSTANCE' | 'SAME_SCOPE_INSTANCE' | null;
  is_enabled: boolean;
  mapping_confidence: 'dictated' | 'sop_direct' | 'sop_inferred' | 'unmapped';
  conflict_id: string | null;
  blocked_reason_template: string;
};

export type ActivityVariant = {
  process_activity_id: string;
  code: string;
  label: string;
  auto_select_enabled: boolean;
  conflict_id: string | null;
  selection_rule: Record<string, unknown> | null;
};

export type Material = {
  id: string;
  code: string;
  name: string;
  category: string;
};

export type RoleEligibility = {
  role: MaterialRoleCode;
  material_id: string;
  is_default_lead: boolean;
};

export type ConflictEntry = {
  conflict_id: string;
  kind: 'conflict' | 'tbd';
  severity: string | null;
  question: string;
  ship_with_default: string | null;
  status: string;
};

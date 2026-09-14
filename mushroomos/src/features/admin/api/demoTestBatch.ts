import { supabase } from '../../../shared/api/client';

export async function createDemoTestBatch(): Promise<{ batchId: string; batchCode: string }> {
  const timestamp = Date.now().toString().slice(-4);
  const batchCode = `MB-DEMO-TEST-${timestamp}`;
  const label = `Test Batch ${timestamp}`;
  const todayIso = new Date().toISOString().slice(0, 10);

  // 1. Get process version
  const { data: proc, error: procErr } = await supabase
    .from('process_definition')
    .select('id')
    .eq('is_selectable', true)
    .limit(1)
    .single();
  if (procErr || !proc) throw new Error('Could not find active process definition');

  // 2. Create Master Batch
  const { data: batchId, error: createErr } = await supabase.rpc('create_master_batch', {
    p_code: batchCode,
    p_label: label,
    p_process: proc.id,
    p_start_date: todayIso,
    p_supervisor: 'Demonstration Supervisor',
  });
  if (createErr || !batchId) throw createErr || new Error('Failed to create master batch');

  // 3. Generate Plan
  const { error: planErr } = await supabase.rpc('generate_activity_plan', {
    p_batch_id: batchId as string,
  });
  if (planErr) console.warn('generate_activity_plan warning:', planErr);

  // 4. Record Pre-batch material check so activation succeeds
  try {
    const { data: checkpoints } = await supabase
      .from('lab_checkpoint')
      .select('id')
      .eq('is_prebatch', true)
      .limit(1);
    
    if (checkpoints && checkpoints.length > 0) {
      await supabase.rpc('record_prebatch_material_check', {
        p_master_batch: batchId as string,
        p_checkpoint: checkpoints[0].id,
        p_moisture_pct: 68.5,
        p_ph: 7.2,
      });

      const { data: unaccepted } = await supabase
        .from('v_lab_result_current')
        .select('result_id')
        .eq('master_batch_id', batchId)
        .eq('accepted', false);

      for (const r of unaccepted ?? []) {
        await supabase.rpc('accept_lab_result', {
          p_result: r.result_id,
          p_reason: 'Automated Demo Acceptance',
        });
      }
    }
  } catch (err) {
    console.warn('Prebatch check auto-fill warning:', err);
  }

  // 5. Activate Batch
  try {
    await supabase.rpc('activate_batch', { p_batch_id: batchId as string });
  } catch (err) {
    console.warn('activate_batch warning:', err);
  }

  // 6. Simulate Supervisor work on first ready activities
  try {
    const { data: readyWork } = await supabase
      .from('v_my_work')
      .select('activity_id')
      .eq('master_batch_id', batchId)
      .limit(2);

    for (const work of readyWork ?? []) {
      await supabase.rpc('start_activity', { p_activity: work.activity_id });
      await supabase.rpc('submit_activity', {
        p_activity: work.activity_id,
        p_actual_start: new Date(Date.now() - 3600000).toISOString(),
        p_actual_end: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Supervisor work simulation warning:', err);
  }

  return { batchId: batchId as string, batchCode };
}

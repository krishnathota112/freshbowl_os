-- A new published version, leaving the previous template and existing batches unchanged.
insert into tk_sop(id,family_id,name,version,status,note,reference_h0,published_at)
select '14900000-0000-4000-8000-000000000001', s.family_id, s.name,
       (select max(version)+1 from tk_sop where family_id=s.family_id), 'published',
       'Process and Lab share one numbered SOP. Six Turner piles, editable before batch creation. Set each pile’s dates independently. Review the source timing notes in Description.',
       s.reference_h0, now()
from tk_sop s where s.id='14600000-0000-4000-8000-000000000001';

with originals as (
  select * from tk_sop_row where sop_id='14600000-0000-4000-8000-000000000001'
), extra_labs(anchor,position,title,checkpoint,gate,readings) as (values
 (1,1,'Raw material / bagasse Lab check','LAB-RM-01',false,'Moisture, pH, EC, dry weight; advisory.'),
 (2,1,'Lab after Hopper Pass 1','LAB-WET-01',false,'Moisture, pH, EC.'),
 (4,1,'Lab after Hopper Pass 2','LAB-WET-02',false,'Moisture, pH, EC.'),
 (9,1,'Paddy weighment Lab check','LAB-PDY-WGH',false,'Moisture + dry weight.'),
 (10,1,'Paddy soak 1 — pit water Lab check','LAB-PDY-S1',false,'pH, EC, TDS.'),
 (11,-2,'Bunker unloading Lab check','LAB-UNL-01',false,'Moisture, pH, EC.'),
 (11,1,'Bunker reloading Lab check','LAB-RLD-01',false,'Moisture, pH, EC.'),
 (12,1,'Paddy soak 2 — pit water Lab check','LAB-PDY-S2',false,'pH, EC, TDS.'),
 (13,1,'Chicken manure arrival Lab check','LAB-CM-ARR',false,'Nitrogen, ash.'),
 (18,-1,'Lab before water hopper passes','LAB-HOP-PRE',false,'Moisture and temperature before the hopper passes.'),
 (23,-1,'Pre-Turner Lab check','LAB-PRE-T',false,'Pre-Turner readings from the Lab register.'),
 (29,-1,'Lab gate — Bunker 1 fill','LAB-BNK-LOAD',true,'Height, moisture and full loading set; P1 + P2.'),
 (30,-1,'Lab gate — Bunker 2 fill','LAB-BNK-LOAD',true,'Height, moisture and full loading set; P3 + P4.'),
 (31,-1,'Lab gate — Bunker 3 fill','LAB-BNK-LOAD',true,'Height, moisture and full loading set; P5 + P6.'),
 (32,-1,'Lab before Bunker 1 reload','LAB-RLD2-UNL',false,'Height, moisture and full unloading set.'),
 (32,1,'Lab after Bunker 1 reload','LAB-RLD2-RE',false,'Height, moisture and full reloading set.'),
 (33,-1,'Lab before Bunker 2 reload','LAB-RLD2-UNL',false,'Height, moisture and full unloading set.'),
 (33,1,'Lab after Bunker 2 reload','LAB-RLD2-RE',false,'Height, moisture and full reloading set.'),
 (34,-1,'Lab before Bunker 3 reload','LAB-RLD2-UNL',false,'Height, moisture and full unloading set.'),
 (34,1,'Lab after Bunker 3 reload','LAB-RLD2-RE',false,'Height, moisture and full reloading set.'),
 (35,-1,'Tunnel readiness Lab check','LAB-TUN-PRE',false,'Tunnel readiness before loading.'),
 (41,-1,'Final QC — first grow-room stream','LAB-QC-FINAL',false,'Final QC for the first discharge stream.'),
 (42,-1,'Final QC — second discharge stream','LAB-QC-FINAL',false,'Final QC as configured for this stream.'),
 (43,-1,'Final QC — final discharge stream','LAB-QC-FINAL',false,'Final QC for full batch discharge.')
), pile_steps(step,pass,title,kind,checkpoint,description) as (values
 (0,'T0','T0','work',null,'First Turner pass. Take before and after photos for this pile. No Lab after T0.'),
 (1,'LAB_BEFORE_T1','Lab before T1','lab','LAB-T1-PRE','Sample this pile before its T1 pass.'),
 (2,'T1','T1','work',null,'Record this pile’s T1 pass and its own before and after photos.'),
 (3,'LAB_AFTER_T1','Lab after T1','lab','LAB-T1-POST','Record post-T1 moisture for this pile.'),
 (4,'REST','Rest after T1','rest',null,'Allow this pile its own 8-hour rest after T1 before starting T2.'),
 (5,'T2','T2','work',null,'After this pile’s rest. Take before and after photos. No Lab after T2.'),
 (6,'T3','T3','work',null,'Final Turner pass for this pile. Take before and after photos. No Lab after T3.')
), combined as (
  select ord*100 sort,line,title,case when ord=15 then 'lab' else kind end kind,
    case when kind in ('lab','lab_gate') or ord=15 then control else null end control,
    case when ord=15 then 'LAB-MOIST-DEC' else lab_checkpoint end lab_checkpoint,
    case when ord=15 then 'none' else photos end photos,ask,suggested_offset_minutes,
    case when kind not in ('lab','lab_gate') then control else 'Lab submits; GM approval releases the next process task in this stream.' end description,
    null::text pile,null::text turner_pass
  from originals where ord not between 24 and 28
  union all
  select o.ord*100+l.position,o.line,l.title,case when l.gate then 'lab_gate' else 'lab' end,
    l.readings,l.checkpoint,'none','none',o.suggested_offset_minutes,
    case when l.gate then 'Lab submits; GM approves before the associated process task.' else 'Record this Lab result separately from the process task.' end,null,null
  from extra_labs l join originals o on o.ord=l.anchor
  union all
  select 2400+(p.n-1)*10+s.step,'Turner · P'||p.n,'P'||p.n||' · '||s.title,s.kind,
    case when s.kind='lab' then 'Use this checkpoint’s readings for P'||p.n||'.' end,s.checkpoint,
    case when s.kind='work' then 'both' else 'none' end,case when s.kind='work' then 'machine' else 'none' end,
    null::int,s.description,'P'||p.n,s.pass
  from generate_series(1,6) p(n) cross join pile_steps s
)
insert into tk_sop_row(sop_id,ord,line,title,kind,control,lab_checkpoint,photos,ask,suggested_offset_minutes,description,pile,turner_pass)
select '14900000-0000-4000-8000-000000000001',row_number() over(order by sort),line,title,kind,control,lab_checkpoint,photos,ask,suggested_offset_minutes,description,pile,turner_pass
from combined;

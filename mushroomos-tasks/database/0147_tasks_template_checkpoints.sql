-- Resolve the source's LAB-04 / LAB-13 shorthand to the existing Lab register.
-- Only the newly supplied ready template is changed; batch snapshots stay intact.
update public.tk_sop_row set lab_checkpoint = case ord
  when 6 then 'LAB-BNK-PRE' when 16 then 'LAB-CM-USE' when 35 then 'LAB-TUN-LOAD' end
where sop_id = '14600000-0000-4000-8000-000000000001' and ord in (6,16,35);

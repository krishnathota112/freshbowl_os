update public.tk_sop_row set lab_checkpoint = case ord
  when 6 then 'LAB-04' when 16 then 'LAB-13' when 35 then null end
where sop_id = '14600000-0000-4000-8000-000000000001' and ord in (6,16,35);

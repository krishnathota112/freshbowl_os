-- s09 · The questions the admin is actually asked, in factory language.
--
-- Every rest is "material sits somewhere until the next thing happens to it". The question
-- names both ends, so she is answering something she knows rather than decoding a code.

update public.process_activity set admin_question = q.question, day_span_label = q.span
from (values
  ('FIB1-REST-1',
   'After the fibre goes into the bunker on Day 1, how long does it sit before you unload it?',
   'Day 2–3'),
  ('STRAW-REST-1',
   'After the straw goes into its bunker, how long does it sit before the next soak?',
   'Day 5'),
  ('STRAW-REST-2',
   'After the third soak, how long does the straw rest before it goes out to the yard?',
   'Day 7'),
  ('YD-REST',
   'After the piles are combined and given a water pass, how long does the mixed pile rest before the turner starts?',
   'Day 7'),
  ('P1-REST-1',
   'After the bunkers are filled, how long do they sit before the reload?',
   'Day 10–11'),
  ('P1-REST-2',
   'After the reload, how long do the bunkers sit before tunnel loading?',
   'Day 13–14'),
  ('TN-HOLD',
   'How long does the whole tunnel run last — conditioning, pasteurisation and cooling together?',
   'Day 16–21')
) as q(code, question, span)
where public.process_activity.code = q.code;

-- The working activities get a question too, so the schedule reads as instructions rather
-- than a schema dump.
update public.process_activity set admin_question = q.question
from (values
  ('FIB1-WEIGH','How much fibre does this batch need, and how much fits on one truck?'),
  ('FIB1-HOP-1','First hopper pass. Water is always on for this one.'),
  ('FIB1-HOP-2','Second hopper pass. Water or dry — the moisture check on Day 1 tells you which.'),
  ('FIB1-BUNK-LOAD','Which bunker does the wetted fibre go into?'),
  ('FIB1-UNLOAD','Unload from the bunker it went into on Day 1.'),
  ('FIB1-HOP-3','Hopper pass before the reload. Water or dry, from the Day-4 moisture check.'),
  ('FIB1-BUNK-RELOAD','Which bunker does it reload into? It must be a different one.'),
  ('STRAW-RECEIPT','Straw delivery — vehicle, driver, quantity.'),
  ('STRAW-BALE-CUT','Cut the bales open and remove the twine.'),
  ('STRAW-SOAK-1','First soak.'),
  ('STRAW-BUNK-STORE','Which bunker holds the straw between soaks?'),
  ('STRAW-SOAK-2','Second soak.'),
  ('STRAW-SOAK-3','Third soak.'),
  ('NMIX-ROTAVATE','Weigh and dry-mix the manure, gypsum and ammonium sulphate. No water.'),
  ('FIB1-YARD-UNLOAD','Bring the fibre out of the bunker onto the yard. How many piles?'),
  ('YD-NMIX-ADD','Add the nitrogen mix onto the fibre piles.'),
  ('YD-FLIP-1','First flip.'),
  ('YD-FLIP-2','Second flip.'),
  ('YD-HOP-COMBINE','Combine the piles into one and give it a water pass.'),
  ('STRAW-YARD-LOAD','Bring the straw piles out to the yard, beside the mixed pile.'),
  ('YD-FLIP-3','Flip the straw and fibre together.'),
  ('YD-FLIP-4','Second flip of the mixed material.'),
  ('TR-T0','First turner pass over every pile.'),
  ('TR-T1','Turner pass T1 — one pile at a time.'),
  ('TR-T2','Turner pass T2 — starts on a pile as soon as that pile finishes T1, on the second turner.'),
  ('P1-BUNK-LOAD','Which bunker does each line load into?'),
  ('P1-BUNK-RELOAD','Which bunker does each line reload into? It must differ from where it came from.'),
  ('TN-LOAD','Which tunnel does each line go into?'),
  ('TN-UNLOAD','Unload the tunnels.'),
  ('LAB-FIB-MOISTURE-1','Measure the moisture. This decides whether the next hopper pass uses water.'),
  ('LAB-FIB-MOISTURE-2','Measure the moisture again before the reload.'),
  ('LAB-LAGOON-1','Check the soak water before and after the first soak.'),
  ('LAB-LAGOON-2','Check the soak water for the second soak.'),
  ('LAB-LAGOON-3','Check the soak water for the third soak.'),
  ('LAB-BUNK-FILL','Full panel on each bunker after filling.'),
  ('LAB-BUNK-RELOAD','Full panel on each bunker after the reload.'),
  ('LAB-TUNNEL-LOAD','Full panel on each tunnel at loading.'),
  ('LAB-COMPOST-OUT','Compost-out quality — including colour and actinomycetes, which need photos.')
) as q(code, question)
where public.process_activity.code = q.code
  and public.process_activity.admin_question is null;

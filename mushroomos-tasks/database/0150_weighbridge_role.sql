-- 0150 (applied live 27 Sep as "0148_weighbridge_role") · A login role for the weighbridge (MushroomOS Weighbridge app). Its own transaction: a new enum value cannot
-- be used in the transaction that adds it. The role sees only weighments (0151); every other policy excludes it.
alter type public.app_role add value if not exists 'weighbridge';

# The owner's SOP reference table (H0 → H474)

Given by the owner on 27 Sep 2026 as the **format** he wants the SOP to be edited in ("I want the editing in this
format … kind of like Excel, where I will change the rows"). It is a reference, not a file to import. It comes from
the PROCESS-2026C worked example (H0 = Mon 31 Aug 2026 09:00); exact hours are the factory's current working
example, not rules. In the Tasks app the H-hour column is a reference only — nothing is timed or late.

| Time | H-hour | Process | Lab / control |
|---|---|---|---|
| 29 Aug ~23:00 | PRE-H0 | Raw material / bagasse weighment | Moisture, pH, EC, dry weight; advisory |
| 31 Aug 09:00 | H0 | Bagasse wetting + Hopper Pass 1 | Moisture, pH, EC, AFTER H1 |
| 31 Aug 12:00 | H3 | Material rest begins | — |
| 31 Aug 20:00 | H11 | Hopper Pass 2; dry or water branch | Moisture, pH, EC, AFTER H2 |
| 31 Aug 23:00 | H14 | Heap formation + rest | — |
| 01 Sep 11:00 | H26 | Before first bunker load / 2h bunker fill | LAB-04: moisture, pH, EC + evidence + GM gate |
| 01 Sep 13:00 | H28 | Conditioning begins | 45–55 °C; first trigger ≥58 °C or ≥60 h |
| 03 Sep 11:00 | H74 | Paddy preparation starts | Moisture + dry weight |
| 03 Sep 23:00 | H86 | Paddy soak 1 | pH, EC, TDS |
| 04 Sep 01:00 | H88 | Bunker unload / reload | Moisture, pH, EC |
| 04 Sep 21:00 | H108 | Paddy soak 2 | pH, EC, TDS |
| 05 Sep 19:00 | H130 | Chicken manure + minerals weighment | Nitrogen, Ash |
| 05 Sep 21:00 | H132 | Rotavator dry mix | No water |
| 05 Sep 22:00 | H133 | Moisture decision | ≥68% proceed; <67% correct/retest; 67–68% unresolved |
| 06 Sep 01:00 | H136 | First convergence; CM mix begins | LAB-13 gate; nitrogen + ash |
| 06 Sep 09:00 | H144–H146 (H1), H147–H149 (H2) | Water hopper pass + another hopper pass | Target ~73% moisture; <45–50 °C |
| 06 Sep 13:00 | H150 | Rest | 10 h |
| 07 Sep 01:00 | H160 | Second convergence | Paddy ready; two equal piles |
| 07 Sep 05:00 | H164 | Add conditioned bagasse + CM mix | — |
| 07 Sep 07:00 | H166 | Flip 1 + Flip 2 | Back-to-back |
| 07 Sep 15:00 | H174 | TURNER START | Six working piles; M1 + M2 |
| 07 Sep 15:00–21:00 | H174–H180 | T0 | NO LAB AFTER T0 |
| 07 Sep ~18:00 onward | H177+ | T1 interleaved with T0 | LAB BEFORE / AFTER T1 only |
| 08 Sep 00:00 | H183 | T1 window complete | Post-T1 moisture per pile |
| 08 Sep onward | H186.5+ | T2 after each pile's 8 h rest | NO LAB AFTER T2 |
| 08 Sep onward | H192.5+ | T3 | NO LAB AFTER T3 |
| 08 Sep 11:00 | H194 | Bunker 1 fill | P1+P2 |
| 08 Sep 13:00 | H196 | Bunker 2 fill | P3+P4 |
| 08 Sep 15:00 | H198 | Bunker 3 fill | P5+P6 |
| 11 Sep 04:00 | H259 | Bunker 1 reload | Height / moisture / full set |
| 11 Sep 06:00 | H261 | Bunker 2 reload | Same pattern |
| 11 Sep 08:00 | H263 | Bunker 3 reload | Same pattern |
| 13 Sep 21:00 | H324 | Tunnel loading stream 1 | Tunnel height + full lab gate |
| 13 Sep 23:00 | H326 | Tunnel loading stream 2 | — |
| 14 Sep 03:00 | H330 | Tunnel loading stream 3 | — |
| 14 Sep 05:00 | H332 | Tunnel filling complete | Tunnel process begins |
| 14–19 Sep | H332–H470 | Tunnel process | 144 h working standard |
| 19 Sep 23:00 | H470 | First grow-room stream | Final QC |
| 20 Sep 01:00 | H472 | Second stream discharge | Final QC as configured |
| 20 Sep 03:00 | H474 | Final stream discharge | Full batch discharge |

Lab gates in the main app (the same rule applies in Tasks): LAB-BNK-PRE (before first bunker loading),
LAB-CM-USE (chicken manure before use), LAB-BNK-LOAD (bunker loading), LAB-TUN-LOAD (tunnel loading); the moisture
decision LAB-MOIST-DEC is a DECISION (≥68 proceed, <67 mist, 67–68 unresolved). Source: `factory-sources/LAB-2026A-Laboratory-Process.docx`.

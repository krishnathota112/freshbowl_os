# Laboratory process questions — LAB-2026A appendix B

189 questions. What happens · in what order · how long · who · what waits on what · what it costs in time when it goes wrong.

Nothing here asks about labelling or bench convention. The software needs durations.

## A · One batch, end to end

*Before any screen is drawn, somebody has to be able to describe a batch from the laboratory’s side as a sequence of things that happen and take time. This section is that description.*

- **A-1** `TONIGHT` — Walk one batch from start to finish from the laboratory’s side. What is the first thing you do, and the last?
- **A-2** `TONIGHT` — How many times does the laboratory get involved in one batch? Roughly, not exactly.
- **A-3** `TONIGHT` — Across the whole batch, how many hours of laboratory work is that in total?
- **A-4** `TONIGHT` — Which of those involvements is the longest, and how long?
- **A-5** `TONIGHT` — Which one is the most likely to make production wait?
- **A-6** `WEEK 1` — Is the pattern the same for every batch, or does it change with the season or the raw material?
- **A-7** `WEEK 1` — How many days of the 20 does the laboratory touch the batch at all? Which days are quiet?
- **A-8** `WEEK 1` — Is there a day where the laboratory is doing several things for the same batch at once?
- **A-9** `WEEK 1` — What does a normal day look like when two batches are running?
- **A-10** `WEEK 1` — Is any part of the batch handled by someone other than the laboratory — production taking its own reading, for example?
- **A-11** `LATER` — What does the laboratory do for a batch that nobody has asked for, but that is done anyway?
- **A-12** `LATER` — What part of the batch does the laboratory feel it has no visibility of?

## B · How long each test takes

*The single most useful set of numbers in this whole document. Every scheduling decision the system makes depends on knowing how long a test takes — and "a test" means from sample in hand to a number that exists.*

- **B-1** `TONIGHT` — Moisture: how long from sample in hand to a number, start to finish?
- **B-2** `TONIGHT` — pH: how long?
- **B-3** `TONIGHT` — EC: how long?
- **B-4** `TONIGHT` — TDS: how long?
- **B-5** `TONIGHT` — Nitrogen: how long?
- **B-6** `TONIGHT` — Ash: how long?
- **B-7** `TONIGHT` — C:N — is it calculated from the above, or is it its own test with its own time?
- **B-8** `TONIGHT` — Dry weight: how long?
- **B-9** `TONIGHT` — The visual checks — smell, colour, squeeze, actinomycetes: how long, together?
- **B-10** `TONIGHT` — Heights — bunker, tunnel, shrunken: how long, and is it the laboratory that measures them or production?
- **B-11** `WEEK 1` — For each of the above: how much of that time is the machine working, and how much is a person working?
- **B-12** `WEEK 1` — Which of these can be left running unattended while something else is done?
- **B-13** `WEEK 1` — Which of these needs the technician to stand there for the whole time?
- **B-14** `WEEK 1` — If all the tests at one checkpoint are done together, is the total the sum of the parts, or less?
- **B-15** `WEEK 1` — Is the time different for the first sample of the day versus the fifth?
- **B-16** `LATER` — Which test would you most like to be faster, and what makes it slow?

## C · From sample to number — the gap that decides everything

*The system needs to know not how long a test takes, but how long production waits. Those are different numbers and the difference is where the whole schedule lives.*

- **C-1** `TONIGHT` — For each checkpoint: how long between the sample being taken and production being told the answer?
- **C-2** `TONIGHT` — Is that gap minutes, hours, or the next morning? Give the honest normal, not the best case.
- **C-3** `TONIGHT` — Which checkpoints have a gap long enough that production has already moved on by the time the number exists?
- **C-4** `TONIGHT` — Is production ever waiting, physically standing there, for a laboratory number? Which checkpoints?
- **C-5** `WEEK 1` — When production is waiting, what is the longest it has actually waited?
- **C-6** `WEEK 1` — Is the sample taken as soon as the material is ready, or at a fixed time?
- **C-7** `WEEK 1` — How long can a sample sit before it is tested without the number changing?
- **C-8** `WEEK 1` — Does the answer to that differ by test? Moisture especially.
- **C-9** `WEEK 1` — Is the number ever given verbally before it is written down anywhere?
- **C-10** `WEEK 1` — How much earlier could the laboratory be told a sample is coming, and would that help?
- **C-11** `LATER` — If the laboratory knew the whole day’s sampling schedule at 6am, what would change?
- **C-12** `LATER` — Which gap, if halved, would make the biggest difference to production?

## D · Sequence and dependencies — what waits on what

*This is the section that decides whether the system can schedule laboratory work at all, or only record it after the fact.*

- **D-1** `TONIGHT` — Which laboratory results must exist before production can move to the next step? Name them.
- **D-2** `TONIGHT` — For each of those, what physically happens if the result is not there yet — does the material sit, or does work continue?
- **D-3** `TONIGHT` — Is any laboratory test dependent on another test finishing first?
- **D-4** `WEEK 1` — Does the laboratory ever hold a sample until a related sample arrives so both can be run together?
- **D-5** `WEEK 1` — Is there a test that only makes sense if an earlier one came back a certain way?
- **D-6** `WEEK 1` — Does an out-of-range result change what is tested next, or only what production does next?
- **D-7** `WEEK 1` — Which laboratory work is time-critical — must happen within a window — and which can slide by a day?
- **D-8** `WEEK 1` — For the ones with a window, how wide is the window?
- **D-9** `WEEK 1` — What has to be prepared in advance — reagents, calibration, drying — and how long before?
- **D-10** `LATER` — Is anything tested that nothing downstream actually uses?

## E · What runs at the same time

*The process has real parallelism — paddy soaking alongside the main rail, six piles under two machines. The laboratory’s parallelism is what decides whether that is a problem.*

- **E-1** `TONIGHT` — Can the laboratory run more than one test at the same time? Which combinations?
- **E-2** `TONIGHT` — Can two different batches be tested in the same session?
- **E-3** `TONIGHT` — When six piles need the same test, are they done one after another or all together?
- **E-4** `WEEK 1` — How much longer does six piles take than one pile? Six times, or less?
- **E-5** `WEEK 1` — Is the paddy stream tested by the same person at the same bench as the main line?
- **E-6** `WEEK 1` — Does testing the paddy soak ever collide with testing the main line? What gives way?
- **E-7** `WEEK 1` — If two checkpoints fall due at the same hour, which one is done first, and who decides?
- **E-8** `WEEK 1` — Is there a queue today, and how long does it get?
- **E-9** `LATER` — What is the most the laboratory has ever had waiting at once?

## F · Equipment, and how many at once

*Capacity is a hard ceiling the system cannot schedule around unless it knows where it is.*

- **F-1** `TONIGHT` — How many samples can the oven hold at once?
- **F-2** `TONIGHT` — How many moisture meters are there, and how many people can use them at the same time?
- **F-3** `TONIGHT` — How many pH and EC meters?
- **F-4** `TONIGHT` — Is there one balance, or several?
- **F-5** `WEEK 1` — Which piece of equipment is the bottleneck on a busy day?
- **F-6** `WEEK 1` — How long does the oven take to be free again after a run?
- **F-7** `WEEK 1` — Does anything need to cool, settle or stabilise before the next use, and for how long?
- **F-8** `WEEK 1` — What happens when a meter is being calibrated — does testing stop?
- **F-9** `WEEK 1` — How often does calibration happen, and how long does it take?
- **F-10** `WEEK 1` — Is any test sent outside the factory? Which, and what is the turnaround in days?
- **F-11** `LATER` — If one more of any instrument were bought, which one, and how much time would it save?

## G · People, shifts and cover

*The system will ask somebody to do something at H317, which may be four in the morning. It needs to know whether anybody is there.*

- **G-1** `TONIGHT` — How many people work in the laboratory?
- **G-2** `TONIGHT` — What hours does the laboratory actually work? Start and end.
- **G-3** `TONIGHT` — Is there anybody in the laboratory at night?
- **G-4** `TONIGHT` — What happens to a checkpoint that falls due at 2am?
- **G-5** `TONIGHT` — Sundays and holidays — does the laboratory run?
- **G-6** `WEEK 1` — Can any of these tests be done by a production operator rather than a technician? Which?
- **G-7** `WEEK 1` — Who covers when the technician is on leave or sick?
- **G-8** `WEEK 1` — Is there a handover between shifts, and what is passed on?
- **G-9** `WEEK 1` — Does the same person do the sampling and the testing, or two people?
- **G-10** `WEEK 1` — How long does it take a new person to be trusted with each test?
- **G-11** `LATER` — Is there work the laboratory does that is not testing at all — cleaning, preparation, paperwork — and how many hours a day?

## H · The checkpoints, one at a time

*For each of the 25, the system needs the same four numbers. Answer them as a row per checkpoint rather than as prose — a table is fine, a scribbled list is fine.*

- **H-1** `TONIGHT` — For each checkpoint: how long does the whole thing take, sample to number?
- **H-2** `TONIGHT` — For each checkpoint: how many people are needed?
- **H-3** `TONIGHT` — For each checkpoint: does production wait, or carry on?
- **H-4** `TONIGHT` — For each checkpoint: how much warning does the laboratory need that it is coming?
- **H-5** `WEEK 1` — Which of the 25 are done at a fixed time of day regardless of the batch?
- **H-6** `WEEK 1` — Which of the 25 are done "when production calls"?
- **H-7** `WEEK 1` — Are any of the 25 done together as one visit to the floor?
- **H-8** `WEEK 1` — Are any of the 25 skipped in practice, and under what circumstances?
- **H-9** `WEEK 1` — Are any of the 25 done more often than the process says?
- **H-10** `WEEK 1` — Is there a checkpoint the laboratory does that is not in the list of 25?
- **H-11** `LATER` — Which of the 25 does the laboratory consider least useful?

## I · The Turner window

*Two readings, six piles, two machines, and a process that does not stop. This is the tightest timing in the whole batch and the one most likely to be got wrong in software.*

- **I-1** `TONIGHT` — Before T1 and after T1, six piles each — how long does the whole set of six take?
- **I-2** `TONIGHT` — Is the "before T1" set taken all at once, or pile by pile as each pile is about to be turned?
- **I-3** `TONIGHT` — How long before the T1 pass does the "before" sample need to be taken?
- **I-4** `TONIGHT` — How soon after a pile is turned is the "after" sample taken?
- **I-5** `TONIGHT` — Does the turner wait for the laboratory at any point, or never?
- **I-6** `WEEK 1` — If the laboratory is not ready, does T1 go ahead without the reading?
- **I-7** `WEEK 1` — Two machines turning at once — does that double the sampling load in the same hour?
- **I-8** `WEEK 1` — Is the sample taken from the pile before the machine reaches it, or after it has passed?
- **I-9** `WEEK 1` — Is a pile ever sampled twice because the first sample was taken at the wrong moment?
- **I-10** `WEEK 1` — How long does the whole T1 pass take across six piles, from the laboratory’s point of view?
- **I-11** `LATER` — Would the laboratory want a reading at T0, T2 or T3 if it were free? What would it tell you?

## J · Chicken manure and the 12-hour window

*The one rule in the process that is already known to be conditional. The system needs to know exactly what the condition is measured between.*

- **J-1** `TONIGHT` — Under 12 hours between arrival and use means no re-test. Is 12 the right number?
- **J-2** `TONIGHT` — Measured from arrival to what, exactly — unloading, mixing start, or something else?
- **J-3** `TONIGHT` — How long does the arrival test itself take, from lorry to number?
- **J-4** `TONIGHT` — Does the lorry wait for the arrival test, or is it unloaded first?
- **J-5** `WEEK 1` — If the manure sits longer than the window, is the full set repeated or only part of it?
- **J-6** `WEEK 1` — How often does manure actually sit longer than the window? Most loads, or rarely?
- **J-7** `WEEK 1` — Does manure arrive in one load or several, and does each load get its own test?
- **J-8** `WEEK 1` — How much notice does the laboratory get that manure is arriving?
- **J-9** `WEEK 1` — Does covered versus uncovered storage change how fast it changes?
- **J-10** `LATER` — Has a load ever been rejected on arrival, and what happened to the batch that day?

## K · When something goes wrong, and what it costs in time

*Rework is a duration, and the system has to be able to plan for it. Every answer here should be a number of hours.*

- **K-1** `TONIGHT` — A result comes back out of range. What happens next, and how long does it take?
- **K-2** `TONIGHT` — A retest — how long from deciding to retest to having the new number?
- **K-3** `TONIGHT` — Moisture is low and misting is needed. How long is the misting, and how long before you re-measure?
- **K-4** `TONIGHT` — After misting, is the re-measure the full test again, or a quicker check?
- **K-5** `WEEK 1` — A sample is lost or spoiled. How long to get another one?
- **K-6** `WEEK 1` — An instrument fails mid-batch. What happens, and how long is the delay?
- **K-7** `WEEK 1` — Power fails during a drying run — is the result void, and how much time is lost?
- **K-8** `WEEK 1` — How often does a checkpoint have to be repeated? Once a batch, once a month?
- **K-9** `WEEK 1` — A batch is held longer than planned. Do any checkpoints have to be repeated, and which?
- **K-10** `WEEK 1` — How long does the laboratory keep a sample in case it is needed again?
- **K-11** `LATER` — What is the longest a laboratory problem has ever delayed a batch?

## L · Decisions the laboratory makes

*Some readings are recorded. Some readings change what happens next. The system must know which is which, who decides, and how long the deciding takes.*

- **L-1** `TONIGHT` — Which laboratory readings actually change what production does next? Name them.
- **L-2** `TONIGHT` — The moisture decision: at or above 68 proceed, below 67 mist. What happens between 67 and 68?
- **L-3** `TONIGHT` — Who makes that call — the technician, the laboratory in charge, or production?
- **L-4** `TONIGHT` — How long does that decision normally take once the number exists?
- **L-5** `TONIGHT` — Does anyone have to approve a laboratory result before production acts on it?
- **L-6** `WEEK 1` — If yes, who, and how long does that normally take?
- **L-7** `WEEK 1` — At night and at weekends, who makes the call?
- **L-8** `WEEK 1` — Is a decision ever made on a number before it is formally recorded?
- **L-9** `WEEK 1` — Does production ever overrule the laboratory? What happens then?
- **L-10** `WEEK 1` — How is the decision communicated — phone, in person, a book?
- **L-11** `LATER` — Is there a decision the laboratory would like to make but currently cannot?

## M · What stops production, and for how long

*Four checkpoints in the standard are marked as gates. This section checks whether they really are, and what happens on the floor when one bites.*

- **M-1** `TONIGHT` — Which laboratory results, if missing, actually stop production today?
- **M-2** `TONIGHT` — When that happens, what does production do — wait, or continue and record it?
- **M-3** `TONIGHT` — How long has production actually been stopped by the laboratory, at most?
- **M-4** `TONIGHT` — Can anybody let production continue without the result? Who?
- **M-5** `WEEK 1` — When that override happens, is anything written down?
- **M-6** `WEEK 1` — Are there results the laboratory thinks should stop production but currently do not?
- **M-7** `WEEK 1` — Are any of the four gates not really gates in practice?
- **M-8** `WEEK 1` — Would a warning an hour before a gate is due be useful, or noise?
- **M-9** `LATER` — Should a result ever be too old to rely on? After how long?

## N · How the number travels today

*Understanding the current path from bench to decision is what tells us what the app has to replace, and what it must not break.*

- **N-1** `TONIGHT` — When a number exists, how does the person who needs it find out?
- **N-2** `TONIGHT` — How long does that take — immediately, at the end of the shift, next morning?
- **N-3** `TONIGHT` — Where is the number written down first?
- **N-4** `TONIGHT` — Does the same number get written more than once, in more than one place?
- **N-5** `WEEK 1` — Who else sees it, and when?
- **N-6** `WEEK 1` — Is anything typed into a computer today? What, and by whom, and when?
- **N-7** `WEEK 1` — At the end of a batch, is there a summary of all its laboratory results anywhere?
- **N-8** `WEEK 1` — How long does producing that summary take?
- **N-9** `WEEK 1` — Has a number ever gone missing between the bench and the person who needed it?
- **N-10** `WEEK 1` — When an out-of-range number is reported, what happens to the person who reported it — nothing, a question, or a problem? Answer this one plainly; it predicts the quality of every number the system will collect.
- **N-11** `LATER` — What does management ask the laboratory for, and how long does answering take?

## O · What makes a test take longer than usual

*Averages are useless for scheduling if the variance is large. This section is about the spread, not the middle.*

- **O-1** `TONIGHT` — On a bad day, how much longer does a moisture result take than on a good day?
- **O-2** `WEEK 1` — What is the usual cause of a delay — waiting for the sample, waiting for equipment, or waiting for a person?
- **O-3** `WEEK 1` — Does the time of day change how long things take?
- **O-4** `WEEK 1` — Does the weather change anything — humidity, rain, the material being wetter?
- **O-5** `WEEK 1` — Is the first batch of a season slower than a settled one?
- **O-6** `WEEK 1` — Does a new technician change these times, and by how much?
- **O-7** `WEEK 1` — Which test has the most unpredictable duration?
- **O-8** `LATER` — If you had to promise production a time for each result, what would you promise?

## P · Capacity — where the laboratory breaks

*The factory intends to run more batches. The system should be able to say, in advance, when that stops being possible.*

- **P-1** `TONIGHT` — How many batches can run at once before the laboratory cannot keep up?
- **P-2** `TONIGHT` — On the busiest day of a batch, how many hours of laboratory work is there?
- **P-3** `WEEK 1` — Which day of the 20 is the busiest for the laboratory, and why?
- **P-4** `WEEK 1` — If two batches were offset by a few days, would that help or make it worse?
- **P-5** `WEEK 1` — What is the first thing that would be dropped if the laboratory ran out of time?
- **P-6** `WEEK 1` — Is any of the current work done outside normal hours because there is no room in the day?
- **P-7** `LATER` — At what number of simultaneous batches does the laboratory need another person?
- **P-8** `LATER` — At what number does it need another instrument?

## Q · What the laboratory is waiting on from everybody else

*The laboratory is not only a source of delay; it is usually also a victim of one. The system can fix some of these for free.*

- **Q-1** `TONIGHT` — What does the laboratory most often wait for that is not its own doing?
- **Q-2** `TONIGHT` — How much notice does the laboratory get before a sample is needed today?
- **Q-3** `TONIGHT` — How much notice would be enough?
- **Q-4** `WEEK 1` — Is the laboratory ever told about a batch after it has already started?
- **Q-5** `WEEK 1` — Does the laboratory know the plan for the next 24 hours? How?
- **Q-6** `WEEK 1` — When production changes the plan, how does the laboratory find out?
- **Q-7** `WEEK 1` — Is the laboratory ever asked for a test that was not planned, and how often?
- **Q-8** `LATER` — What one piece of information, given earlier, would save the laboratory the most time?

## R · Tomorrow — what the app has to do on day one

*These are the only questions that must be answered before the APK is built. Everything above can be answered during the first batch; these cannot.*

- **R-1** `TONIGHT` — What is the batch identifier for tomorrow’s batch? The exact text, as it will be said out loud.
- **R-2** `TONIGHT` — What stage will that batch be at when the app is handed over?
- **R-3** `TONIGHT` — Which checkpoints will realistically be hit in the first 48 hours?
- **R-4** `TONIGHT` — How many phones, and who gets which — laboratory, operator, supervisor?
- **R-5** `TONIGHT` — Who trains them, and how long does that take?
- **R-6** `TONIGHT` — Is there signal where the samples are taken and where the tests are done?
- **R-7** `TONIGHT` — Will they also keep the paper record tomorrow, in parallel? (They should.)
- **R-8** `TONIGHT` — If the app is wrong or confusing tomorrow, who do they call?
- **R-9** `TONIGHT` — If the app fails entirely, does work stop or continue on paper?
- **R-10** `TONIGHT` — What single thing, at the end of tomorrow, would make you call it a success?

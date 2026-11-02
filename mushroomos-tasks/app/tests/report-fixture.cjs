module.exports={batch:{id:'proof',name:'Sample batch — QA only',status:'active'},generated_at:'2026-09-28T18:30:00Z',rows:[
 {id:'task1',ord:1,title:'Bagasse conditioning',line:'Main',kind:'work',status:'done',photos:'both',before_photos:1,after_photos:2,report_section:'STAGE 0 — BAGASSE',planned_duration_minutes:2160,suggested_at:'2026-09-25T17:30:00Z',started_at:'2026-09-25T17:30:00Z',ended_at:'2026-09-27T06:00:00Z',description:'Wetting and conditioning',note:'Completed; good moisture.'},
 {id:'task2',ord:2,title:'Hopper pass',line:'Main',kind:'work',status:'todo',photos:'both',planned_duration_minutes:210,suggested_at:'2026-09-28T17:30:00Z',description:'Water as required.'},
 {id:'task3',ord:3,title:'T1 P1',line:'Turner · P1',pile:'P1',turner_pass:'T1',kind:'work',status:'running',photos:'both',before_photos:1,planned_duration_minutes:90,suggested_at:'2026-09-28T15:30:00Z',started_at:'2026-09-28T16:00:00Z',report_section:'TURNER — EACH PILE'},
 {id:'task4',ord:4,title:'After T1 Lab',line:'Turner · P1',pile:'P1',turner_pass:'LAB_AFTER_T1',kind:'lab_gate',status:'submitted',photos:'none',ended_at:'2026-09-28T17:00:00Z',report_section:'TURNER — EACH PILE',control:'Moisture, pH',readings:[{round:1,label:'Moisture',value:'72',unit:'%'},{round:2,label:'Moisture',value:'73',unit:'%'}]},
 {id:'task5',ord:5,title:'Earlier preparation',line:'Main',kind:'work',status:'done_before',photos:'none'},
 {id:'task6',ord:6,title:'Unscheduled check',line:'Main',kind:'lab',status:'todo',photos:'none',planned_duration_minutes:0,description:'No scheduled date yet.'},
 {id:'task7',ord:7,title:'Rest',line:'Main',kind:'rest',status:'todo',photos:'none',planned_duration_minutes:null,suggested_at:'2026-09-30T04:00:00Z'}
]};

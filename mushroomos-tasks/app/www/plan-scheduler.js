/* Planning only: no actual timestamps, statuses or execution gates are changed. */
(function () {
  function group(r) { return r.pile ? 'pile:' + r.pile : 'stream:' + (r.line || 'Main'); }
  function number(n) { return typeof n === 'number' && Number.isFinite(n); }
  function previous(rows, index, scope) {
    for (var i=index-1;i>=0;i--) if(scope==='batch' || group(rows[i])===group(rows[index])) return i;
    return -1;
  }
  function end(r) { return number(r.suggested_offset_minutes) && Number.isInteger(r.planned_duration_minutes) ? r.suggested_offset_minutes+r.planned_duration_minutes : null; }
  function recalculate(rows) {
    var issues=[];
    rows.forEach(function(r,i){
      if(r._locked || !r.schedule_mode || r.schedule_mode==='fixed') return;
      var p=previous(rows,i,r.schedule_mode),finish=p<0?null:end(rows[p]);
      if(finish==null){r.suggested_offset_minutes=null;issues.push('Row '+(i+1)+': '+(p<0?'set a starting date for this stream.':'set the start and duration of row '+(p+1)+'.'));}
      else r.suggested_offset_minutes=finish+(r.schedule_gap_minutes || 0);
    });
    return issues;
  }
  function link(rows,scope) {
    rows.forEach(function(r,i){
      if(r._locked) return;
      var p=previous(rows,i,scope),old=r.suggested_offset_minutes;
      // Keep the existing pre-batch preparation and the zero-offset wetting anchor.
      if(p<0 || number(old) && old<0 || old===0 && number(rows[p].suggested_offset_minutes) && rows[p].suggested_offset_minutes<0){r.schedule_mode='fixed';r.schedule_gap_minutes=0;}
      else {r.schedule_mode=scope;r.schedule_gap_minutes=0;}
    });
    return recalculate(rows);
  }
  function shiftFixed(rows,index,delta,scope) {
    if(!number(delta) || delta===0) return 0;
    var count=0;
    for(var i=index+1;i<rows.length;i++){
      if(scope!=='batch' && group(rows[i])!==group(rows[index])) continue;
      // A recorded row is a boundary: never move history or propagate a change through it.
      if(rows[i]._locked) break;
      if((!rows[i].schedule_mode || rows[i].schedule_mode==='fixed') && number(rows[i].suggested_offset_minutes)){
        rows[i].suggested_offset_minutes+=delta;count++;
      }
    }
    return count;
  }
  function edit(rows,index,before,scope) {
    var r=rows[index],oldStart=before.suggested_offset_minutes,newStart=r.suggested_offset_minutes;
    if(r._locked) return recalculate(rows);
    var dateChanged=oldStart!==newStart,oldDuration=before.planned_duration_minutes,newDuration=r.planned_duration_minutes;
    var durationChanged=oldDuration!==newDuration;
    if(dateChanged){
      // A deliberately entered calendar time is the new anchor. Following automatic
      // rows stay linked to its finish. This also preserves legacy timestamp seconds.
      r.schedule_mode='fixed';r.schedule_gap_minutes=0;
      if(number(oldStart) && number(newStart)) shiftFixed(rows,index,newStart-oldStart,scope);
    }
    if(durationChanged && Number.isInteger(newDuration)){
      // Existing manual schedules have no duration yet: use the next later planned
      // start only as the old spacing, never as a stored or actual task duration.
      var baseline=oldDuration;
      if(!Number.isInteger(baseline) && number(newStart)){
        for(var j=index+1;j<rows.length;j++){
          if(scope!=='batch' && group(rows[j])!==group(r))continue;
          if(rows[j]._locked)break;
          if(number(rows[j].suggested_offset_minutes) && rows[j].suggested_offset_minutes>=newStart){baseline=rows[j].suggested_offset_minutes-newStart;break;}
        }
      }
      if(Number.isInteger(baseline)) shiftFixed(rows,index,newDuration-baseline,scope);
    }
    return recalculate(rows);
  }
  window.TK.scheduler={group:group,previous:previous,end:end,recalculate:recalculate,link:link,edit:edit};
})();

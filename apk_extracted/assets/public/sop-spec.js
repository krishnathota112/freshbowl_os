/**
 * Mushroom OS - per-stage mandatory field spec.
 *
 * Transcribed from the MANDATORY_FIELDS map that was embedded (unusably) in
 * D:\app_new\firestore.rules. It is a more complete per-stage field list than
 * the HTML screens currently implement - several entries here have no
 * corresponding input yet (flagged below). Kept as the single source of truth
 * for what each stage must capture, so it can drive both client validation and
 * the Firestore write payload.
 *
 * `page` maps each SOP stage id to the screen that implements it.
 */
window.SOP_SPEC = {
  '0A':          { page: 'stage_0A.html',  fields: ['oldBagasseWeightKg', 'newBagasseWeightKg', 'phCorrectionWithLime', 'flippingsConfirmed2x', 'targetMoistureRange', 'hopperFullWaterPassConfirmed', 'heapHeightM', 'restStartTime', 'restDurationHrs'] },
  '0B':          { page: 'stage_0B.html',  fields: [] },
  '0C':          { page: 'stage_0C.html',  fields: ['currentTempC', 'moisturePct', 'conditionResult', 'loaderUnloadingConfirmed', 'flippingConfirmed', 'fillHeightM', 'noWaterAddedConfirmed'] },
  '0D':          { page: 'stage_0D.html',  fields: ['fillHeightM', 'reloadTimestamp', 'currentTempC', 'hoursElapsedSinceReload', 'triggerMetBy', 'triggerMetTime', 'unloadAuthorized', 'authorizedBy'] },
  '1A':          { page: 'stage_1A.html',  fields: ['chickenManureKg', 'gypsumKg', 'asKg', 'rotovatorPassConfirmed', 'lumpFreeCheck'] },
  '1B':          { page: 'stage_1B.html',  fields: ['cmMixAddedConfirmed', 'loaderMixingConfirmed', 'flippings2xConfirmed', 'targetMoisturePct', 'currentTempC'] },
  '1C-A':        { page: 'stage_1CA.html', fields: ['baleCuttingConfirmed', 'plasticRemovalConfirmed', 'dilutionRatio', 'ecValue', 'phValue', 'tilting1DurationHrs', 'drainConfirmed', 'pushFreshLagoonConfirmed', 'tilting2DurationHrs', 'transferToPlatformConfirmed', 'flippings2xConfirmed', 'pileHeightM', 'restDurationHrs'] },
  '1C-B':        { page: 'stage_1CB.html', fields: ['mixAddedConfirmed', 'flippingPass1Confirmed', 'flippingPass2Confirmed', 'targetMoisturePct', 'pileBreakConfirmed', 'flippingConfirmed', 'heapFormedConfirmed'] },
  '1A-phase':    { page: 'phase_1A.html',  fields: ['loaderFlippingConfirmed', 'dryTurnerPassT0Confirmed', 'timestampT0', 'dryTurnerPassT1Confirmed', 'timestampT1'] },
  '1B-phase':    { page: 'phase_1B.html',  fields: ['hoursSinceT0', 'targetMoisturePct', 'passConfirmed'] },
  '1C-phase':    { page: 'phase_1C.html',  fields: ['fillHeightM', 'noWaterAddedConfirmed', 'immediatelyAfterT2Confirmed'] },
  '1D-A-phase':  { page: 'phase_1DA.html', fields: ['currentTempC', 'durationSinceLastStageHrs', 'loadIntoNewBunkerConfirmed', 'fillHeightM'] },
  '1D-B-phase':  { page: 'phase_1DB.html', fields: ['currentTempC', 'durationHrs', 'moistureCorrectionApplied', 'targetMoisturePct', 'loadIntoNewBunkerConfirmed', 'fillHeightM', 'tunnelMoveAuthorized'] },
  '2A-phase':    { page: 'phase_2A.html',  fields: ['netTightnessCheck', 'probesCleanedHungConfirmed', 'highPressureWashConfirmed', 'foldDirtStitchDamageCheck', 'pullingNet6mAtWynchConfirmed'] },
  '2B-phase':    { page: 'phase_2B.html',  fields: ['hoursSinceReload', 'fillHeightM'] },
  '2C-phase':    { page: 'phase_2C.html',  fields: ['elapsedHrs', 'currentTempC'] },
  '2D-phase':    { page: 'phase_2D.html',  fields: ['currentTempC', 'operatorName', 'timestamp'] },
};

/**
 * SOP thresholds, from the process flowchart's "Targets & Critical Parameters"
 * legend. Advisory only - the app must never block submission on a value being
 * out of range, it only records and flags.
 */
window.SOP_TARGETS = {
  moistureBagassePreWet: { min: 68, max: 69, unit: '%' },
  moistureCmMix:         { min: 73, max: 73, unit: '%' },
  moistureFinalMix:      { min: 73, max: 74, unit: '%' },
  moistureT2Windrow:     { min: 73, max: 75, unit: '%' },
  compostTempReload1:    { min: 73, max: 74, unit: '°C' },
  compostTempReload2:    { min: 72, max: 72, unit: '°C' },
  tunnelLoadingTrigger:  { min: 70, max: 70, unit: '°C', durationHrs: 44 },
  tunnelUnloadingTemp:   { min: 24, max: 24, unit: '°C' },
  ecTarget:              { max: 1.5 },
  phTarget:              { min: 7, max: 7 },
  bunkerHt1st:           { min: 2.6, max: 2.7, unit: 'm' },
  bunkerHt2nd:           { min: 2.2, max: 2.4, unit: 'm' },
  bunkerHtReload:        { min: 2.5, max: 2.6, unit: 'm' },
};

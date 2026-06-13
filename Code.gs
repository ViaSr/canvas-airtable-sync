

const P = PropertiesService.getScriptProperties();
const CFG = {
  canvasMode: P.getProperty('CANVAS_MODE'),     // 'mock' or 'live'
  canvasBase: P.getProperty('CANVAS_BASE'),     // live mode only
  canvasToken: P.getProperty('CANVAS_TOKEN'),   // live mode only
  courseId: P.getProperty('CANVAS_COURSE_ID'),  // live mode only
  airtableBase: P.getProperty('AIRTABLE_BASE_ID'),
  airtableToken: P.getProperty('AIRTABLE_TOKEN'),
  alertEmail: P.getProperty('ALERT_EMAIL'),
};

function syncLearners() {
  const started = new Date();
  try {
    const enrollments = getEnrollments_();

    // Learners
    const records = enrollments.map(function (e) {
      return { fields: {
        'Name': e.user ? e.user.name : 'Unknown',
        'Canvas User ID': e.user_id,
        'Current Score': e.grades ? e.grades.current_score : null,
        'Last Activity': e.last_activity_at,
        'Last Synced': started.toISOString(),
        'Cohort': e.course_name,
      }};
    });
    upsertAirtable_('Learners', records, ['Canvas User ID']);

    const cohorts = {};
    enrollments.forEach(function (e) {
      if (e.course_name && !cohorts[e.course_name]) {
        cohorts[e.course_name] = { fields: {
          'Name': e.course_name,
          'Canvas Course ID': e.course_id,
        }};
      }
    });
    upsertAirtable_('Cohorts',
      Object.keys(cohorts).map(function (k) { return cohorts[k]; }), ['Name']);

    logRun_('OK', records.length, '');
  } catch (err) {
    logRun_('FAIL', 0, String(err));
    MailApp.sendEmail(CFG.alertEmail, 'Canvas->Airtable sync FAILED', String(err));
    throw err;
  }
}


function getEnrollments_() {
  if (String(CFG.canvasMode).toLowerCase() === 'live') {
    return canvasGet_(
      '/api/v1/courses/' + CFG.courseId +
      '/enrollments?type[]=StudentEnrollment&per_page=100'
    );
  }
  return mockEnrollments_();
}

function mockEnrollments_() {
  // Shaped exactly like Canvas's documented enrollments response:
  var names = ['Ava Brooks', 'Marcus Lee', 'Priya Natarajan',
               'Diego Ramos', 'Tasha Wright', 'Sam Okafor'];
  var scores = [92, 67, 81, 54, 88, 73];
  var now = Date.now();
  return names.map(function (n, i) {
    return {
      user_id: 1001 + i,
      user: { name: n },
      grades: { current_score: scores[i] },
      last_activity_at: new Date(now - (i * 3 + 1) * 86400000).toISOString(),
      course_name: i < 3 ? 'Cohort A — IT Support' : 'Cohort B — Data Center',
      course_id: i < 3 ? 501 : 502,
    };
  });
}

function canvasGet_(path) {
  const res = UrlFetchApp.fetch(CFG.canvasBase + path, {
    headers: { Authorization: 'Bearer ' + CFG.canvasToken },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Canvas ' + res.getResponseCode() + ': ' +
      res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

//Airtable

function upsertAirtable_(table, records, mergeOn) {
  for (var i = 0; i < records.length; i += 10) { // Airtable: max 10/request
    const res = UrlFetchApp.fetch(
      'https://api.airtable.com/v0/' + CFG.airtableBase + '/' + encodeURIComponent(table), {
      method: 'patch',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CFG.airtableToken },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        performUpsert: { fieldsToMergeOn: mergeOn },
        records: records.slice(i, i + 10),
        typecast: true,
      }),
    });
    if (res.getResponseCode() >= 300) {
      throw new Error('Airtable ' + res.getResponseCode() + ': ' +
        res.getContentText().slice(0, 300));
    }
  }
}

function logRun_(status, count, error) {
  const res = UrlFetchApp.fetch(
    'https://api.airtable.com/v0/' + CFG.airtableBase + '/Sync%20Log', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CFG.airtableToken },
    muteHttpExceptions: true,
    payload: JSON.stringify({ records: [{ fields: {
      'Run Time': new Date().toISOString(),
      'Status': status,
      'Records Synced': count,
      'Error Message': error,
    }}], typecast: true }),
  });
  if (res.getResponseCode() >= 300) {
    // Never throw — logging must not crash the sync — but do surface it.
    Logger.log('Sync Log write failed: ' + res.getResponseCode() + ' ' +
               res.getContentText().slice(0, 300));
  }
}

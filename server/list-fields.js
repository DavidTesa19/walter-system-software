// `?fields=activity` on a subject or zakázka list returns only what the change
// bubbles need (client/src/activity/ActivityContext.tsx): which rows exist, in
// which state, when they last changed and by whom. The client polls every list
// of every section for these counts, so full rows (names, notes, trees, joined
// subject fields) were most of the app's traffic.
//
// It is a response filter on the existing list routes, not a new route: the
// section guards and the routes' own logic apply unchanged.

export const ACTIVITY_LIST_FIELDS = Object.freeze([
  'id',
  'status',
  'created_at',
  'updated_at',
  'last_activity',
  'created_by_user_id',
  'updated_by_user_id',
]);

// /api/client-entities, /api/projects/tiper-commissions, ... (the list itself,
// not /:id or its sub-routes).
const LIST_PATH = /^\/api\/(?:(?:projects|growth)\/)?(?:client|partner|tiper)-(?:entities|commissions)\/?$/;

export const isActivityListRequest = (req) =>
  req.method === 'GET' && req.query?.fields === 'activity' && LIST_PATH.test(req.path);

export const pickActivityFields = (row) => {
  if (!row || typeof row !== 'object') return row;
  const picked = {};
  for (const field of ACTIVITY_LIST_FIELDS) {
    if (row[field] !== undefined) picked[field] = row[field];
  }
  return picked;
};

export const activityListFields = (req, res, next) => {
  if (!isActivityListRequest(req)) return next();
  const json = res.json.bind(res);
  res.json = (body) => json(Array.isArray(body) ? body.map(pickActivityFields) : body);
  return next();
};

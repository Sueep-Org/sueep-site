export function getAnonId() {
  const key = 'ai_estimator_anon_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'anon-' + Math.random().toString(16).slice(2) + Date.now();
    localStorage.setItem(key, id);
  }
  return id;
} 
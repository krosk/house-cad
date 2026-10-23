// One load per key: a finished result is kept, and calls made while a load is in flight share
// its promise. The in-flight entry is registered before `load` runs, so concurrent callers can
// never slip past it (the AR furniture once lost this to an `await` before the entry was set:
// every item at startup loaded and decoded its own copy of a model, with its own textures,
// docs/ar-survey.md "Performance notes"). A failed load is forgotten, so a later call retries.
export function onceByKey(load) {
  const done = new Map(), pending = new Map();
  const get = (key) => {
    if (done.has(key)) return Promise.resolve(done.get(key));
    if (pending.has(key)) return pending.get(key);
    const p = Promise.resolve().then(() => load(key))
      .then((value) => { done.set(key, value); return value; })
      .finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  };
  get.cached = (key) => done.get(key);
  return get;
}

(function () {
  var KEY = 'neuroagi:theme';
  var DEFAULT = 'aurora';
  var IDS = [
    'aurora',
    'warm-clinic',
    'clinical-teal',
    'midnight-indigo',
    'arctic-slate',
    'forest-sage',
  ];

  function resolve(id) {
    return IDS.indexOf(id) >= 0 ? id : DEFAULT;
  }

  function current() {
    var stored = '';
    try {
      stored = localStorage.getItem(KEY) || '';
    } catch (err) {
      stored = '';
    }
    return resolve(stored);
  }

  function apply(id, persist) {
    var next = resolve(id);
    document.documentElement.setAttribute('data-theme', next);
    if (persist) {
      try {
        localStorage.setItem(KEY, next);
      } catch (err) {
        /* ignore quota / private-mode */
      }
    }
    return next;
  }

  apply(current(), false);

  window.NeuroAGITheme = {
    KEY: KEY,
    DEFAULT: DEFAULT,
    IDS: IDS,
    resolve: resolve,
    current: current,
    apply: apply,
  };
})();

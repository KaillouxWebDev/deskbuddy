import { EventEmitter } from 'node:events';

/**
 * État central partagé entre les modules et poussé aux écrans via WebSocket.
 * - set/update : modifie une clé d'état et émet un "patch"
 * - event : émet un événement ponctuel (toast, alerte...)
 * - register/dispatch : actions envoyées par l'écran
 */
export function createStore() {
  const state = {};
  const actions = new Map();
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  let seq = 0;

  const store = {
    state,
    get: (key) => state[key],
    set(key, value) {
      state[key] = value;
      bus.emit('patch', key, value);
    },
    update(key, partial) {
      store.set(key, { ...(state[key] || {}), ...partial });
    },
    event(event) {
      bus.emit('event', { id: `${Date.now()}-${seq++}`, at: Date.now(), ...event });
    },
    /** sticky : la notif reste affichée jusqu'à ce qu'on la ferme (utile si l'écran était en veille). */
    toast(level, title, text = '', { sticky = false } = {}) {
      store.event({ kind: 'toast', level, title, text, sticky });
    },
    register(name, fn) {
      actions.set(name, fn);
    },
    async dispatch(name, payload) {
      const fn = actions.get(name);
      if (!fn) throw new Error(`Action inconnue : ${name}`);
      return fn(payload || {});
    },
    on: (name, fn) => bus.on(name, fn),
    off: (name, fn) => bus.off(name, fn),

    /**
     * Vue « jetable » du store pour les modules qui dépendent de la position (avions, météo...).
     * stop() coupe leurs minuteries et ignore les réponses réseau qui arriveraient après coup,
     * pour qu'un changement de position reparte proprement sans redémarrer le serveur.
     */
    scope() {
      let alive = true;
      const timers = [];
      const subs = [];
      return {
        state,
        get: store.get,
        set: (k, v) => alive && store.set(k, v),
        update: (k, p) => alive && store.update(k, p),
        event: (e) => alive && store.event(e),
        toast: (...a) => alive && store.toast(...a),
        register: store.register,
        dispatch: store.dispatch,
        on(name, fn) {
          bus.on(name, fn);
          subs.push([name, fn]);
        },
        off: store.off,
        every(fn, ms) {
          timers.push(setInterval(fn, ms));
        },
        get alive() {
          return alive;
        },
        stop() {
          alive = false;
          timers.forEach(clearInterval);
          subs.forEach(([n, fn]) => bus.off(n, fn));
        }
      };
    }
  };
  return store;
}

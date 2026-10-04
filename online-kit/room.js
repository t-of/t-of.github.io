// online-kit/room.js — Firebase Realtime Database を使った「部屋」の共通部品。
// ゲームのルールを知らない。使い方とデータの形は README.md。
// 正本はここ（online-kit）。アプリで使うときはコピーして `online.js` などから import する。

const FIREBASE_VERSION = '10.14.1';

// 公開してよい値（RULES.md §1: Firebase の web 用 apiKey は公開前提）。守りは database.rules.json。
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyATJUNY36VJFK9RxWdkXt9doy6RC2heFfA',
  authDomain: 'tof-online.firebaseapp.com',
  databaseURL: 'https://tof-online-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'tof-online',
  storageBucket: 'tof-online.firebasestorage.app',
  messagingSenderId: '697007095211',
  appId: '1:697007095211:web:84fca5872f16a2260c66ee',
};

// 部屋コードの文字（0 O 1 I L を除いた31字）
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24時間たった部屋は上書きしてよい（rules と合わせる）

let fbPromise = null; // Firebase の動的 import は「通信で遊ぶ」を押したときだけ（圏外の起動を壊さないため）

function loadFirebase() {
  if (!fbPromise) {
    fbPromise = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
      const [{ initializeApp }, authMod, dbMod] = await Promise.all([
        import(/* webpackIgnore: true */ `${base}firebase-app.js`),
        import(/* webpackIgnore: true */ `${base}firebase-auth.js`),
        import(/* webpackIgnore: true */ `${base}firebase-database.js`),
      ]);
      const app = initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = dbMod.getDatabase(app);
      return { app, auth, authMod, db, dbMod };
    })();
  }
  return fbPromise;
}

async function ensureSignedIn(fb) {
  if (fb.auth.currentUser) return fb.auth.currentUser;
  await fb.authMod.signInAnonymously(fb.auth);
  return new Promise((resolve, reject) => {
    const unsub = fb.authMod.onAuthStateChanged(
      fb.auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user);
        }
      },
      (err) => {
        unsub();
        reject(err);
      },
    );
  });
}

function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i += 1) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function isValidCode(code) {
  return typeof code === 'string' && CODE_RE.test(code);
}

function sanitizeName(raw) {
  const s = String(raw == null ? '' : raw)
    .replace(/[<>&"']/g, '')
    .trim()
    .slice(0, 10);
  return s || '名無し';
}

function isExpiredMeta(meta) {
  return !meta || typeof meta.createdAt !== 'number' || meta.createdAt < Date.now() - ROOM_TTL_MS;
}

// 「みんなのスマホで」のリンク（#room=ABCD）の作り・読み
function roomLinkFor(code) {
  return `${location.origin}${location.pathname}#room=${code}`;
}

function roomCodeFromHash(hash) {
  const m = /^#room=([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4})$/.exec(hash || '');
  return m ? m[1] : null;
}

class Room {
  constructor({ fb, code, uid, game, isHost }) {
    this.fb = fb;
    this.code = code;
    this.uid = uid;
    this.game = game;
    this.isHost = isHost;
    this._unsubs = [];
    this._memberDisconnect = null;
  }

  _path(sub) {
    return `rooms/${this.code}${sub ? `/${sub}` : ''}`;
  }

  _ref(sub) {
    return this.fb.dbMod.ref(this.fb.db, this._path(sub));
  }

  async _join(name) {
    const { dbMod } = this.fb;
    const memberRef = this._ref(`members/${this.uid}`);
    await dbMod.set(memberRef, { name: sanitizeName(name), online: true, joinedAt: Date.now() });
    this._memberDisconnect = dbMod.onDisconnect(memberRef);
    try {
      await this._memberDisconnect.update({ online: false });
    } catch {
      // onDisconnect が使えない環境でも参加自体は続ける
    }
  }

  // 顔ぶれ・設定・自分の番号などを cb(meta) で受け取る。meta.settings / meta.seats は JSON 文字列のまま渡す
  onMeta(cb) {
    const unsub = this.fb.dbMod.onValue(this._ref('meta'), (snap) => cb(snap.val()));
    this._unsubs.push(unsub);
    return unsub;
  }

  onMembers(cb) {
    const unsub = this.fb.dbMod.onValue(this._ref('members'), (snap) => cb(snap.val() || {}));
    this._unsubs.push(unsub);
    return unsub;
  }

  // cb(json文字列, seq)。seq が進んだときだけゲーム側で置きかえる
  onState(cb) {
    const unsub = this.fb.dbMod.onValue(this._ref('state'), (snap) => {
      const v = snap.val();
      if (v && typeof v.json === 'string') cb(v.json, v.seq || 0);
    });
    this._unsubs.push(unsub);
    return unsub;
  }

  // ホスト: 待合の設定・はじめる・もう一度など
  async setMeta(patch) {
    await this.fb.dbMod.update(this._ref('meta'), patch);
  }

  // ホスト: 状態をまるごと書く（seq を +1）
  async publish(stateString) {
    const { dbMod } = this.fb;
    const result = await dbMod.runTransaction(this._ref('state'), (cur) => ({
      seq: (cur && cur.seq ? cur.seq : 0) + 1,
      json: stateString,
      at: Date.now(),
    }));
    return result.committed;
  }

  // 全員: 操作をお願いする（ホストは自分の操作ならこれを通さず engine を直接呼んでよい）
  async send(name, argsObject) {
    const { dbMod } = this.fb;
    const actionsRef = this._ref('actions');
    const id = dbMod.push(actionsRef).key;
    await dbMod.set(dbMod.ref(this.fb.db, `${this._path('actions')}/${id}`), {
      uid: this.uid,
      name: String(name).slice(0, 40),
      args: JSON.stringify(argsObject || {}).slice(0, 2000),
      at: Date.now(),
    });
    return id;
  }

  // ホスト: 届いた操作を古い順に 1 件ずつ cb({ uid, name, args }) へ。当て終わったら箱から消す
  onAction(cb) {
    const unsub = this.fb.dbMod.onChildAdded(this._ref('actions'), async (snap) => {
      const val = snap.val();
      if (!val) return;
      let args = {};
      try {
        args = JSON.parse(val.args || '{}');
      } catch {
        args = {};
      }
      try {
        await cb({ uid: val.uid, name: val.name, args });
      } finally {
        try {
          await this.fb.dbMod.remove(snap.ref);
        } catch {
          // ホストが入れ替わった直後などは消せないことがある。次のホストが拾う
        }
      }
    });
    this._unsubs.push(unsub);
    return unsub;
  }

  // ホストが切れて 20 秒たったときなど、代わってホストになる（rules が条件を確かめる）
  async takeOver() {
    await this.fb.dbMod.update(this._ref('meta'), { hostUid: this.uid });
    this.isHost = true;
  }

  // 部屋を出る（listener を止め、自分の online を false に）
  async leave() {
    this._unsubs.forEach((unsub) => unsub());
    this._unsubs = [];
    if (this._memberDisconnect) {
      try {
        await this._memberDisconnect.cancel();
      } catch {
        // 無視
      }
      this._memberDisconnect = null;
    }
    try {
      await this.fb.dbMod.update(this._ref(`members/${this.uid}`), { online: false });
    } catch {
      // 無視（もう部屋が無いときなど）
    }
  }

  // ホスト: 部屋ごと消す（後片付け）
  async close() {
    await this.leave();
    try {
      await this.fb.dbMod.remove(this._ref());
    } catch {
      // 無視
    }
  }
}

async function createRoom({ game, name, settings, seats }) {
  const fb = await loadFirebase();
  const user = await ensureSignedIn(fb);
  const { dbMod, db } = fb;

  let code = randomCode();
  for (let tries = 0; tries < 8; tries += 1) {
    code = randomCode();
    // eslint-disable-next-line no-await-in-loop
    const snap = await dbMod.get(dbMod.ref(db, `rooms/${code}/meta`));
    if (!snap.exists() || isExpiredMeta(snap.val())) break;
  }

  const room = new Room({ fb, code, uid: user.uid, game, isHost: true });
  await dbMod.set(room._ref('meta'), {
    v: 1,
    game,
    hostUid: user.uid,
    status: 'lobby',
    createdAt: Date.now(),
    settings: JSON.stringify(settings || {}),
    seats: JSON.stringify(seats || []),
  });
  await room._join(name);
  return room;
}

async function joinRoom(code, { game, name }) {
  if (!isValidCode(code)) throw new Error('部屋コードが違います');
  const fb = await loadFirebase();
  const user = await ensureSignedIn(fb);
  const { dbMod, db } = fb;

  const metaSnap = await dbMod.get(dbMod.ref(db, `rooms/${code}/meta`));
  const meta = metaSnap.val();
  if (!meta) throw new Error('部屋が見つかりません');
  if (meta.game !== game) throw new Error('違うゲームの部屋です');

  const room = new Room({ fb, code, uid: user.uid, game, isHost: meta.hostUid === user.uid });
  await room._join(name);
  return room;
}

export { createRoom, joinRoom, isValidCode, sanitizeName, roomLinkFor, roomCodeFromHash };

(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (process){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var errors = require('@thi.ng/errors');

const DEFAULT_EPS = 1e-6;
const EVENT_ALL = "*";
const EVENT_ENABLE = "enable";
const EVENT_DISABLE = "disable";
const SEMAPHORE = Symbol();
const NO_OP = () => { };
(function (Type) {
    Type[Type["U8"] = 0] = "U8";
    Type[Type["U8C"] = 1] = "U8C";
    Type[Type["I8"] = 2] = "I8";
    Type[Type["U16"] = 3] = "U16";
    Type[Type["I16"] = 4] = "I16";
    Type[Type["U32"] = 5] = "U32";
    Type[Type["I32"] = 6] = "I32";
    Type[Type["F32"] = 7] = "F32";
    Type[Type["F64"] = 8] = "F64";
})(exports.Type || (exports.Type = {}));
const SIZEOF = {
    [0 ]: 1,
    [1 ]: 1,
    [2 ]: 1,
    [3 ]: 2,
    [4 ]: 2,
    [5 ]: 4,
    [6 ]: 4,
    [7 ]: 4,
    [8 ]: 8
};
(function (LogLevel) {
    LogLevel[LogLevel["FINE"] = 0] = "FINE";
    LogLevel[LogLevel["DEBUG"] = 1] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["WARN"] = 3] = "WARN";
    LogLevel[LogLevel["SEVERE"] = 4] = "SEVERE";
    LogLevel[LogLevel["NONE"] = 5] = "NONE";
})(exports.LogLevel || (exports.LogLevel = {}));

const assert = typeof process === "undefined" ||
    process.env.NODE_ENV !== "production" ||
    process.env.UMBRELLA_ASSERTS === "1"
    ? (test, msg = "assertion failed") => {
        if ((typeof test === "function" && !test()) || !test) {
            throw new Error(typeof msg === "function" ? msg() : msg);
        }
    }
    : NO_OP;

const NULL_LOGGER = Object.freeze({
    level: exports.LogLevel.NONE,
    fine() { },
    debug() { },
    info() { },
    warn() { },
    severe() { }
});
class ConsoleLogger {
    constructor(id, level = exports.LogLevel.FINE) {
        this.id = id;
        this.level = level;
    }
    fine(...args) {
        this.level <= exports.LogLevel.FINE && this.log("FINE", args);
    }
    debug(...args) {
        this.level <= exports.LogLevel.DEBUG && this.log("DEBUG", args);
    }
    info(...args) {
        this.level <= exports.LogLevel.INFO && this.log("INFO", args);
    }
    warn(...args) {
        this.level <= exports.LogLevel.WARN && this.log("WARN", args);
    }
    severe(...args) {
        this.level <= exports.LogLevel.SEVERE && this.log("SEVERE", args);
    }
    log(level, args) {
        console.log(`[${level}] ${this.id}:`, ...args);
    }
}

const mixin = (behaviour, sharedBehaviour = {}) => {
    const instanceKeys = Reflect.ownKeys(behaviour);
    const sharedKeys = Reflect.ownKeys(sharedBehaviour);
    const typeTag = Symbol("isa");
    function _mixin(clazz) {
        for (let key of instanceKeys) {
            const existing = Object.getOwnPropertyDescriptor(clazz.prototype, key);
            if (!existing || existing.configurable) {
                Object.defineProperty(clazz.prototype, key, {
                    value: behaviour[key],
                    writable: true
                });
            }
            else {
                console.log(`not patching: ${clazz.name}.${key.toString()}`);
            }
        }
        Object.defineProperty(clazz.prototype, typeTag, { value: true });
        return clazz;
    }
    for (let key of sharedKeys) {
        Object.defineProperty(_mixin, key, {
            value: sharedBehaviour[key],
            enumerable: sharedBehaviour.propertyIsEnumerable(key)
        });
    }
    Object.defineProperty(_mixin, Symbol.hasInstance, {
        value: (x) => !!x[typeTag]
    });
    return _mixin;
};

const configurable = (state) => function (_, __, descriptor) {
    descriptor.configurable = state;
};

const deprecated = (msg, log = console.log) => function (target, prop, descriptor) {
    const signature = `${target.constructor.name}#${prop.toString()}`;
    const fn = descriptor.value;
    if (typeof fn !== "function") {
        errors.illegalArgs(`${signature} is not a function`);
    }
    descriptor.value = function () {
        log(`DEPRECATED ${signature}: ${msg || "will be removed soon"}`);
        return fn.apply(this, arguments);
    };
    return descriptor;
};

const nomixin = (_, __, descriptor) => {
    descriptor.configurable = false;
};

const sealed = (constructor) => {
    Object.seal(constructor);
    Object.seal(constructor.prototype);
};

const IEnableMixin = mixin({
    _enabled: true,
    isEnabled() {
        return this._enabled;
    },
    enable() {
        this._enabled = true;
        if (this.notify) {
            this.notify({ id: EVENT_ENABLE, target: this });
        }
    },
    disable() {
        this._enabled = false;
        if (this.notify) {
            this.notify({ id: EVENT_DISABLE, target: this });
        }
    },
    toggle() {
        this._enabled ? this.disable() : this.enable();
        return this._enabled;
    }
});

const inotify_dispatch = (listeners, e) => {
    if (!listeners)
        return;
    for (let i = 0, n = listeners.length, l; i < n; i++) {
        l = listeners[i];
        l[0].call(l[1], e);
        if (e.canceled) {
            return;
        }
    }
};
const INotifyMixin = mixin({
    addListener(id, fn, scope) {
        let l = (this._listeners =
            this._listeners || {})[id];
        if (!l) {
            l = this._listeners[id] = [];
        }
        if (this.__listener(l, fn, scope) === -1) {
            l.push([fn, scope]);
            return true;
        }
        return false;
    },
    removeListener(id, fn, scope) {
        if (!this._listeners)
            return false;
        const l = this._listeners[id];
        if (l) {
            const idx = this.__listener(l, fn, scope);
            if (idx !== -1) {
                l.splice(idx, 1);
                return true;
            }
        }
        return false;
    },
    notify(e) {
        if (!this._listeners)
            return;
        e.target === undefined && (e.target = this);
        inotify_dispatch(this._listeners[e.id], e);
        inotify_dispatch(this._listeners[EVENT_ALL], e);
    },
    __listener(listeners, f, scope) {
        let i = listeners.length;
        while (--i >= 0) {
            const l = listeners[i];
            if (l[0] === f && l[1] === scope) {
                break;
            }
        }
        return i;
    }
});

const iterable = (prop) => mixin({
    *[Symbol.iterator]() {
        yield* this[prop];
    }
});

const IWatchMixin = mixin({
    addWatch(id, fn) {
        this._watches = this._watches || {};
        if (this._watches[id]) {
            return false;
        }
        this._watches[id] = fn;
        return true;
    },
    removeWatch(id) {
        if (!this._watches)
            return;
        if (this._watches[id]) {
            delete this._watches[id];
            return true;
        }
        return false;
    },
    notifyWatches(oldState, newState) {
        if (!this._watches)
            return;
        const w = this._watches;
        for (let id in w) {
            w[id](id, oldState, newState);
        }
    }
});

exports.ConsoleLogger = ConsoleLogger;
exports.DEFAULT_EPS = DEFAULT_EPS;
exports.EVENT_ALL = EVENT_ALL;
exports.EVENT_DISABLE = EVENT_DISABLE;
exports.EVENT_ENABLE = EVENT_ENABLE;
exports.IEnableMixin = IEnableMixin;
exports.INotifyMixin = INotifyMixin;
exports.IWatchMixin = IWatchMixin;
exports.NO_OP = NO_OP;
exports.NULL_LOGGER = NULL_LOGGER;
exports.SEMAPHORE = SEMAPHORE;
exports.SIZEOF = SIZEOF;
exports.assert = assert;
exports.configurable = configurable;
exports.deprecated = deprecated;
exports.inotify_dispatch = inotify_dispatch;
exports.iterable = iterable;
exports.mixin = mixin;
exports.nomixin = nomixin;
exports.sealed = sealed;

}).call(this,require('_process'))
},{"@thi.ng/errors":8,"_process":14}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var compare = require('@thi.ng/compare');
var equiv = require('@thi.ng/equiv');
var checks = require('@thi.ng/checks');
var errors = require('@thi.ng/errors');
var random = require('@thi.ng/random');

const binarySearch = (buf, x, key = (x) => x, cmp = compare.compare) => {
    const kx = key(x);
    let low = 0;
    let high = buf.length - 1;
    while (low <= high) {
        const mid = (low + high) >>> 1;
        const c = cmp(key(buf[mid]), kx);
        if (c < 0) {
            low = mid + 1;
        }
        else if (c > 0) {
            high = mid - 1;
        }
        else {
            return mid;
        }
    }
    return -low - 1;
};

const endsWith = (buf, needle, equiv$1 = equiv.equiv) => {
    let i = buf.length;
    let j = needle.length;
    if (i < j)
        return false;
    while ((--i, --j >= 0 && equiv$1(buf[i], needle[j]))) { }
    return j < 0;
};

const ensureIterable = (x) => {
    if (!(x != null && x[Symbol.iterator])) {
        errors.illegalArgs(`value is not iterable: ${x}`);
    }
    return x;
};

const ensureArray = (x) => checks.isArray(x) ? x : [...ensureIterable(x)];
const ensureArrayLike = (x) => checks.isArrayLike(x) ? x : [...ensureIterable(x)];

const find = (src, x, equiv$1 = equiv.equiv) => {
    const i = findIndex(src, x, equiv$1);
    return i !== -1 ? src[i] : undefined;
};
const findIndex = (src, x, equiv$1 = equiv.equiv) => {
    for (let i = src.length; --i >= 0;) {
        if (equiv$1(x, src[i]))
            return i;
    }
    return -1;
};

const fuzzyMatch = (domain, query, equiv$1 = equiv.equiv) => {
    const nd = domain.length;
    const nq = query.length;
    if (nq > nd) {
        return false;
    }
    if (nq === nd) {
        return equiv$1(query, domain);
    }
    next: for (let i = 0, j = 0; i < nq; i++) {
        const q = query[i];
        while (j < nd) {
            if (equiv$1(domain[j++], q)) {
                continue next;
            }
        }
        return false;
    }
    return true;
};

const peek = (x) => x[x.length - 1];

const shuffle = (buf, n = buf.length, rnd = random.SYSTEM) => {
    n = Math.min(n, buf.length);
    const l = n;
    if (l > 1) {
        n = Math.min(n, l);
        while (--n >= 0) {
            const a = rnd.float(l) | 0;
            const b = rnd.float(l) | 0;
            const t = buf[a];
            buf[a] = buf[b];
            buf[b] = t;
        }
    }
    return buf;
};

const startsWith = (buf, needle, equiv$1 = equiv.equiv) => {
    let i = buf.length;
    let j = needle.length;
    if (i < j)
        return false;
    while (-j >= 0 && equiv$1(buf[j], needle[j])) { }
    return j < 0;
};

const swizzle = (order) => {
    const [a, b, c, d, e, f, g, h] = order;
    switch (order.length) {
        case 0:
            return () => [];
        case 1:
            return (x) => [x[a]];
        case 2:
            return (x) => [x[a], x[b]];
        case 3:
            return (x) => [x[a], x[b], x[c]];
        case 4:
            return (x) => [x[a], x[b], x[c], x[d]];
        case 5:
            return (x) => [x[a], x[b], x[c], x[d], x[e]];
        case 6:
            return (x) => [x[a], x[b], x[c], x[d], x[e], x[f]];
        case 7:
            return (x) => [x[a], x[b], x[c], x[d], x[e], x[f], x[g]];
        case 8:
            return (x) => [x[a], x[b], x[c], x[d], x[e], x[f], x[g], x[h]];
        default:
            return (x) => {
                const res = [];
                for (let i = order.length; --i >= 0;) {
                    res[i] = x[order[i]];
                }
                return res;
            };
    }
};

exports.binarySearch = binarySearch;
exports.endsWith = endsWith;
exports.ensureArray = ensureArray;
exports.ensureArrayLike = ensureArrayLike;
exports.ensureIterable = ensureIterable;
exports.find = find;
exports.findIndex = findIndex;
exports.fuzzyMatch = fuzzyMatch;
exports.peek = peek;
exports.shuffle = shuffle;
exports.startsWith = startsWith;
exports.swizzle = swizzle;

},{"@thi.ng/checks":4,"@thi.ng/compare":5,"@thi.ng/equiv":7,"@thi.ng/errors":8,"@thi.ng/random":11}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const MASKS = new Array(33).fill(0).map((_, i) => Math.pow(2, i) - 1);

const align = (addr, size) => (size--, (addr + size) & ~size);
const isAligned = (addr, size) => !(addr & (size - 1));

const popCount = (x) => ((x = x - ((x >>> 1) & 0x55555555)),
    (x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)),
    (((x + (x >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24);
const hammingDist = (x, y) => popCount(x ^ y);
const clz32 = (x) => x !== 0 ? 31 - ((Math.log(x >>> 0) / Math.LN2) | 0) : 32;
const ctz32 = (x) => {
    let c = 32;
    x &= -x;
    x && c--;
    x & 0x0000ffff && (c -= 16);
    x & 0x00ff00ff && (c -= 8);
    x & 0x0f0f0f0f && (c -= 4);
    x & 0x33333333 && (c -= 2);
    x & 0x55555555 && (c -= 1);
    return c;
};

const defMask = (a, b) => (~MASKS[a] & MASKS[b]) >>> 0;
const maskL = (n, x) => (x & MASKS[n]) >>> 0;
const maskH = (n, x) => (x & ~MASKS[n]) >>> 0;

const bitClear = (x, bit) => (x & ~(1 << bit)) >>> 0;
const bitFlip = (x, bit) => (x ^ (1 << bit)) >>> 0;
const bitSet = (x, bit) => (x | (1 << bit)) >>> 0;
const bitSetWindow = (x, y, from, to) => {
    const m = defMask(from, to);
    return (x & ~m) | ((y << (1 << from)) & m);
};
const bitClearWindow = (x, from, to) => x & ~defMask(from, to);

const F32 = new Float32Array(1);
const I32 = new Int32Array(F32.buffer);
const U32 = new Uint32Array(F32.buffer);
const floatToIntBits = (x) => ((F32[0] = x), I32[0]);
const floatToUintBits = (x) => ((F32[0] = x), U32[0]);
const intBitsToFloat = (x) => ((I32[0] = x), F32[0]);
const uintBitsToFloat = (x) => ((U32[0] = x), F32[0]);
const floatToSortableInt = (x) => {
    if (x === -0)
        x = 0;
    const i = floatToIntBits(x);
    return x < 0 ? ~i | (1 << 31) : i;
};

const encodeGray32 = (x) => (x ^ (x >>> 1)) >>> 0;
const decodeGray32 = (x) => {
    x = x ^ (x >>> 16);
    x = x ^ (x >>> 8);
    x = x ^ (x >>> 4);
    x = x ^ (x >>> 2);
    x = x ^ (x >>> 1);
    return x >>> 0;
};

const bitNot = (n, x) => maskL(n, ~x);
const bitAnd = (n, a, b) => maskL(n, a & b);
const bitNand = (n, a, b) => maskL(n, ~(a & b));
const bitOr = (n, a, b) => maskL(n, a | b);
const bitNor = (n, a, b) => maskL(n, ~(a & b));
const bitXor = (n, a, b) => maskL(n, a ^ b);
const bitXnor = (n, a, b) => maskL(n, ~(a ^ b));
const bitImply = (n, a, b) => maskL(n, ~a | b);
const bitAoi21 = (n, a, b, c) => maskL(n, ~(a | (b & c)));
const bitOai21 = (n, a, b, c) => maskL(n, ~(a & (b | c)));
const bitAoi22 = (n, a, b, c, d) => maskL(n, ~((a & b) | (c & d)));
const bitOai22 = (n, a, b, c, d) => maskL(n, ~((a | b) & (c | d)));
const bitMux = (n, a, b, s) => maskL(n, (a & ~s) | (b & s));
const bitDemux = (n, a, b, s) => [maskL(n, a & ~s), maskL(n, b & s)];

const isPow2 = (x) => !!x && !(x & (x - 1));
const ceilPow2 = (x) => {
    x += (x === 0);
    --x;
    x |= x >>> 1;
    x |= x >>> 2;
    x |= x >>> 4;
    x |= x >>> 8;
    x |= x >>> 16;
    return x + 1;
};
const floorPow2 = (x) => {
    x |= x >>> 1;
    x |= x >>> 2;
    x |= x >>> 4;
    x |= x >>> 8;
    x |= x >>> 16;
    return x - (x >>> 1);
};

const rotateLeft = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const rotateRight = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

const splat4_24 = (x) => (x & 0xf) * 0x111111;
const splat4_32 = (x) => ((x & 0xf) * 0x11111111) >>> 0;
const splat8_24 = (x) => (x & 0xff) * 0x010101;
const splat8_32 = (x) => ((x & 0xff) * 0x01010101) >>> 0;
const splat16_32 = (x) => ((x &= 0xffff), ((x << 16) | x) >>> 0);
const same4 = (x) => ((x >> 4) & 0xf) === (x & 0xf);
const same8 = (x) => ((x >> 8) & 0xff) === (x & 0xff);

const lane8 = (x, lane) => (x >>> ((3 - lane) << 3)) & 0xff;
const lane4 = (x, lane) => (x >>> ((7 - lane) << 2)) & 0xf;
const lane2 = (x, lane) => (x >>> ((15 - lane) << 1)) & 0x3;
const setLane8 = (x, y, lane) => {
    const l = (3 - lane) << 3;
    return ((~(0xff << l) & x) | ((y & 0xff) << l)) >>> 0;
};
const setLane4 = (x, y, lane) => {
    const l = (7 - lane) << 2;
    return ((~(0xf << l) & x) | ((y & 0xf) << l)) >>> 0;
};
const setLane2 = (x, y, lane) => {
    const l = (15 - lane) << 1;
    return ((~(0x3 << l) & x) | ((y & 0x3) << l)) >>> 0;
};
const swizzle8 = (x, a, b, c, d) => ((lane8(x, a) << 24) |
    (lane8(x, b) << 16) |
    (lane8(x, c) << 8) |
    lane8(x, d)) >>>
    0;
const swizzle4 = (x, a, b, c, d, e, f, g, h) => ((lane4(x, a) << 28) |
    (lane4(x, b) << 24) |
    (lane4(x, c) << 20) |
    (lane4(x, d) << 16) |
    (lane4(x, e) << 12) |
    (lane4(x, f) << 8) |
    (lane4(x, g) << 4) |
    lane4(x, h)) >>>
    0;
const flipBytes = (x) => ((x >>> 24) | ((x >> 8) & 0xff00) | ((x & 0xff00) << 8) | (x << 24)) >>> 0;

exports.MASKS = MASKS;
exports.align = align;
exports.bitAnd = bitAnd;
exports.bitAoi21 = bitAoi21;
exports.bitAoi22 = bitAoi22;
exports.bitClear = bitClear;
exports.bitClearWindow = bitClearWindow;
exports.bitDemux = bitDemux;
exports.bitFlip = bitFlip;
exports.bitImply = bitImply;
exports.bitMux = bitMux;
exports.bitNand = bitNand;
exports.bitNor = bitNor;
exports.bitNot = bitNot;
exports.bitOai21 = bitOai21;
exports.bitOai22 = bitOai22;
exports.bitOr = bitOr;
exports.bitSet = bitSet;
exports.bitSetWindow = bitSetWindow;
exports.bitXnor = bitXnor;
exports.bitXor = bitXor;
exports.ceilPow2 = ceilPow2;
exports.clz32 = clz32;
exports.ctz32 = ctz32;
exports.decodeGray32 = decodeGray32;
exports.defMask = defMask;
exports.encodeGray32 = encodeGray32;
exports.flipBytes = flipBytes;
exports.floatToIntBits = floatToIntBits;
exports.floatToSortableInt = floatToSortableInt;
exports.floatToUintBits = floatToUintBits;
exports.floorPow2 = floorPow2;
exports.hammingDist = hammingDist;
exports.intBitsToFloat = intBitsToFloat;
exports.isAligned = isAligned;
exports.isPow2 = isPow2;
exports.lane2 = lane2;
exports.lane4 = lane4;
exports.lane8 = lane8;
exports.maskH = maskH;
exports.maskL = maskL;
exports.popCount = popCount;
exports.rotateLeft = rotateLeft;
exports.rotateRight = rotateRight;
exports.same4 = same4;
exports.same8 = same8;
exports.setLane2 = setLane2;
exports.setLane4 = setLane4;
exports.setLane8 = setLane8;
exports.splat16_32 = splat16_32;
exports.splat4_24 = splat4_24;
exports.splat4_32 = splat4_32;
exports.splat8_24 = splat8_24;
exports.splat8_32 = splat8_32;
exports.swizzle4 = swizzle4;
exports.swizzle8 = swizzle8;
exports.uintBitsToFloat = uintBitsToFloat;

},{}],4:[function(require,module,exports){
(function (process,global){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const existsAndNotNull = (x) => x != null;

const exists = (t) => t !== undefined;

const hasCrypto = () => typeof window !== "undefined" && window["crypto"] !== undefined;

const hasMaxLength = (len, x) => x != null && x.length <= len;

const hasMinLength = (len, x) => x != null && x.length >= len;

const isFunction = (x) => typeof x === "function";

const hasPerformance = () => typeof performance !== "undefined" && isFunction(performance.now);

const hasWASM = () => (typeof window !== "undefined" &&
    typeof window["WebAssembly"] !== "undefined") ||
    (typeof global !== "undefined" &&
        typeof global["WebAssembly"] !== "undefined");

const hasWebGL = () => {
    try {
        document.createElement("canvas").getContext("webgl");
        return true;
    }
    catch (e) {
        return false;
    }
};

const hasWebSocket = () => typeof WebSocket !== "undefined";

const implementsFunction = (x, fn) => x != null && typeof x[fn] === "function";

const isArray = Array.isArray;

const isArrayLike = (x) => x != null && typeof x !== "function" && x.length !== undefined;

const isBlob = (x) => x instanceof Blob;

const isBoolean = (x) => typeof x === "boolean";

const isChrome = () => typeof window !== "undefined" && !!window["chrome"];

const isDate = (x) => x instanceof Date;

const isEven = (x) => x % 2 === 0;

const isFalse = (x) => x === false;

const isFile = (x) => x instanceof File;

const isFirefox = () => typeof window !== "undefined" && !!window["InstallTrigger"];

const isString = (x) => typeof x === "string";

const RE = /^#([a-f0-9]{3}|[a-f0-9]{4}(?:[a-f0-9]{2}){0,2})$/i;
const isHexColor = (x) => isString(x) && RE.test(x);

const isIE = () => typeof document !== "undefined" &&
    (typeof document["documentMode"] !== "undefined" ||
        navigator.userAgent.indexOf("MSIE") > 0);

const isInRange = (min, max, x) => x >= min && x <= max;

const isInt32 = (x) => typeof x === "number" && (x | 0) === x;

const isIterable = (x) => x != null && typeof x[Symbol.iterator] === "function";

const isMap = (x) => x instanceof Map;

const isMobile = () => typeof navigator !== "undefined" &&
    /mobile|tablet|ip(ad|hone|od)|android|silk|crios/i.test(navigator.userAgent);

const isNaN = (x) => x !== x;

const isNegative = (x) => typeof x === "number" && x < 0;

const isNil = (x) => x == null;

const isNode = () => {
    if (typeof process === "object") {
        if (typeof process.versions === "object") {
            if (typeof process.versions.node !== "undefined") {
                return true;
            }
        }
    }
    return false;
};

const isNotStringAndIterable = (x) => x != null &&
    typeof x !== "string" &&
    typeof x[Symbol.iterator] === "function";

const isNull = (x) => x === null;

const isNumber = (x) => typeof x === "number";

const isObject = (x) => x !== null && typeof x === "object";

const isOdd = (x) => x % 2 !== 0;

const OBJP = Object.getPrototypeOf;
const isPlainObject = (x) => {
    let p;
    return (x != null &&
        typeof x === "object" &&
        ((p = OBJP(x)) === null || OBJP(p) === null));
};

const isPosititve = (x) => typeof x === "number" && x > 0;

const isPrimitive = (x) => {
    const t = typeof x;
    return t === "string" || t === "number";
};

const isPromise = (x) => x instanceof Promise;

const isPromiseLike = (x) => x instanceof Promise ||
    (implementsFunction(x, "then") && implementsFunction(x, "catch"));

const isRegExp = (x) => x instanceof RegExp;

const isSafari = () => typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !isChrome();

const isSet = (x) => x instanceof Set;

const isSymbol = (x) => typeof x === "symbol";

const isTransferable = (x) => x instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" &&
        x instanceof SharedArrayBuffer) ||
    (typeof MessagePort !== "undefined" && x instanceof MessagePort);

const isTrue = (x) => x === true;

const isTypedArray = (x) => x &&
    (x.constructor === Float32Array ||
        x.constructor === Uint32Array ||
        x.constructor === Uint8Array ||
        x.constructor === Uint8ClampedArray ||
        x.constructor === Int8Array ||
        x.constructor === Uint16Array ||
        x.constructor === Int16Array ||
        x.constructor === Int32Array ||
        x.constructor === Float64Array);

const isUint32 = (x) => typeof x === "number" && x >>> 0 === x;

const isUndefined = (x) => x === undefined;

const RE$1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (x) => RE$1.test(x);

const RE$2 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUUIDv4 = (x) => RE$2.test(x);

const isZero = (x) => x === 0;

exports.exists = exists;
exports.existsAndNotNull = existsAndNotNull;
exports.hasCrypto = hasCrypto;
exports.hasMaxLength = hasMaxLength;
exports.hasMinLength = hasMinLength;
exports.hasPerformance = hasPerformance;
exports.hasWASM = hasWASM;
exports.hasWebGL = hasWebGL;
exports.hasWebSocket = hasWebSocket;
exports.implementsFunction = implementsFunction;
exports.isArray = isArray;
exports.isArrayLike = isArrayLike;
exports.isBlob = isBlob;
exports.isBoolean = isBoolean;
exports.isChrome = isChrome;
exports.isDate = isDate;
exports.isEven = isEven;
exports.isFalse = isFalse;
exports.isFile = isFile;
exports.isFirefox = isFirefox;
exports.isFunction = isFunction;
exports.isHexColor = isHexColor;
exports.isIE = isIE;
exports.isInRange = isInRange;
exports.isInt32 = isInt32;
exports.isIterable = isIterable;
exports.isMap = isMap;
exports.isMobile = isMobile;
exports.isNaN = isNaN;
exports.isNegative = isNegative;
exports.isNil = isNil;
exports.isNode = isNode;
exports.isNotStringAndIterable = isNotStringAndIterable;
exports.isNull = isNull;
exports.isNumber = isNumber;
exports.isObject = isObject;
exports.isOdd = isOdd;
exports.isPlainObject = isPlainObject;
exports.isPosititve = isPosititve;
exports.isPrimitive = isPrimitive;
exports.isPromise = isPromise;
exports.isPromiseLike = isPromiseLike;
exports.isRegExp = isRegExp;
exports.isSafari = isSafari;
exports.isSet = isSet;
exports.isString = isString;
exports.isSymbol = isSymbol;
exports.isTransferable = isTransferable;
exports.isTrue = isTrue;
exports.isTypedArray = isTypedArray;
exports.isUUID = isUUID;
exports.isUUIDv4 = isUUIDv4;
exports.isUint32 = isUint32;
exports.isUndefined = isUndefined;
exports.isZero = isZero;

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":14}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const compare = (a, b) => {
    if (a === b) {
        return 0;
    }
    if (a == null) {
        return b == null ? 0 : -1;
    }
    if (b == null) {
        return a == null ? 0 : 1;
    }
    if (typeof a.compare === "function") {
        return a.compare(b);
    }
    if (typeof b.compare === "function") {
        return -b.compare(a);
    }
    return a < b ? -1 : a > b ? 1 : 0;
};

exports.compare = compare;

},{}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var errors = require('@thi.ng/errors');

function comp(...fns) {
    let [a, b, c, d, e, f, g, h, i, j] = fns;
    switch (fns.length) {
        case 0:
            errors.illegalArity(0);
        case 1:
            return a;
        case 2:
            return (...xs) => a(b(...xs));
        case 3:
            return (...xs) => a(b(c(...xs)));
        case 4:
            return (...xs) => a(b(c(d(...xs))));
        case 5:
            return (...xs) => a(b(c(d(e(...xs)))));
        case 6:
            return (...xs) => a(b(c(d(e(f(...xs))))));
        case 7:
            return (...xs) => a(b(c(d(e(f(g(...xs)))))));
        case 8:
            return (...xs) => a(b(c(d(e(f(g(h(...xs))))))));
        case 9:
            return (...xs) => a(b(c(d(e(f(g(h(i(...xs)))))))));
        case 10:
        default:
            const fn = (...xs) => a(b(c(d(e(f(g(h(i(j(...xs))))))))));
            return fns.length === 10 ? fn : comp(fn, ...fns.slice(10));
    }
}
function compL(...fns) {
    return comp.apply(null, fns.reverse());
}
const compI = compL;

function complement(f) {
    return (...xs) => !f(...xs);
}

const constantly = (x) => () => x;

const delay = (body) => new Delay(body);
class Delay {
    constructor(body) {
        this.body = body;
        this.realized = false;
    }
    deref() {
        if (!this.realized) {
            this.value = this.body();
            this.realized = true;
        }
        return this.value;
    }
    isRealized() {
        return this.realized;
    }
}

const delayed = (x, t) => new Promise((resolve) => setTimeout(() => resolve(x), t));

const identity = (x) => x;

const ifDef = (f, x) => x != null ? f(x) : undefined;

function juxt(...fns) {
    const [a, b, c, d, e, f, g, h] = fns;
    switch (fns.length) {
        case 1:
            return (x) => [a(x)];
        case 2:
            return (x) => [a(x), b(x)];
        case 3:
            return (x) => [a(x), b(x), c(x)];
        case 4:
            return (x) => [a(x), b(x), c(x), d(x)];
        case 5:
            return (x) => [a(x), b(x), c(x), d(x), e(x)];
        case 6:
            return (x) => [a(x), b(x), c(x), d(x), e(x), f(x)];
        case 7:
            return (x) => [a(x), b(x), c(x), d(x), e(x), f(x), g(x)];
        case 8:
            return (x) => [a(x), b(x), c(x), d(x), e(x), f(x), g(x), h(x)];
        default:
            return (x) => {
                let res = new Array(fns.length);
                for (let i = fns.length; --i >= 0;) {
                    res[i] = fns[i](x);
                }
                return res;
            };
    }
}

function partial(fn, ...args) {
    let [a, b, c, d, e, f, g, h] = args;
    switch (args.length) {
        case 1:
            return (...xs) => fn(a, ...xs);
        case 2:
            return (...xs) => fn(a, b, ...xs);
        case 3:
            return (...xs) => fn(a, b, c, ...xs);
        case 4:
            return (...xs) => fn(a, b, c, d, ...xs);
        case 5:
            return (...xs) => fn(a, b, c, d, e, ...xs);
        case 6:
            return (...xs) => fn(a, b, c, d, e, f, ...xs);
        case 7:
            return (...xs) => fn(a, b, c, d, e, f, g, ...xs);
        case 8:
            return (...xs) => fn(a, b, c, d, e, f, g, h, ...xs);
        default:
            errors.illegalArgs();
    }
}
const foo = partial((a, b) => a + b, "a");

const threadFirst = (init, ...fns) => fns.reduce((acc, expr) => typeof expr === "function"
    ? expr(acc)
    : expr[0](acc, ...expr.slice(1)), init);

const threadLast = (init, ...fns) => fns.reduce((acc, expr) => typeof expr === "function"
    ? expr(acc)
    : expr[0](...expr.slice(1), acc), init);

const trampoline = (f) => {
    while (typeof f === "function") {
        f = f();
    }
    return f;
};

exports.Delay = Delay;
exports.comp = comp;
exports.compI = compI;
exports.compL = compL;
exports.complement = complement;
exports.constantly = constantly;
exports.delay = delay;
exports.delayed = delayed;
exports.foo = foo;
exports.identity = identity;
exports.ifDef = ifDef;
exports.juxt = juxt;
exports.partial = partial;
exports.threadFirst = threadFirst;
exports.threadLast = threadLast;
exports.trampoline = trampoline;

},{"@thi.ng/errors":8}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const OBJP = Object.getPrototypeOf({});
const FN = "function";
const STR = "string";
const equiv = (a, b) => {
    let proto;
    if (a === b) {
        return true;
    }
    if (a != null) {
        if (typeof a.equiv === FN) {
            return a.equiv(b);
        }
    }
    else {
        return a == b;
    }
    if (b != null) {
        if (typeof b.equiv === FN) {
            return b.equiv(a);
        }
    }
    else {
        return a == b;
    }
    if (typeof a === STR || typeof b === STR) {
        return false;
    }
    if (((proto = Object.getPrototypeOf(a)), proto == null || proto === OBJP) &&
        ((proto = Object.getPrototypeOf(b)), proto == null || proto === OBJP)) {
        return equivObject(a, b);
    }
    if (typeof a !== FN &&
        a.length !== undefined &&
        typeof b !== FN &&
        b.length !== undefined) {
        return equivArrayLike(a, b);
    }
    if (a instanceof Set && b instanceof Set) {
        return equivSet(a, b);
    }
    if (a instanceof Map && b instanceof Map) {
        return equivMap(a, b);
    }
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }
    if (a instanceof RegExp && b instanceof RegExp) {
        return a.toString() === b.toString();
    }
    return a !== a && b !== b;
};
const equivArrayLike = (a, b, _equiv = equiv) => {
    let l = a.length;
    if (l === b.length) {
        while (--l >= 0 && _equiv(a[l], b[l]))
            ;
    }
    return l < 0;
};
const equivSet = (a, b, _equiv = equiv) => a.size === b.size && _equiv([...a.keys()].sort(), [...b.keys()].sort());
const equivMap = (a, b, _equiv = equiv) => a.size === b.size && _equiv([...a].sort(), [...b].sort());
const equivObject = (a, b, _equiv = equiv) => {
    if (Object.keys(a).length !== Object.keys(b).length) {
        return false;
    }
    for (let k in a) {
        if (!b.hasOwnProperty(k) || !_equiv(a[k], b[k])) {
            return false;
        }
    }
    return true;
};

exports.equiv = equiv;
exports.equivArrayLike = equivArrayLike;
exports.equivMap = equivMap;
exports.equivObject = equivObject;
exports.equivSet = equivSet;

},{}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const defError = (prefix, suffix = (msg) => (msg !== undefined ? ": " + msg : "")) => class extends Error {
    constructor(msg) {
        super(prefix(msg) + suffix(msg));
    }
};

const IllegalArgumentError = defError(() => "illegal argument(s)");
const illegalArgs = (msg) => {
    throw new IllegalArgumentError(msg);
};

const IllegalArityError = defError(() => "illegal arity");
const illegalArity = (n) => {
    throw new IllegalArityError(n);
};

const IllegalStateError = defError(() => "illegal state");
const illegalState = (msg) => {
    throw new IllegalStateError(msg);
};

const UnsupportedOperationError = defError(() => "unsupported operation");
const unsupported = (msg) => {
    throw new UnsupportedOperationError(msg);
};

exports.IllegalArgumentError = IllegalArgumentError;
exports.IllegalArityError = IllegalArityError;
exports.IllegalStateError = IllegalStateError;
exports.UnsupportedOperationError = UnsupportedOperationError;
exports.defError = defError;
exports.illegalArgs = illegalArgs;
exports.illegalArity = illegalArity;
exports.illegalState = illegalState;
exports.unsupported = unsupported;

},{}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const PI = Math.PI;
const TAU = PI * 2;
const HALF_PI = PI / 2;
const THIRD_PI = PI / 3;
const QUARTER_PI = PI / 4;
const SIXTH_PI = PI / 6;
const INV_PI = 1 / PI;
const INV_TAU = 1 / TAU;
const INV_HALF_PI = 1 / HALF_PI;
const DEG2RAD = PI / 180;
const RAD2DEG = 180 / PI;
const PHI = (1 + Math.sqrt(5)) / 2;
const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);
const SQRT2_2 = SQRT2 / 2;
const SQRT2_3 = SQRT3 / 2;
const THIRD = 1 / 3;
const TWO_THIRD = 2 / 3;
const SIXTH = 1 / 6;
let EPS = 1e-6;
(function (Crossing) {
    Crossing[Crossing["EQUAL"] = 0] = "EQUAL";
    Crossing[Crossing["FLAT"] = 1] = "FLAT";
    Crossing[Crossing["UNDER"] = 2] = "UNDER";
    Crossing[Crossing["OVER"] = 3] = "OVER";
    Crossing[Crossing["OTHER"] = 4] = "OTHER";
})(exports.Crossing || (exports.Crossing = {}));

const absDiff = (x, y) => Math.abs(x - y);
const sign = (x, eps = EPS) => (x > eps ? 1 : x < -eps ? -1 : 0);

const sincos = (theta, n = 1) => [
    Math.sin(theta) * n,
    Math.cos(theta) * n
];
const cossin = (theta, n = 1) => [
    Math.cos(theta) * n,
    Math.sin(theta) * n
];
const absTheta = (theta) => ((theta %= TAU), theta < 0 ? TAU + theta : theta);
const absInnerAngle = (theta) => ((theta = Math.abs(theta)), theta > PI ? TAU - theta : theta);
const angleDist = (a, b) => absInnerAngle(absTheta((b % TAU) - (a % TAU)));
const atan2Abs = (y, x) => absTheta(Math.atan2(y, x));
const quadrant = (theta) => (absTheta(theta) * INV_HALF_PI) | 0;
const deg = (theta) => theta * RAD2DEG;
const rad = (theta) => theta * DEG2RAD;
const csc = (theta) => 1 / Math.sin(theta);
const sec = (theta) => 1 / Math.cos(theta);
const cot = (theta) => 1 / Math.tan(theta);
const loc = (a, b, gamma) => Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(gamma));
const normCos = (x) => {
    const x2 = x * x;
    return 1.0 + x2 * (-4 + 2 * x2);
};
const __fastCos = (x) => {
    const x2 = x * x;
    return 0.99940307 + x2 * (-0.49558072 + 0.03679168 * x2);
};
const fastCos = (theta) => {
    theta %= TAU;
    theta < 0 && (theta = -theta);
    switch ((theta * INV_HALF_PI) | 0) {
        case 0:
            return __fastCos(theta);
        case 1:
            return -__fastCos(PI - theta);
        case 2:
            return -__fastCos(theta - PI);
        default:
            return __fastCos(TAU - theta);
    }
};
const fastSin = (theta) => fastCos(HALF_PI - theta);

const abs = Math.abs;
const max = Math.max;
const eqDelta = (a, b, eps = EPS) => abs(a - b) <= eps * max(1, abs(a), abs(b));
const eqDeltaFixed = (a, b, eps = EPS) => abs(a - b) <= eps;

const isCrossOver = (a1, a2, b1, b2) => a1 < b1 && a2 > b2;
const isCrossUnder = (a1, a2, b1, b2) => a1 > b1 && a2 < b2;
const classifyCrossing = (a1, a2, b1, b2, eps = EPS) => {
    if (isCrossOver(a1, a2, b1, b2)) {
        return 3 ;
    }
    else if (isCrossUnder(a1, a2, b1, b2)) {
        return 2 ;
    }
    return eqDelta(a1, b1, eps) && eqDelta(a2, b2, eps)
        ? eqDelta(a1, b2, eps)
            ? 1
            : 0
        : 4 ;
};

const isMinima = (a, b, c) => a > b && b < c;
const isMaxima = (a, b, c) => a < b && b > c;
const index = (pred, values, from = 0, to = values.length) => {
    to--;
    for (let i = from + 1; i < to; i++) {
        if (pred(values[i - 1], values[i], values[i + 1])) {
            return i;
        }
    }
    return -1;
};
const minimaIndex = (values, from = 0, to = values.length) => index(isMinima, values, from, to);
const maximaIndex = (values, from = 0, to = values.length) => index(isMaxima, values, from, to);
function* indices(fn, vals, from = 0, to = vals.length) {
    while (from < to) {
        const i = fn(vals, from, to);
        if (i < 0)
            return;
        yield i;
        from = i + 1;
    }
}
const minimaIndices = (values, from = 0, to = values.length) => indices(minimaIndex, values, from, to);
const maximaIndices = (values, from = 0, to = values.length) => indices(minimaIndex, values, from, to);

const clamp = (x, min, max) => x < min ? min : x > max ? max : x;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp11 = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
const wrap = (x, min, max) => x < min ? x - min + max : x >= max ? x - max + min : x;
const wrap01 = (x) => (x < 0 ? x + 1 : x >= 1 ? x - 1 : x);
const wrap11 = (x) => (x < -1 ? x + 2 : x >= 1 ? x - 2 : x);
const min2id = (a, b) => (a <= b ? 0 : 1);
const min3id = (a, b, c) => a <= b ? (a <= c ? 0 : 2) : b <= c ? 1 : 2;
const min4id = (a, b, c, d) => a <= b
    ? a <= c
        ? a <= d
            ? 0
            : 3
        : c <= d
            ? 2
            : 3
    : b <= c
        ? b <= d
            ? 1
            : 3
        : c <= d
            ? 2
            : 3;
const max2id = (a, b) => (a >= b ? 0 : 1);
const max3id = (a, b, c) => a >= b ? (a >= c ? 0 : 2) : b >= c ? 1 : 2;
const max4id = (a, b, c, d) => a >= b
    ? a >= c
        ? a >= d
            ? 0
            : 3
        : c >= d
            ? 2
            : 3
    : b >= c
        ? b >= d
            ? 1
            : 3
        : c >= d
            ? 2
            : 3;
const smin = (a, b, k) => smax(a, b, -k);
const smax = (a, b, k) => {
    const ea = Math.exp(a * k);
    const eb = Math.exp(b * k);
    return (a * ea + b * eb) / (ea + eb);
};
const sclamp = (x, min, max, k) => smin(smax(x, min, k), max, k);
const absMin = (a, b) => Math.abs(a) < Math.abs(b) ? a : b;
const absMax = (a, b) => Math.abs(a) > Math.abs(b) ? a : b;
const foldback = (e, x) => x < -e || x > e ? Math.abs(Math.abs((x - e) % (4 * e)) - 2 * e) - e : x;
const inRange = (x, min, max) => x >= min && x <= max;
const inOpenRange = (x, min, max) => x > min && x < max;

const norm = (x, a, b) => b !== a ? (x - a) / (b - a) : 0;
const fit = (x, a, b, c, d) => c + (d - c) * norm(x, a, b);
const fitClamped = (x, a, b, c, d) => c + (d - c) * clamp01(norm(x, a, b));
const fit01 = (x, a, b) => a + (b - a) * clamp01(x);
const fit10 = (x, a, b) => b + (a - b) * clamp01(x);
const fit11 = (x, a, b) => a + (b - a) * (0.5 + 0.5 * clamp11(x));

const M8 = 0xff;
const M16 = 0xffff;
const signExtend8 = (a) => ((a &= M8), a & 0x80 ? a | ~M8 : a);
const signExtend16 = (a) => ((a &= M16), a & 0x8000 ? a | ~M16 : a);
const addi8 = (a, b) => signExtend8((a | 0) + (b | 0));
const divi8 = (a, b) => signExtend8((a | 0) / (b | 0));
const muli8 = (a, b) => signExtend8((a | 0) * (b | 0));
const subi8 = (a, b) => signExtend8((a | 0) - (b | 0));
const andi8 = (a, b) => signExtend8((a | 0) & (b | 0));
const ori8 = (a, b) => signExtend8(a | 0 | (b | 0));
const xori8 = (a, b) => signExtend8((a | 0) ^ (b | 0));
const noti8 = (a) => signExtend8(~a);
const lshifti8 = (a, b) => signExtend8((a | 0) << (b | 0));
const rshifti8 = (a, b) => signExtend8((a | 0) >> (b | 0));
const addi16 = (a, b) => signExtend16((a | 0) + (b | 0));
const divi16 = (a, b) => signExtend16((a | 0) / (b | 0));
const muli16 = (a, b) => signExtend16((a | 0) * (b | 0));
const subi16 = (a, b) => signExtend16((a | 0) - (b | 0));
const andi16 = (a, b) => signExtend16((a | 0) & (b | 0));
const ori16 = (a, b) => signExtend16(a | 0 | (b | 0));
const xori16 = (a, b) => signExtend16((a | 0) ^ (b | 0));
const noti16 = (a) => signExtend16(~a);
const lshifti16 = (a, b) => signExtend16((a | 0) << (b | 0));
const rshifti16 = (a, b) => signExtend16((a | 0) >> (b | 0));
const addi32 = (a, b) => ((a | 0) + (b | 0)) | 0;
const divi32 = (a, b) => ((a | 0) / (b | 0)) | 0;
const muli32 = (a, b) => ((a | 0) * (b | 0)) | 0;
const subi32 = (a, b) => ((a | 0) - (b | 0)) | 0;
const andi32 = (a, b) => (a | 0) & (b | 0);
const ori32 = (a, b) => a | 0 | (b | 0);
const xori32 = (a, b) => (a | 0) ^ (b | 0);
const lshifti32 = (a, b) => (a | 0) << (b | 0);
const rshifti32 = (a, b) => (a | 0) >> (b | 0);
const noti32 = (a) => ~a;
const addu8 = (a, b) => ((a & M8) + (b & M8)) & M8;
const divu8 = (a, b) => ((a & M8) / (b & M8)) & M8;
const mulu8 = (a, b) => ((a & M8) * (b & M8)) & M8;
const subu8 = (a, b) => ((a & M8) - (b & M8)) & M8;
const andu8 = (a, b) => ((a & M8) & (b & M8)) & M8;
const oru8 = (a, b) => ((a & M8) | (b & M8)) & M8;
const xoru8 = (a, b) => ((a & M8) ^ (b & M8)) & M8;
const notu8 = (a) => ~a & M8;
const lshiftu8 = (a, b) => ((a & M8) << (b & M8)) & M8;
const rshiftu8 = (a, b) => ((a & M8) >>> (b & M8)) & M8;
const addu16 = (a, b) => ((a & M16) + (b & M16)) & M16;
const divu16 = (a, b) => ((a & M16) / (b & M16)) & M16;
const mulu16 = (a, b) => ((a & M16) * (b & M16)) & M16;
const subu16 = (a, b) => ((a & M16) - (b & M16)) & M16;
const andu16 = (a, b) => ((a & M16) & (b & M16)) & M16;
const oru16 = (a, b) => ((a & M16) | (b & M16)) & M16;
const xoru16 = (a, b) => ((a & M16) ^ (b & M16)) & M16;
const notu16 = (a) => ~a & M16;
const lshiftu16 = (a, b) => ((a & M16) << (b & M16)) & M16;
const rshiftu16 = (a, b) => ((a & M16) >>> (b & M16)) & M16;
const addu32 = (a, b) => ((a >>> 0) + (b >>> 0)) >>> 0;
const divu32 = (a, b) => ((a >>> 0) / (b >>> 0)) >>> 0;
const mulu32 = (a, b) => ((a >>> 0) * (b >>> 0)) >>> 0;
const subu32 = (a, b) => ((a >>> 0) - (b >>> 0)) >>> 0;
const andu32 = (a, b) => ((a >>> 0) & (b >>> 0)) >>> 0;
const oru32 = (a, b) => ((a >>> 0) | (b >>> 0)) >>> 0;
const xoru32 = (a, b) => ((a >>> 0) ^ (b >>> 0)) >>> 0;
const notu32 = (a) => ~a >>> 0;
const lshiftu32 = (a, b) => ((a >>> 0) << (b >>> 0)) >>> 0;
const rshiftu32 = (a, b) => ((a >>> 0) >>> (b >>> 0)) >>> 0;

const minError = (fn, error, q, res = 16, iter = 8, start = 0, end = 1, eps = EPS) => {
    if (iter <= 0)
        return (start + end) / 2;
    const delta = (end - start) / res;
    let minT = start;
    let minE = Infinity;
    for (let i = 0; i <= res; i++) {
        const t = start + i * delta;
        const e = error(q, fn(t));
        if (e < minE) {
            if (e <= eps)
                return t;
            minE = e;
            minT = t;
        }
    }
    return minError(fn, error, q, res, iter - 1, Math.max(minT - delta, 0), Math.min(minT + delta, 1));
};

const mix = (a, b, t) => a + (b - a) * t;
const mixBilinear = (a, b, c, d, u, v) => mix(mix(a, b, u), mix(c, d, u), v);
const mixQuadratic = (a, b, c, t) => {
    const s = 1 - t;
    return a * s * s + b * 2 * s * t + c * t * t;
};
const mixCubic = (a, b, c, d, t) => {
    const t2 = t * t;
    const s = 1 - t;
    const s2 = s * s;
    return a * s2 * s + b * 3 * s2 * t + c * 3 * t2 * s + d * t2 * t;
};
const tween = (f, from, to) => (t) => mix(from, to, f(t));
const circular = (t) => {
    t = 1 - t;
    return Math.sqrt(1 - t * t);
};
const cosine = (t) => 1 - (Math.cos(t * PI) * 0.5 + 0.5);
const decimated = (n, t) => Math.floor(t * n) / n;
const bounce = (k, amp, t) => {
    const tk = t * k;
    return 1 - ((amp * Math.sin(tk)) / tk) * Math.cos(t * HALF_PI);
};
const ease = (ease, t) => Math.pow(t, ease);
const impulse = (k, t) => {
    const h = k * t;
    return h * Math.exp(1 - h);
};
const gain = (k, t) => t < 0.5 ? 0.5 * Math.pow(2 * t, k) : 1 - 0.5 * Math.pow(2 - 2 * t, k);
const parabola = (k, t) => Math.pow(4.0 * t * (1.0 - t), k);
const cubicPulse = (w, c, t) => {
    t = Math.abs(t - c);
    return t > w ? 0 : ((t /= w), 1 - t * t * (3 - 2 * t));
};
const sinc = (k, t) => {
    t = PI * (k * t - 1.0);
    return Math.sin(t) / t;
};
const sigmoid = (k, t) => 1 / (1 + Math.exp(-k * (2 * t - 1)));
const sigmoid11 = (k, t) => 1 / (1 + Math.exp(-k * t));

const fmod = (a, b) => a - b * Math.floor(a / b);
const fract = (x) => x - Math.floor(x);
const trunc = (x) => (x < 0 ? Math.ceil(x) : Math.floor(x));
const roundTo = (x, prec = 1) => Math.round(x / prec) * prec;
const roundEps = (x, eps = EPS) => {
    const f = fract(x);
    return f <= eps || f >= 1 - eps ? Math.round(x) : x;
};

const simplifyRatio = (num, denom) => {
    let e1 = Math.abs(num);
    let e2 = Math.abs(denom);
    while (true) {
        if (e1 < e2) {
            const t = e1;
            e1 = e2;
            e2 = t;
        }
        const r = e1 % e2;
        if (r) {
            e1 = r;
        }
        else {
            return [num / e2, denom / e2];
        }
    }
};

const derivative = (f, eps = EPS) => (x) => (f(x + eps) - f(x)) / eps;
const solveLinear = (a, b) => -b / a;
const solveQuadratic = (a, b, c, eps = 1e-9) => {
    const d = 2 * a;
    let r = b * b - 4 * a * c;
    return r < 0
        ? []
        : r < eps
            ? [-b / d]
            : ((r = Math.sqrt(r)), [(-b - r) / d, (-b + r) / d]);
};
const solveCubic = (a, b, c, d, eps = 1e-9) => {
    const aa = a * a;
    const bb = b * b;
    const ba3 = b / (3 * a);
    const p = (3 * a * c - bb) / (3 * aa);
    const q = (2 * bb * b - 9 * a * b * c + 27 * aa * d) / (27 * aa * a);
    if (Math.abs(p) < eps) {
        return [Math.cbrt(-q) - ba3];
    }
    else if (Math.abs(q) < eps) {
        return p < 0
            ? [-Math.sqrt(-p) - ba3, -ba3, Math.sqrt(-p) - ba3]
            : [-ba3];
    }
    else {
        const denom = (q * q) / 4 + (p * p * p) / 27;
        if (Math.abs(denom) < eps) {
            return [(-1.5 * q) / p - ba3, (3 * q) / p - ba3];
        }
        else if (denom > 0) {
            const u = Math.cbrt(-q / 2 - Math.sqrt(denom));
            return [u - p / (3 * u) - ba3];
        }
        else {
            const u = 2 * Math.sqrt(-p / 3), t = Math.acos((3 * q) / p / u) / 3, k = (2 * Math.PI) / 3;
            return [
                u * Math.cos(t) - ba3,
                u * Math.cos(t - k) - ba3,
                u * Math.cos(t - 2 * k) - ba3
            ];
        }
    }
};

const step = (edge, x) => (x < edge ? 0 : 1);
const smoothStep = (edge, edge2, x) => {
    x = clamp01((x - edge) / (edge2 - edge));
    return (3 - 2 * x) * x * x;
};
const smootherStep = (edge, edge2, x) => {
    x = clamp01((x - edge) / (edge2 - edge));
    return x * x * x * (x * (x * 6 - 15) + 10);
};
const expStep = (k, n, x) => 1 - Math.exp(-k * Math.pow(x, n));

exports.DEG2RAD = DEG2RAD;
exports.EPS = EPS;
exports.HALF_PI = HALF_PI;
exports.INV_HALF_PI = INV_HALF_PI;
exports.INV_PI = INV_PI;
exports.INV_TAU = INV_TAU;
exports.PHI = PHI;
exports.PI = PI;
exports.QUARTER_PI = QUARTER_PI;
exports.RAD2DEG = RAD2DEG;
exports.SIXTH = SIXTH;
exports.SIXTH_PI = SIXTH_PI;
exports.SQRT2 = SQRT2;
exports.SQRT2_2 = SQRT2_2;
exports.SQRT2_3 = SQRT2_3;
exports.SQRT3 = SQRT3;
exports.TAU = TAU;
exports.THIRD = THIRD;
exports.THIRD_PI = THIRD_PI;
exports.TWO_THIRD = TWO_THIRD;
exports.absDiff = absDiff;
exports.absInnerAngle = absInnerAngle;
exports.absMax = absMax;
exports.absMin = absMin;
exports.absTheta = absTheta;
exports.addi16 = addi16;
exports.addi32 = addi32;
exports.addi8 = addi8;
exports.addu16 = addu16;
exports.addu32 = addu32;
exports.addu8 = addu8;
exports.andi16 = andi16;
exports.andi32 = andi32;
exports.andi8 = andi8;
exports.andu16 = andu16;
exports.andu32 = andu32;
exports.andu8 = andu8;
exports.angleDist = angleDist;
exports.atan2Abs = atan2Abs;
exports.bounce = bounce;
exports.circular = circular;
exports.clamp = clamp;
exports.clamp01 = clamp01;
exports.clamp11 = clamp11;
exports.classifyCrossing = classifyCrossing;
exports.cosine = cosine;
exports.cossin = cossin;
exports.cot = cot;
exports.csc = csc;
exports.cubicPulse = cubicPulse;
exports.decimated = decimated;
exports.deg = deg;
exports.derivative = derivative;
exports.divi16 = divi16;
exports.divi32 = divi32;
exports.divi8 = divi8;
exports.divu16 = divu16;
exports.divu32 = divu32;
exports.divu8 = divu8;
exports.ease = ease;
exports.eqDelta = eqDelta;
exports.eqDeltaFixed = eqDeltaFixed;
exports.expStep = expStep;
exports.fastCos = fastCos;
exports.fastSin = fastSin;
exports.fit = fit;
exports.fit01 = fit01;
exports.fit10 = fit10;
exports.fit11 = fit11;
exports.fitClamped = fitClamped;
exports.fmod = fmod;
exports.foldback = foldback;
exports.fract = fract;
exports.gain = gain;
exports.impulse = impulse;
exports.inOpenRange = inOpenRange;
exports.inRange = inRange;
exports.isCrossOver = isCrossOver;
exports.isCrossUnder = isCrossUnder;
exports.isMaxima = isMaxima;
exports.isMinima = isMinima;
exports.loc = loc;
exports.lshifti16 = lshifti16;
exports.lshifti32 = lshifti32;
exports.lshifti8 = lshifti8;
exports.lshiftu16 = lshiftu16;
exports.lshiftu32 = lshiftu32;
exports.lshiftu8 = lshiftu8;
exports.max2id = max2id;
exports.max3id = max3id;
exports.max4id = max4id;
exports.maximaIndex = maximaIndex;
exports.maximaIndices = maximaIndices;
exports.min2id = min2id;
exports.min3id = min3id;
exports.min4id = min4id;
exports.minError = minError;
exports.minimaIndex = minimaIndex;
exports.minimaIndices = minimaIndices;
exports.mix = mix;
exports.mixBilinear = mixBilinear;
exports.mixCubic = mixCubic;
exports.mixQuadratic = mixQuadratic;
exports.muli16 = muli16;
exports.muli32 = muli32;
exports.muli8 = muli8;
exports.mulu16 = mulu16;
exports.mulu32 = mulu32;
exports.mulu8 = mulu8;
exports.norm = norm;
exports.normCos = normCos;
exports.noti16 = noti16;
exports.noti32 = noti32;
exports.noti8 = noti8;
exports.notu16 = notu16;
exports.notu32 = notu32;
exports.notu8 = notu8;
exports.ori16 = ori16;
exports.ori32 = ori32;
exports.ori8 = ori8;
exports.oru16 = oru16;
exports.oru32 = oru32;
exports.oru8 = oru8;
exports.parabola = parabola;
exports.quadrant = quadrant;
exports.rad = rad;
exports.roundEps = roundEps;
exports.roundTo = roundTo;
exports.rshifti16 = rshifti16;
exports.rshifti32 = rshifti32;
exports.rshifti8 = rshifti8;
exports.rshiftu16 = rshiftu16;
exports.rshiftu32 = rshiftu32;
exports.rshiftu8 = rshiftu8;
exports.sclamp = sclamp;
exports.sec = sec;
exports.sigmoid = sigmoid;
exports.sigmoid11 = sigmoid11;
exports.sign = sign;
exports.signExtend16 = signExtend16;
exports.signExtend8 = signExtend8;
exports.simplifyRatio = simplifyRatio;
exports.sinc = sinc;
exports.sincos = sincos;
exports.smax = smax;
exports.smin = smin;
exports.smoothStep = smoothStep;
exports.smootherStep = smootherStep;
exports.solveCubic = solveCubic;
exports.solveLinear = solveLinear;
exports.solveQuadratic = solveQuadratic;
exports.step = step;
exports.subi16 = subi16;
exports.subi32 = subi32;
exports.subi8 = subi8;
exports.subu16 = subu16;
exports.subu32 = subu32;
exports.subu8 = subu8;
exports.trunc = trunc;
exports.tween = tween;
exports.wrap = wrap;
exports.wrap01 = wrap01;
exports.wrap11 = wrap11;
exports.xori16 = xori16;
exports.xori32 = xori32;
exports.xori8 = xori8;
exports.xoru16 = xoru16;
exports.xoru32 = xoru32;
exports.xoru8 = xoru8;

},{}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const cache = {};
const defonce = (id, factory) => cache.hasOwnProperty(id) ? cache[id] : (cache[id] = factory());

function memoize(fn, cache) {
    return (...args) => {
        let res;
        return cache.has(args)
            ? cache.get(args)
            : (cache.set(args, (res = fn.apply(null, args))), res);
    };
}

function memoize1(fn, cache) {
    !cache && (cache = new Map());
    return (x) => {
        let res;
        return cache.has(x)
            ? cache.get(x)
            : (cache.set(x, (res = fn(x))), res);
    };
}

function memoizeJ(fn, cache) {
    !cache && (cache = {});
    return (...args) => {
        const key = JSON.stringify(args);
        if (key !== undefined) {
            return key in cache
                ? cache[key]
                : (cache[key] = fn.apply(null, args));
        }
        return fn.apply(null, args);
    };
}

exports.defonce = defonce;
exports.memoize = memoize;
exports.memoize1 = memoize1;
exports.memoizeJ = memoizeJ;

},{}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const INV_MAX = 1 / 0xffffffff;
class ARandom {
    float(norm = 1) {
        return this.int() * INV_MAX * norm;
    }
    norm(norm = 1) {
        return this.int() * INV_MAX * norm * 2 - norm;
    }
    minmax(min, max) {
        return this.float() * (max - min) + min;
    }
    gaussian(n = 10, offset = -0.5, scale = 1) {
        let sum = 0;
        let m = n;
        while (m-- > 0)
            sum += this.float(scale);
        return sum / n + offset;
    }
}

const DEFAULT_SEED = 0xdecafbad;
class Smush32 extends ARandom {
    constructor(seed = DEFAULT_SEED) {
        super();
        this.buffer = new Uint32Array([seed, 0]);
    }
    copy() {
        const gen = new Smush32();
        gen.buffer.set(this.buffer);
        return gen;
    }
    seed(s) {
        this.buffer.set([s, 0]);
        return this;
    }
    int() {
        const b = this.buffer;
        const m = 0x5bd1e995;
        const k = (b[1]++ * m) >>> 0;
        const s = (b[0] = ((k ^ (k >> 24) ^ ((b[0] * m) >>> 0)) * m) >>> 0);
        return (s ^ (s >>> 13)) >>> 0;
    }
}

const random = Math.random;
class SystemRandom extends ARandom {
    int() {
        return (random() * 0xffffffff) >>> 0;
    }
    float(norm = 1) {
        return random() * norm;
    }
}
const SYSTEM = new SystemRandom();

const DEFAULT_SEED$1 = [0xdecafbad, 0x2fa9d75b, 0xe41f67e3, 0x5c83ec1a];
class XorShift128 extends ARandom {
    constructor(seed = DEFAULT_SEED$1) {
        super();
        this.buffer = new Uint32Array(4);
        this.seed(seed);
    }
    copy() {
        return new XorShift128(this.buffer);
    }
    bytes() {
        return new Uint8Array(this.buffer.buffer);
    }
    seed(seed) {
        this.buffer.set(seed);
        return this;
    }
    int() {
        const s = this.buffer;
        let t = s[3];
        let w;
        t ^= t << 11;
        t ^= t >>> 8;
        s[3] = s[2];
        s[2] = s[1];
        w = s[1] = s[0];
        return (s[0] = (t ^ w ^ (w >>> 19)) >>> 0);
    }
}

const DEFAULT_SEED$2 = [
    0xdecafbad,
    0x2fa9d75b,
    0xe41f67e3,
    0x5c83ec1a,
    0xf69a5c71
];
class XorWow extends ARandom {
    constructor(seed = DEFAULT_SEED$2) {
        super();
        this.buffer = new Uint32Array(5);
        this.seed(seed);
    }
    copy() {
        return new XorWow(this.buffer);
    }
    seed(seed) {
        this.buffer.set(seed);
        return this;
    }
    bytes() {
        return new Uint8Array(this.buffer.buffer);
    }
    int() {
        const s = this.buffer;
        let t = s[3];
        let w;
        t ^= t >>> 2;
        t ^= t << 1;
        s[3] = s[2];
        s[2] = s[1];
        w = s[1] = s[0];
        t ^= w;
        t ^= w << 4;
        s[0] = t;
        return (t + (s[4] += 0x587c5)) >>> 0;
    }
}

const DEFAULT_SEED$3 = 0xdecafbad;
class XsAdd extends ARandom {
    constructor(seed = DEFAULT_SEED$3) {
        super();
        this.buffer = new Uint32Array(4);
        this.seed(seed);
    }
    bytes() {
        return new Uint8Array(this.buffer.buffer);
    }
    copy() {
        const gen = new XsAdd();
        gen.buffer.set(this.buffer);
        return gen;
    }
    seed(seed) {
        const s = this.buffer;
        s.set([seed, 0, 0, 0]);
        for (let j = 0, i = 1; i < 8; j = i++) {
            let x = (s[j & 3] ^ (s[j & 3] >>> 30)) >>> 0;
            x = (0x8965 * x + (((0x6c07 * x) & 0xffff) << 16)) >>> 0;
            s[i & 3] ^= (i + x) >>> 0;
        }
        return this;
    }
    int() {
        const s = this.buffer;
        let t = s[0];
        t ^= t << 15;
        t ^= t >>> 18;
        t ^= s[3] << 11;
        s[0] = s[1];
        s[1] = s[2];
        s[2] = s[3];
        s[3] = t;
        return (t + s[2]) >>> 0;
    }
}

const randomID = (len = 4, prefix = "", syms = "abcdefghijklmnopqrstuvwxyz", rnd = SYSTEM) => {
    for (const n = syms.length; --len >= 0;) {
        prefix += syms[rnd.float(n) | 0];
    }
    return prefix;
};

const weightedRandom = (choices, weights, rnd = SYSTEM) => {
    const opts = choices
        .map(weights
        ? (x, i) => [x, weights[i]]
        : (x) => [x, 1])
        .sort((a, b) => b[1] - a[1]);
    const n = choices.length;
    let total = 0, i, r, sum;
    for (i = 0; i < n; i++) {
        total += opts[i][1];
    }
    return () => {
        r = rnd.float(total);
        sum = total;
        for (i = 0; i < n; i++) {
            sum -= opts[i][1];
            if (sum <= r) {
                return opts[i][0];
            }
        }
    };
};

exports.ARandom = ARandom;
exports.SYSTEM = SYSTEM;
exports.Smush32 = Smush32;
exports.SystemRandom = SystemRandom;
exports.XorShift128 = XorShift128;
exports.XorWow = XorWow;
exports.XsAdd = XsAdd;
exports.randomID = randomID;
exports.weightedRandom = weightedRandom;

},{}],12:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var api = require('@thi.ng/api');
var checks = require('@thi.ng/checks');
var errors = require('@thi.ng/errors');
var compose = require('@thi.ng/compose');
var compare = require('@thi.ng/compare');
var arrays = require('@thi.ng/arrays');
var random = require('@thi.ng/random');

class Reduced {
    constructor(val) {
        this.value = val;
    }
    deref() {
        return this.value;
    }
}
const reduced = (x) => new Reduced(x);
const isReduced = (x) => x instanceof Reduced;
const ensureReduced = (x) => x instanceof Reduced ? x : new Reduced(x);
const unreduced = (x) => (x instanceof Reduced ? x.deref() : x);

const parseArgs = (args) => args.length === 2
    ? [undefined, args[1]]
    : args.length === 3
        ? [args[1], args[2]]
        : errors.illegalArity(args.length);
function reduce(...args) {
    const rfn = args[0];
    const init = rfn[0];
    const complete = rfn[1];
    const reduce = rfn[2];
    args = parseArgs(args);
    const acc = args[0] == null ? init() : args[0];
    const xs = args[1];
    return unreduced(complete(checks.implementsFunction(xs, "$reduce")
        ? xs.$reduce(reduce, acc)
        : checks.isArrayLike(xs)
            ? reduceArray(reduce, acc, xs)
            : reduceIterable(reduce, acc, xs)));
}
const reduceArray = (rfn, acc, xs) => {
    for (let i = 0, n = xs.length; i < n; i++) {
        acc = rfn(acc, xs[i]);
        if (isReduced(acc)) {
            acc = acc.deref();
            break;
        }
    }
    return acc;
};
const reduceIterable = (rfn, acc, xs) => {
    for (let x of xs) {
        acc = rfn(acc, x);
        if (isReduced(acc)) {
            acc = acc.deref();
            break;
        }
    }
    return acc;
};
const reducer = (init, rfn) => [init, (acc) => acc, rfn];
const $$reduce = (rfn, args) => {
    const n = args.length - 1;
    return checks.isIterable(args[n])
        ? args.length > 1
            ? reduce(rfn.apply(null, args.slice(0, n)), args[n])
            : reduce(rfn(), args[0])
        : undefined;
};

function push(xs) {
    return xs
        ? [...xs]
        : reducer(() => [], (acc, x) => (acc.push(x), acc));
}

function* iterator(xform, xs) {
    const rfn = xform(push());
    const complete = rfn[1];
    const reduce = rfn[2];
    for (let x of xs) {
        const y = reduce([], x);
        if (isReduced(y)) {
            yield* unreduced(complete(y.deref()));
            return;
        }
        if (y.length) {
            yield* y;
        }
    }
    yield* unreduced(complete([]));
}
function* iterator1(xform, xs) {
    const reduce = xform([api.NO_OP, api.NO_OP, (_, x) => x])[2];
    for (let x of xs) {
        let y = reduce(api.SEMAPHORE, x);
        if (isReduced(y)) {
            y = unreduced(y.deref());
            if (y !== api.SEMAPHORE) {
                yield y;
            }
            return;
        }
        if (y !== api.SEMAPHORE) {
            yield y;
        }
    }
}
const $iter = (xform, args, impl = iterator1) => {
    const n = args.length - 1;
    return checks.isIterable(args[n])
        ? args.length > 1
            ? impl(xform.apply(null, args.slice(0, n)), args[n])
            : impl(xform(), args[0])
        : undefined;
};

const compR = (rfn, fn) => [rfn[0], rfn[1], fn];

function map(fn, src) {
    return src
        ? iterator1(map(fn), src)
        : (rfn) => {
            const r = rfn[2];
            return compR(rfn, (acc, x) => r(acc, fn(x)));
        };
}

function transduce(...args) {
    let acc, xs;
    switch (args.length) {
        case 4:
            xs = args[3];
            acc = args[2];
            break;
        case 3:
            xs = args[2];
            break;
        case 2:
            return map((x) => transduce(args[0], args[1], x));
        default:
            errors.illegalArity(args.length);
    }
    return reduce(args[0](args[1]), acc, xs);
}

const NO_OP_REDUCER = [api.NO_OP, api.NO_OP, api.NO_OP];
function run(tx, ...args) {
    if (args.length === 1) {
        transduce(tx, NO_OP_REDUCER, args[0]);
    }
    else {
        const fx = args[0];
        transduce(tx, [api.NO_OP, api.NO_OP, (_, x) => fx(x)], args[1]);
    }
}

const step = (tx) => {
    const [_, complete, reduce] = tx(push());
    let done = false;
    return (x) => {
        if (!done) {
            let acc = reduce([], x);
            done = isReduced(acc);
            if (done) {
                acc = complete(acc.deref());
            }
            return acc.length === 1 ? acc[0] : acc.length > 0 ? acc : undefined;
        }
    };
};

const __mathop = (rfn, fn, initDefault, args) => {
    const res = $$reduce(rfn, args);
    if (res !== undefined) {
        return res;
    }
    const init = args[0] || initDefault;
    return reducer(() => init, fn);
};

function add(...args) {
    return __mathop(add, (acc, x) => acc + x, 0, args);
}

function assocMap(xs) {
    return xs
        ? reduce(assocMap(), xs)
        : reducer(() => new Map(), (acc, [k, v]) => acc.set(k, v));
}

function assocObj(xs) {
    return xs
        ? reduce(assocObj(), xs)
        : reducer(() => ({}), (acc, [k, v]) => ((acc[k] = v), acc));
}

function conj(xs) {
    return xs
        ? reduce(conj(), xs)
        : reducer(() => new Set(), (acc, x) => acc.add(x));
}

function count(...args) {
    const res = $$reduce(count, args);
    if (res !== undefined) {
        return res;
    }
    let offset = args[0] || 0;
    let step = args[1] || 1;
    return reducer(() => offset, (acc, _) => acc + step);
}

function div(init, xs) {
    return xs
        ? reduce(div(init), xs)
        : reducer(() => init, (acc, x) => acc / x);
}

function every(...args) {
    const res = $$reduce(every, args);
    if (res !== undefined) {
        return res;
    }
    const pred = args[0];
    return reducer(() => true, pred
        ? (acc, x) => (pred(x) ? acc : reduced(false))
        : (acc, x) => (x ? acc : reduced(false)));
}

function fill(...args) {
    const res = $$reduce(fill, args);
    if (res !== undefined) {
        return res;
    }
    let start = args[0] || 0;
    return reducer(() => [], (acc, x) => ((acc[start++] = x), acc));
}
function fillN(...args) {
    return fill(...args);
}

const __groupByOpts = (opts) => (Object.assign({ key: compose.identity, group: push() }, opts));

function groupByMap(...args) {
    const res = $$reduce(groupByMap, args);
    if (res !== undefined) {
        return res;
    }
    const opts = __groupByOpts(args[0]);
    const [init, _, reduce] = opts.group;
    return reducer(() => new Map(), (acc, x) => {
        const k = opts.key(x);
        return acc.set(k, acc.has(k)
            ? reduce(acc.get(k), x)
            : reduce(init(), x));
    });
}

function frequencies(...args) {
    return ($$reduce(frequencies, args) ||
        groupByMap({ key: args[0] || compose.identity, group: count() }));
}

function groupByObj(...args) {
    const res = $$reduce(groupByObj, args);
    if (res) {
        return res;
    }
    const opts = __groupByOpts(args[0]);
    const [_init, _, _reduce] = opts.group;
    return reducer(() => ({}), (acc, x) => {
        const k = opts.key(x);
        acc[k] = acc[k]
            ? _reduce(acc[k], x)
            : _reduce(_init(), x);
        return acc;
    });
}

const branchPred = (key, b, l, r) => (x) => (key(x) & b ? r : l);
const groupBinary = (bits, key, branch, leaf, left = "l", right = "r") => {
    const init = branch || (() => ({}));
    let rfn = groupByObj({
        key: branchPred(key, 1, left, right),
        group: leaf || push()
    });
    for (let i = 2, maxIndex = 1 << bits; i < maxIndex; i <<= 1) {
        rfn = groupByObj({
            key: branchPred(key, i, left, right),
            group: [init, rfn[1], rfn[2]]
        });
    }
    return [init, rfn[1], rfn[2]];
};

function last(xs) {
    return xs ? reduce(last(), xs) : reducer(api.NO_OP, (_, x) => x);
}

function maxCompare(...args) {
    const res = $$reduce(maxCompare, args);
    if (res !== undefined) {
        return res;
    }
    const init = args[0];
    const cmp = args[1] || compare.compare;
    return reducer(init, (acc, x) => (cmp(acc, x) >= 0 ? acc : x));
}

function max(xs) {
    return xs
        ? reduce(max(), xs)
        : reducer(() => -Infinity, (acc, x) => Math.max(acc, x));
}

function mean(xs) {
    let n = 1;
    return xs
        ? reduce(mean(), xs)
        : [
            () => (n = 0),
            (acc) => (n > 1 ? acc / n : acc),
            (acc, x) => (n++, acc + x)
        ];
}

function minCompare(...args) {
    const res = $$reduce(minCompare, args);
    if (res !== undefined) {
        return res;
    }
    const init = args[0];
    const cmp = args[1] || compare.compare;
    return reducer(init, (acc, x) => (cmp(acc, x) <= 0 ? acc : x));
}

function min(xs) {
    return xs
        ? reduce(min(), xs)
        : reducer(() => Infinity, (acc, x) => Math.min(acc, x));
}

function mul(...args) {
    return __mathop(mul, (acc, x) => acc * x, 1, args);
}

const pushCopy = () => reducer(() => [], (acc, x) => ((acc = acc.slice()).push(x), acc));

function reductions(rfn, xs) {
    const [init, complete, _reduce] = rfn;
    return xs
        ? reduce(reductions(rfn), xs)
        : [
            () => [init()],
            (acc) => ((acc[acc.length - 1] = complete(acc[acc.length - 1])), acc),
            (acc, x) => {
                const res = _reduce(acc[acc.length - 1], x);
                if (isReduced(res)) {
                    acc.push(res.deref());
                    return reduced(acc);
                }
                acc.push(res);
                return acc;
            }
        ];
}

function some(...args) {
    const res = $$reduce(some, args);
    if (res !== undefined) {
        return res;
    }
    const pred = args[0];
    return reducer(() => false, pred
        ? (acc, x) => (pred(x) ? reduced(true) : acc)
        : (acc, x) => (x ? reduced(true) : acc));
}

function str(sep, xs) {
    sep = sep || "";
    let first = true;
    return xs
        ? [...xs].join(sep)
        : reducer(() => "", (acc, x) => ((acc = first ? acc + x : acc + sep + x), (first = false), acc));
}

function sub(...args) {
    return __mathop(sub, (acc, x) => acc - x, 0, args);
}

function benchmark(src) {
    return src
        ? iterator1(benchmark(), src)
        : (rfn) => {
            const r = rfn[2];
            let prev = Date.now();
            return compR(rfn, (acc, _) => {
                const t = Date.now();
                const x = t - prev;
                prev = t;
                return r(acc, x);
            });
        };
}

const cat = () => (rfn) => {
    const r = rfn[2];
    return compR(rfn, (acc, x) => {
        if (x) {
            for (let y of unreduced(x)) {
                acc = r(acc, y);
                if (isReduced(acc)) {
                    break;
                }
            }
        }
        return isReduced(x) ? ensureReduced(acc) : acc;
    });
};

function converge(...args) {
    return ($iter(converge, args) ||
        ((rfn) => {
            const r = rfn[2];
            const pred = args[0];
            let prev = api.SEMAPHORE;
            let done = false;
            return compR(rfn, (acc, x) => {
                if (done || (prev !== api.SEMAPHORE && pred(prev, x))) {
                    done = true;
                    return ensureReduced(r(acc, x));
                }
                prev = x;
                return r(acc, x);
            });
        }));
}

function range(from, to, step) {
    return new Range(from, to, step);
}
class Range {
    constructor(from, to, step) {
        if (from === undefined) {
            from = 0;
            to = Infinity;
        }
        else if (to === undefined) {
            to = from;
            from = 0;
        }
        step = step === undefined ? (from < to ? 1 : -1) : step;
        this.from = from;
        this.to = to;
        this.step = step;
    }
    *[Symbol.iterator]() {
        const step = this.step;
        const to = this.to;
        let from = this.from;
        if (step > 0) {
            while (from < to) {
                yield from;
                from += step;
            }
        }
        else if (step < 0) {
            while (from > to) {
                yield from;
                from += step;
            }
        }
    }
    $reduce(rfn, acc) {
        const step = this.step;
        if (step > 0) {
            for (let i = this.from, n = this.to; i < n && !isReduced(acc); i += step) {
                acc = rfn(acc, i);
            }
        }
        else {
            for (let i = this.from, n = this.to; i > n && !isReduced(acc); i += step) {
                acc = rfn(acc, i);
            }
        }
        return acc;
    }
}

function* range2d(...args) {
    let fromX, toX, stepX;
    let fromY, toY, stepY;
    switch (args.length) {
        case 6:
            stepX = args[4];
            stepY = args[5];
        case 4:
            [fromX, toX, fromY, toY] = args;
            break;
        case 2:
            [toX, toY] = args;
            fromX = fromY = 0;
            break;
        default:
            errors.illegalArity(args.length);
    }
    const rx = range(fromX, toX, stepX);
    for (let y of range(fromY, toY, stepY)) {
        for (let x of rx) {
            yield [x, y];
        }
    }
}

function* zip(...src) {
    const iters = src.map((s) => s[Symbol.iterator]());
    while (true) {
        const tuple = [];
        for (let i of iters) {
            let v = i.next();
            if (v.done) {
                return;
            }
            tuple.push(v.value);
        }
        yield tuple;
    }
}
const tuples = zip;

const buildKernel1d = (weights, w) => {
    const w2 = w >> 1;
    return [...zip(weights, range(-w2, w2 + 1))];
};
const buildKernel2d = (weights, w, h) => {
    const w2 = w >> 1;
    const h2 = h >> 1;
    return [...zip(weights, range2d(-w2, w2 + 1, -h2, h2 + 1))];
};
const kernelLookup1d = (src, x, width, wrap, border) => wrap
    ? ({ 0: w, 1: ox }) => {
        const xx = x < -ox ? width + ox : x >= width - ox ? ox - 1 : x + ox;
        return w * src[xx];
    }
    : ({ 0: w, 1: ox }) => {
        return x < -ox || x >= width - ox ? border : w * src[x + ox];
    };
const kernelLookup2d = (src, x, y, width, height, wrap, border) => wrap
    ? ({ 0: w, 1: { 0: ox, 1: oy } }) => {
        const xx = x < -ox ? width + ox : x >= width - ox ? ox - 1 : x + ox;
        const yy = y < -oy ? height + oy : y >= height - oy ? oy - 1 : y + oy;
        return w * src[yy * width + xx];
    }
    : ({ 0: w, 1: { 0: ox, 1: oy } }) => {
        return x < -ox || y < -oy || x >= width - ox || y >= height - oy
            ? border
            : w * src[(y + oy) * width + x + ox];
    };
const kernelError = () => errors.illegalArgs(`no kernel or kernel config`);
function convolve1d(opts, indices) {
    if (indices) {
        return iterator1(convolve1d(opts), indices);
    }
    const { src, width } = opts;
    const wrap = opts.wrap !== false;
    const border = opts.border || 0;
    const rfn = opts.reduce || add;
    let kernel = opts.kernel;
    if (!kernel) {
        !(opts.weights && opts.kwidth) && kernelError();
        kernel = buildKernel1d(opts.weights, opts.kwidth);
    }
    return map((p) => transduce(map(kernelLookup1d(src, p, width, wrap, border)), rfn(), kernel));
}
function convolve2d(opts, indices) {
    if (indices) {
        return iterator1(convolve2d(opts), indices);
    }
    const { src, width, height } = opts;
    const wrap = opts.wrap !== false;
    const border = opts.border || 0;
    const rfn = opts.reduce || add;
    let kernel = opts.kernel;
    if (!kernel) {
        !(opts.weights && opts.kwidth && opts.kheight) && kernelError();
        kernel = buildKernel2d(opts.weights, opts.kwidth, opts.kheight);
    }
    return map((p) => transduce(map(kernelLookup2d(src, p[0], p[1], width, height, wrap, border)), rfn(), kernel));
}

function dedupe(...args) {
    return ($iter(dedupe, args) ||
        ((rfn) => {
            const r = rfn[2];
            const equiv = args[0];
            let prev = api.SEMAPHORE;
            return compR(rfn, equiv
                ? (acc, x) => {
                    acc =
                        prev !== api.SEMAPHORE && equiv(prev, x)
                            ? acc
                            : r(acc, x);
                    prev = x;
                    return acc;
                }
                : (acc, x) => {
                    acc = prev === x ? acc : r(acc, x);
                    prev = x;
                    return acc;
                });
        }));
}

const delayed = (t) => map((x) => compose.delayed(x, t));

function distinct(...args) {
    return ($iter(distinct, args) ||
        ((rfn) => {
            const r = rfn[2];
            const opts = (args[0] || {});
            const key = opts.key;
            const seen = (opts.cache || (() => new Set()))();
            return compR(rfn, key
                ? (acc, x) => {
                    const k = key(x);
                    return !seen.has(k) ? (seen.add(k), r(acc, x)) : acc;
                }
                : (acc, x) => !seen.has(x) ? (seen.add(x), r(acc, x)) : acc);
        }));
}

function throttle(pred, src) {
    return src
        ? iterator1(throttle(pred), src)
        : (rfn) => {
            const r = rfn[2];
            const _pred = pred();
            return compR(rfn, (acc, x) => (_pred(x) ? r(acc, x) : acc));
        };
}

function dropNth(n, src) {
    if (src) {
        return iterator1(dropNth(n), src);
    }
    n = Math.max(0, n - 1);
    return throttle(() => {
        let skip = n;
        return () => (skip-- > 0 ? true : ((skip = n), false));
    });
}

function dropWhile(...args) {
    return ($iter(dropWhile, args) ||
        ((rfn) => {
            const r = rfn[2];
            const pred = args[0];
            let ok = true;
            return compR(rfn, (acc, x) => ((ok = ok && pred(x)) ? acc : r(acc, x)));
        }));
}

function drop(n, src) {
    return src
        ? iterator1(drop(n), src)
        : (rfn) => {
            const r = rfn[2];
            let m = n;
            return compR(rfn, (acc, x) => (m > 0 ? (m--, acc) : r(acc, x)));
        };
}

function duplicate(n = 1, src) {
    return src
        ? iterator(duplicate(n), src)
        : (rfn) => {
            const r = rfn[2];
            return compR(rfn, (acc, x) => {
                for (let i = n; i >= 0 && !isReduced(acc); i--) {
                    acc = r(acc, x);
                }
                return acc;
            });
        };
}

function filter(pred, src) {
    return src
        ? iterator1(filter(pred), src)
        : (rfn) => {
            const r = rfn[2];
            return compR(rfn, (acc, x) => (pred(x) ? r(acc, x) : acc));
        };
}

function filterFuzzy(...args) {
    const iter = args.length > 1 && $iter(filterFuzzy, args);
    if (iter) {
        return iter;
    }
    const query = args[0];
    const { key, equiv } = (args[1] || {});
    return filter((x) => arrays.fuzzyMatch(key != null ? key(x) : x, query, equiv));
}

function flattenWith(fn, src) {
    return src
        ? iterator(flattenWith(fn), src)
        : (rfn) => {
            const reduce = rfn[2];
            const flatten = (acc, x) => {
                const xx = fn(x);
                if (xx) {
                    for (let y of xx) {
                        acc = flatten(acc, y);
                        if (isReduced(acc)) {
                            break;
                        }
                    }
                    return acc;
                }
                return reduce(acc, x);
            };
            return compR(rfn, flatten);
        };
}

function flatten(src) {
    return flattenWith((x) => x != null && x[Symbol.iterator] && typeof x !== "string"
        ? x
        : undefined, src);
}

function mapIndexed(...args) {
    return ($iter(mapIndexed, args) ||
        ((rfn) => {
            const r = rfn[2];
            const fn = args[0];
            let i = args[1] || 0;
            return compR(rfn, (acc, x) => r(acc, fn(i++, x)));
        }));
}

function indexed(...args) {
    const iter = $iter(indexed, args);
    if (iter) {
        return iter;
    }
    const from = args[0] || 0;
    return mapIndexed((i, x) => [from + i, x]);
}

function interleave(sep, src) {
    return src
        ? iterator(interleave(sep), src)
        : (rfn) => {
            const r = rfn[2];
            const _sep = typeof sep === "function" ? sep : () => sep;
            return compR(rfn, (acc, x) => {
                acc = r(acc, _sep());
                return isReduced(acc) ? acc : r(acc, x);
            });
        };
}

function interpose(sep, src) {
    return src
        ? iterator(interpose(sep), src)
        : (rfn) => {
            const r = rfn[2];
            const _sep = typeof sep === "function" ? sep : () => sep;
            let first = true;
            return compR(rfn, (acc, x) => {
                if (first) {
                    first = false;
                    return r(acc, x);
                }
                acc = r(acc, _sep());
                return isReduced(acc) ? acc : r(acc, x);
            });
        };
}

function keep(...args) {
    return ($iter(keep, args) ||
        ((rfn) => {
            const r = rfn[2];
            const pred = args[0] || compose.identity;
            return compR(rfn, (acc, x) => pred(x) != null ? r(acc, x) : acc);
        }));
}

function labeled(id, src) {
    return src
        ? iterator1(labeled(id), src)
        : map(checks.isFunction(id) ? (x) => [id(x), x] : (x) => [id, x]);
}

const deepTransform = (spec) => {
    if (checks.isFunction(spec)) {
        return spec;
    }
    const mapfns = Object.keys(spec[1] || {}).reduce((acc, k) => ((acc[k] = deepTransform(spec[1][k])), acc), {});
    return (x) => {
        const res = Object.assign({}, x);
        for (let k in mapfns) {
            res[k] = mapfns[k](res[k]);
        }
        return spec[0](res);
    };
};

function mapDeep(spec, src) {
    return src ? iterator1(mapDeep(spec), src) : map(deepTransform(spec));
}

function mapKeys(...args) {
    const iter = $iter(mapKeys, args);
    if (iter) {
        return iter;
    }
    const keys = args[0];
    const copy = args[1] !== false;
    return map((x) => {
        const res = copy ? Object.assign({}, x) : x;
        for (let k in keys) {
            res[k] = keys[k](x[k]);
        }
        return res;
    });
}

function mapNth(...args) {
    const iter = $iter(mapNth, args);
    if (iter) {
        return iter;
    }
    let n = args[0] - 1;
    let offset;
    let fn;
    if (typeof args[1] === "number") {
        offset = args[1];
        fn = args[2];
    }
    else {
        fn = args[1];
        offset = 0;
    }
    return (rfn) => {
        const r = rfn[2];
        let skip = 0, off = offset;
        return compR(rfn, (acc, x) => {
            if (off === 0) {
                if (skip === 0) {
                    skip = n;
                    return r(acc, fn(x));
                }
                skip--;
            }
            else {
                off--;
            }
            return r(acc, x);
        });
    };
}

function mapVals(...args) {
    const iter = $iter(mapVals, args);
    if (iter) {
        return iter;
    }
    const fn = args[0];
    const copy = args[1] !== false;
    return map((x) => {
        const res = copy ? {} : x;
        for (let k in x) {
            res[k] = fn(x[k]);
        }
        return res;
    });
}

function comp(...fns) {
    return compose.comp.apply(null, fns);
}

function mapcat(fn, src) {
    return src ? iterator(mapcat(fn), src) : comp(map(fn), cat());
}

function take(n, src) {
    return src
        ? iterator(take(n), src)
        : (rfn) => {
            const r = rfn[2];
            let m = n;
            return compR(rfn, (acc, x) => --m > 0
                ? r(acc, x)
                : m === 0
                    ? ensureReduced(r(acc, x))
                    : reduced(acc));
        };
}

function matchFirst(pred, src) {
    return src
        ? [...iterator1(matchFirst(pred), src)][0]
        : comp(filter(pred), take(1));
}

const __drain = (buf, complete, reduce) => (acc) => {
    while (buf.length && !isReduced(acc)) {
        acc = reduce(acc, buf.shift());
    }
    return complete(acc);
};

function takeLast(n, src) {
    return src
        ? iterator(takeLast(n), src)
        : ([init, complete, reduce]) => {
            const buf = [];
            return [
                init,
                __drain(buf, complete, reduce),
                (acc, x) => {
                    if (buf.length === n) {
                        buf.shift();
                    }
                    buf.push(x);
                    return acc;
                }
            ];
        };
}

function matchLast(pred, src) {
    return src
        ? [...iterator(matchLast(pred), src)][0]
        : comp(filter(pred), takeLast(1));
}

function movingAverage(period, src) {
    return src
        ? iterator1(movingAverage(period), src)
        : (rfn) => {
            period |= 0;
            period < 2 && errors.illegalArgs("period must be >= 2");
            const reduce = rfn[2];
            const window = [];
            let sum = 0;
            return compR(rfn, (acc, x) => {
                const n = window.push(x);
                sum += x;
                n > period && (sum -= window.shift());
                return n >= period ? reduce(acc, sum / period) : acc;
            });
        };
}

const __sortOpts = (opts) => (Object.assign({ key: compose.identity, compare: compare.compare }, opts));

function partition(...args) {
    const iter = $iter(partition, args, iterator);
    if (iter) {
        return iter;
    }
    let size = args[0], all, step;
    if (typeof args[1] == "number") {
        step = args[1];
        all = args[2];
    }
    else {
        step = size;
        all = args[1];
    }
    return ([init, complete, reduce]) => {
        let buf = [];
        let skip = 0;
        return [
            init,
            (acc) => {
                if (all && buf.length > 0) {
                    acc = reduce(acc, buf);
                    buf = [];
                }
                return complete(acc);
            },
            (acc, x) => {
                if (skip <= 0) {
                    if (buf.length < size) {
                        buf.push(x);
                    }
                    if (buf.length === size) {
                        acc = reduce(acc, buf);
                        buf = step < size ? buf.slice(step) : [];
                        skip = step - size;
                    }
                }
                else {
                    skip--;
                }
                return acc;
            }
        ];
    };
}

function movingMedian(...args) {
    const iter = $iter(movingMedian, args);
    if (iter) {
        return iter;
    }
    const { key, compare } = __sortOpts(args[1]);
    const n = args[0];
    const m = n >> 1;
    return comp(partition(n, 1, true), map((window) => window.slice().sort((a, b) => compare(key(a), key(b)))[m]));
}

function multiplex(...args) {
    return map(compose.juxt.apply(null, args.map(step)));
}

const renamer = (kmap) => {
    const ks = Object.keys(kmap);
    const [a2, b2, c2] = ks;
    const [a1, b1, c1] = ks.map((k) => kmap[k]);
    switch (ks.length) {
        case 3:
            return (x) => {
                const res = {};
                let v;
                (v = x[c1]), v !== undefined && (res[c2] = v);
                (v = x[b1]), v !== undefined && (res[b2] = v);
                (v = x[a1]), v !== undefined && (res[a2] = v);
                return res;
            };
        case 2:
            return (x) => {
                const res = {};
                let v;
                (v = x[b1]), v !== undefined && (res[b2] = v);
                (v = x[a1]), v !== undefined && (res[a2] = v);
                return res;
            };
        case 1:
            return (x) => {
                const res = {};
                let v = x[a1];
                v !== undefined && (res[a2] = v);
                return res;
            };
        default:
            return (x) => {
                let k, v;
                const res = {};
                for (let i = ks.length - 1; i >= 0; i--) {
                    (k = ks[i]),
                        (v = x[kmap[k]]),
                        v !== undefined && (res[k] = v);
                }
                return res;
            };
    }
};

function rename(...args) {
    const iter = args.length > 2 && $iter(rename, args);
    if (iter) {
        return iter;
    }
    let kmap = args[0];
    if (checks.isArray(kmap)) {
        kmap = kmap.reduce((acc, k, i) => ((acc[k] = i), acc), {});
    }
    if (args[1]) {
        const ks = Object.keys(kmap);
        return map((y) => transduce(comp(map((k) => [k, y[kmap[k]]]), filter((x) => x[1] !== undefined)), args[1], ks));
    }
    else {
        return map(renamer(kmap));
    }
}

function multiplexObj(...args) {
    const iter = $iter(multiplexObj, args);
    if (iter) {
        return iter;
    }
    const [xforms, rfn] = args;
    const ks = Object.keys(xforms);
    return comp(multiplex.apply(null, ks.map((k) => xforms[k])), rename(ks, rfn));
}

const noop = () => (rfn) => rfn;

function padLast(n, fill, src) {
    return src
        ? iterator(padLast(n, fill), src)
        : ([init, complete, reduce]) => {
            let m = 0;
            return [
                init,
                (acc) => {
                    let rem = m % n;
                    if (rem > 0) {
                        while (++rem <= n && !isReduced(acc)) {
                            acc = reduce(acc, fill);
                        }
                    }
                    return complete(acc);
                },
                (acc, x) => (m++, reduce(acc, x))
            ];
        };
}

function page(...args) {
    return ($iter(page, args) ||
        comp(drop(args[0] * (args[1] || 10)), take(args[1] || 10)));
}

function partitionBy(...args) {
    return ($iter(partitionBy, args, iterator) ||
        (([init, complete, reduce]) => {
            const fn = args[0];
            const f = args[1] === true ? fn() : fn;
            let prev = api.SEMAPHORE;
            let chunk;
            return [
                init,
                (acc) => {
                    if (chunk && chunk.length) {
                        acc = reduce(acc, chunk);
                        chunk = null;
                    }
                    return complete(acc);
                },
                (acc, x) => {
                    const curr = f(x);
                    if (prev === api.SEMAPHORE) {
                        prev = curr;
                        chunk = [x];
                    }
                    else if (curr === prev) {
                        chunk.push(x);
                    }
                    else {
                        chunk && (acc = reduce(acc, chunk));
                        chunk = isReduced(acc) ? null : [x];
                        prev = curr;
                    }
                    return acc;
                }
            ];
        }));
}

function partitionOf(sizes, src) {
    return src
        ? iterator(partitionOf(sizes), src)
        : partitionBy(() => {
            let i = 0, j = 0;
            return () => {
                if (i++ === sizes[j]) {
                    i = 1;
                    j = (j + 1) % sizes.length;
                }
                return j;
            };
        }, true);
}

function partitionSort(...args) {
    const iter = $iter(partitionSort, args, iterator);
    if (iter) {
        return iter;
    }
    const { key, compare } = __sortOpts(args[1]);
    return comp(partition(args[0], true), mapcat((window) => window.slice().sort((a, b) => compare(key(a), key(b)))));
}

function partitionSync(...args) {
    return ($iter(partitionSync, args, iterator) ||
        (([init, complete, reduce]) => {
            let curr = {};
            let first = true;
            const currKeys = new Set();
            const { key, mergeOnly, reset, all } = Object.assign({ key: compose.identity, mergeOnly: false, reset: true, all: true }, args[1]);
            const ks = checks.isArray(args[0])
                ? new Set(args[0])
                : args[0];
            return [
                init,
                (acc) => {
                    if ((reset && all && currKeys.size > 0) ||
                        (!reset && first)) {
                        acc = reduce(acc, curr);
                        curr = undefined;
                        currKeys.clear();
                        first = false;
                    }
                    return complete(acc);
                },
                (acc, x) => {
                    const k = key(x);
                    if (ks.has(k)) {
                        curr[k] = x;
                        currKeys.add(k);
                        if (mergeOnly || requiredInputs(ks, currKeys)) {
                            acc = reduce(acc, curr);
                            first = false;
                            if (reset) {
                                curr = {};
                                currKeys.clear();
                            }
                            else {
                                curr = Object.assign({}, curr);
                            }
                        }
                    }
                    return acc;
                }
            ];
        }));
}
const requiredInputs = (required, curr) => {
    if (curr.size < required.size)
        return false;
    for (let id of required) {
        if (!curr.has(id))
            return false;
    }
    return true;
};

function pluck(key, src) {
    return src ? iterator1(pluck(key), src) : map((x) => x[key]);
}

function sample(...args) {
    const iter = $iter(sample, args);
    if (iter) {
        return iter;
    }
    const prob = args[0];
    const rnd = args[1] || random.SYSTEM;
    return (rfn) => {
        const r = rfn[2];
        return compR(rfn, (acc, x) => (rnd.float() < prob ? r(acc, x) : acc));
    };
}

function scan(...args) {
    return ((args.length > 2 && $iter(scan, args, iterator)) ||
        (([inito, completeo, reduceo]) => {
            const [initi, completei, reducei] = args[0];
            let acc = args.length > 1 && args[1] != null ? args[1] : initi();
            return [
                inito,
                (_acc) => {
                    let a = completei(acc);
                    if (a !== acc) {
                        _acc = unreduced(reduceo(_acc, a));
                    }
                    acc = a;
                    return completeo(_acc);
                },
                (_acc, x) => {
                    acc = reducei(acc, x);
                    if (isReduced(acc)) {
                        return ensureReduced(reduceo(_acc, acc.deref()));
                    }
                    return reduceo(_acc, acc);
                }
            ];
        }));
}

const keySelector = (keys) => renamer(keys.reduce((acc, x) => ((acc[x] = x), acc), {}));

function selectKeys(keys, src) {
    return src ? iterator1(selectKeys(keys), src) : map(keySelector(keys));
}

const sideEffect = (fn) => map((x) => (fn(x), x));

function slidingWindow(...args) {
    const iter = $iter(slidingWindow, args);
    if (iter) {
        return iter;
    }
    const size = args[0];
    const partial = args[1] !== false;
    return (rfn) => {
        const reduce = rfn[2];
        let buf = [];
        return compR(rfn, (acc, x) => {
            buf.push(x);
            if (partial || buf.length === size) {
                acc = reduce(acc, buf);
                buf = buf.slice(buf.length === size ? 1 : 0);
            }
            return acc;
        });
    };
}

function streamShuffle(...args) {
    return ($iter(streamShuffle, args, iterator) ||
        (([init, complete, reduce]) => {
            const n = args[0];
            const maxSwaps = args[1] || n;
            const buf = [];
            return [
                init,
                (acc) => {
                    while (buf.length && !isReduced(acc)) {
                        arrays.shuffle(buf, maxSwaps);
                        acc = reduce(acc, buf.shift());
                    }
                    acc = complete(acc);
                    return acc;
                },
                (acc, x) => {
                    buf.push(x);
                    arrays.shuffle(buf, maxSwaps);
                    if (buf.length === n) {
                        acc = reduce(acc, buf.shift());
                    }
                    return acc;
                }
            ];
        }));
}

function streamSort(...args) {
    const iter = $iter(streamSort, args, iterator);
    if (iter) {
        return iter;
    }
    const { key, compare } = __sortOpts(args[1]);
    const n = args[0];
    return ([init, complete, reduce]) => {
        const buf = [];
        return [
            init,
            __drain(buf, complete, reduce),
            (acc, x) => {
                const idx = arrays.binarySearch(buf, x, key, compare);
                buf.splice(idx < 0 ? -(idx + 1) : idx, 0, x);
                if (buf.length === n) {
                    acc = reduce(acc, buf.shift());
                }
                return acc;
            }
        ];
    };
}

function struct(fields, src) {
    return src
        ? iterator(struct(fields), src)
        : comp(partitionOf(fields.map((f) => f[1])), partition(fields.length), rename(fields.map((f) => f[0])), mapKeys(fields.reduce((acc, f) => (f[2] ? ((acc[f[0]] = f[2]), acc) : acc), {}), false));
}

function swizzle(order, src) {
    return src ? iterator1(swizzle(order), src) : map(arrays.swizzle(order));
}

function takeNth(n, src) {
    if (src) {
        return iterator1(takeNth(n), src);
    }
    n = Math.max(0, n - 1);
    return throttle(() => {
        let skip = 0;
        return () => (skip === 0 ? ((skip = n), true) : (skip--, false));
    });
}

function takeWhile(...args) {
    return ($iter(takeWhile, args) ||
        ((rfn) => {
            const r = rfn[2];
            const pred = args[0];
            let ok = true;
            return compR(rfn, (acc, x) => ((ok = ok && pred(x)) ? r(acc, x) : reduced(acc)));
        }));
}

function throttleTime(delay, src) {
    return src
        ? iterator1(throttleTime(delay), src)
        : throttle(() => {
            let last = 0;
            return () => {
                const t = Date.now();
                return t - last >= delay ? ((last = t), true) : false;
            };
        });
}

function toggle(on, off, initial = false, src) {
    return src
        ? iterator1(toggle(on, off, initial), src)
        : ([init, complete, reduce]) => {
            let state = initial;
            return [
                init,
                complete,
                (acc) => reduce(acc, (state = !state) ? on : off)
            ];
        };
}

const trace = (prefix = "") => sideEffect((x) => console.log(prefix, x));

function wordWrap(...args) {
    const iter = $iter(wordWrap, args, iterator);
    if (iter) {
        return iter;
    }
    const lineLength = args[0];
    const { delim, always } = Object.assign({ delim: 1, always: true }, args[1]);
    return partitionBy(() => {
        let n = 0;
        let flag = false;
        return (w) => {
            n += w.length + delim;
            if (n > lineLength + (always ? 0 : delim)) {
                flag = !flag;
                n = w.length + delim;
            }
            return flag;
        };
    }, true);
}

function juxtR(...rs) {
    let [a, b, c] = rs;
    const n = rs.length;
    switch (n) {
        case 1: {
            const r = a[2];
            return [
                () => [a[0]()],
                (acc) => [a[1](acc[0])],
                (acc, x) => {
                    const aa1 = r(acc[0], x);
                    if (isReduced(aa1)) {
                        return reduced([unreduced(aa1)]);
                    }
                    return [aa1];
                }
            ];
        }
        case 2: {
            const ra = a[2];
            const rb = b[2];
            return [
                () => [a[0](), b[0]()],
                (acc) => [a[1](acc[0]), b[1](acc[1])],
                (acc, x) => {
                    const aa1 = ra(acc[0], x);
                    const aa2 = rb(acc[1], x);
                    if (isReduced(aa1) || isReduced(aa2)) {
                        return reduced([unreduced(aa1), unreduced(aa2)]);
                    }
                    return [aa1, aa2];
                }
            ];
        }
        case 3: {
            const ra = a[2];
            const rb = b[2];
            const rc = c[2];
            return [
                () => [a[0](), b[0](), c[0]()],
                (acc) => [a[1](acc[0]), b[1](acc[1]), c[1](acc[2])],
                (acc, x) => {
                    const aa1 = ra(acc[0], x);
                    const aa2 = rb(acc[1], x);
                    const aa3 = rc(acc[2], x);
                    if (isReduced(aa1) || isReduced(aa2) || isReduced(aa3)) {
                        return reduced([
                            unreduced(aa1),
                            unreduced(aa2),
                            unreduced(aa3)
                        ]);
                    }
                    return [aa1, aa2, aa3];
                }
            ];
        }
        default:
            return [
                () => rs.map((r) => r[0]()),
                (acc) => rs.map((r, i) => r[1](acc[i])),
                (acc, x) => {
                    let done = false;
                    const res = [];
                    for (let i = 0; i < n; i++) {
                        let a = rs[i][2](acc[i], x);
                        if (isReduced(a)) {
                            done = true;
                            a = unreduced(a);
                        }
                        res[i] = a;
                    }
                    return done ? reduced(res) : res;
                }
            ];
    }
}

const lookup1d = (src) => (i) => src[i];
const lookup2d = (src, width) => (i) => src[i[0] + i[1] * width];
const lookup3d = (src, width, height) => {
    const stridez = width * height;
    return (i) => src[i[0] + i[1] * width + i[2] * stridez];
};

function* asIterable(src) {
    yield* src;
}

function* repeatedly(fn, n = Infinity) {
    while (n-- > 0) {
        yield fn();
    }
}

const choices = (choices, weights, rnd = random.SYSTEM) => repeatedly(weights
    ? random.weightedRandom(arrays.ensureArray(choices), weights, rnd)
    : () => choices[rnd.float(choices.length) | 0]);

function* concat(...xs) {
    for (let x of xs) {
        x != null && (yield* arrays.ensureIterable(x));
    }
}

function* cycle(input) {
    let cache = [];
    for (let i of input) {
        cache.push(i);
        yield i;
    }
    if (cache.length > 0) {
        while (true) {
            yield* cache;
        }
    }
}

function* normRange(n, inclLast = true) {
    if (n > 0) {
        for (let i = 0, m = inclLast ? n + 1 : n; i < m; i++) {
            yield i / n;
        }
    }
}

function* repeat(x, n = Infinity) {
    while (n-- > 0) {
        yield x;
    }
}

function* interpolate(n, minPos, maxPos, init, mix, ...stops) {
    let l = stops.length;
    if (l < 1)
        return;
    if (l === 1) {
        yield* repeat(mix(init(stops[0][1], stops[0][1]), 0), n);
    }
    stops.sort((a, b) => a[0] - b[0]);
    if (stops[l - 1][0] < maxPos) {
        stops.push([maxPos, stops[l - 1][1]]);
    }
    if (stops[0][0] > minPos) {
        stops.unshift([minPos, stops[0][1]]);
    }
    const range = maxPos - minPos;
    let start = stops[0][0];
    let end = stops[1][0];
    let delta = end - start;
    let interval = init(stops[0][1], stops[1][1]);
    let i = 1;
    l = stops.length;
    for (let t of normRange(n)) {
        t = minPos + range * t;
        if (t > end) {
            while (i < l && t > stops[i][0])
                i++;
            start = stops[i - 1][0];
            end = stops[i][0];
            delta = end - start;
            interval = init(stops[i - 1][1], stops[i][1]);
        }
        yield mix(interval, delta !== 0 ? (t - start) / delta : 0);
    }
}

function* iterate(fn, seed) {
    let i = 0;
    while (true) {
        yield seed;
        seed = fn(seed, ++i);
    }
}

function* keys(x) {
    for (let k in x) {
        if (x.hasOwnProperty(k)) {
            yield k;
        }
    }
}

function* pairs(x) {
    for (let k in x) {
        if (x.hasOwnProperty(k)) {
            yield [k, x[k]];
        }
    }
}

function* permutations(...src) {
    const n = src.length - 1;
    if (n < 0) {
        return;
    }
    const step = new Array(n + 1).fill(0);
    const realized = src.map(arrays.ensureArrayLike);
    const total = realized.reduce((acc, x) => acc * x.length, 1);
    for (let i = 0; i < total; i++) {
        const tuple = [];
        for (let j = n; j >= 0; j--) {
            const r = realized[j];
            let s = step[j];
            if (s === r.length) {
                step[j] = s = 0;
                j > 0 && step[j - 1]++;
            }
            tuple[j] = r[s];
        }
        step[n]++;
        yield tuple;
    }
}
const permutationsN = (n, m = n, offsets) => {
    if (offsets && offsets.length < n) {
        errors.illegalArgs(`insufficient offsets, got ${offsets.length}, needed ${n}`);
    }
    const seqs = [];
    while (--n >= 0) {
        const o = offsets ? offsets[n] : 0;
        seqs[n] = range(o, o + m);
    }
    return permutations.apply(null, seqs);
};

function* range3d(...args) {
    let fromX, toX, stepX;
    let fromY, toY, stepY;
    let fromZ, toZ, stepZ;
    switch (args.length) {
        case 9:
            stepX = args[6];
            stepY = args[7];
            stepZ = args[8];
        case 6:
            [fromX, toX, fromY, toY, fromZ, toZ] = args;
            break;
        case 3:
            [toX, toY, toZ] = args;
            fromX = fromY = fromZ = 0;
            break;
        default:
            errors.illegalArity(args.length);
    }
    const rx = range(fromX, toX, stepX);
    const ry = range(fromY, toY, stepY);
    for (let z of range(fromZ, toZ, stepZ)) {
        for (let y of ry) {
            for (let x of rx) {
                yield [x, y, z];
            }
        }
    }
}

function* reverse(input) {
    const _input = arrays.ensureArray(input);
    let n = _input.length;
    while (--n >= 0) {
        yield _input[n];
    }
}

function* vals(x) {
    for (let k in x) {
        if (x.hasOwnProperty(k)) {
            yield x[k];
        }
    }
}

function* wrap(src, n = 1, left = true, right = true) {
    const _src = arrays.ensureArray(src);
    (n < 0 || n > _src.length) &&
        errors.illegalArgs(`wrong number of wrap items: got ${n}, but max: ${_src.length}`);
    if (left) {
        for (let m = _src.length, i = m - n; i < m; i++) {
            yield _src[i];
        }
    }
    yield* _src;
    if (right) {
        for (let i = 0; i < n; i++) {
            yield _src[i];
        }
    }
}

exports.$$reduce = $$reduce;
exports.$iter = $iter;
exports.Range = Range;
exports.Reduced = Reduced;
exports.add = add;
exports.asIterable = asIterable;
exports.assocMap = assocMap;
exports.assocObj = assocObj;
exports.benchmark = benchmark;
exports.buildKernel1d = buildKernel1d;
exports.buildKernel2d = buildKernel2d;
exports.cat = cat;
exports.choices = choices;
exports.comp = comp;
exports.compR = compR;
exports.concat = concat;
exports.conj = conj;
exports.converge = converge;
exports.convolve1d = convolve1d;
exports.convolve2d = convolve2d;
exports.count = count;
exports.cycle = cycle;
exports.dedupe = dedupe;
exports.deepTransform = deepTransform;
exports.delayed = delayed;
exports.distinct = distinct;
exports.div = div;
exports.drop = drop;
exports.dropNth = dropNth;
exports.dropWhile = dropWhile;
exports.duplicate = duplicate;
exports.ensureReduced = ensureReduced;
exports.every = every;
exports.fill = fill;
exports.fillN = fillN;
exports.filter = filter;
exports.filterFuzzy = filterFuzzy;
exports.flatten = flatten;
exports.flattenWith = flattenWith;
exports.frequencies = frequencies;
exports.groupBinary = groupBinary;
exports.groupByMap = groupByMap;
exports.groupByObj = groupByObj;
exports.indexed = indexed;
exports.interleave = interleave;
exports.interpolate = interpolate;
exports.interpose = interpose;
exports.isReduced = isReduced;
exports.iterate = iterate;
exports.iterator = iterator;
exports.iterator1 = iterator1;
exports.juxtR = juxtR;
exports.keep = keep;
exports.keySelector = keySelector;
exports.keys = keys;
exports.labeled = labeled;
exports.last = last;
exports.lookup1d = lookup1d;
exports.lookup2d = lookup2d;
exports.lookup3d = lookup3d;
exports.map = map;
exports.mapDeep = mapDeep;
exports.mapIndexed = mapIndexed;
exports.mapKeys = mapKeys;
exports.mapNth = mapNth;
exports.mapVals = mapVals;
exports.mapcat = mapcat;
exports.matchFirst = matchFirst;
exports.matchLast = matchLast;
exports.max = max;
exports.maxCompare = maxCompare;
exports.mean = mean;
exports.min = min;
exports.minCompare = minCompare;
exports.movingAverage = movingAverage;
exports.movingMedian = movingMedian;
exports.mul = mul;
exports.multiplex = multiplex;
exports.multiplexObj = multiplexObj;
exports.noop = noop;
exports.normRange = normRange;
exports.padLast = padLast;
exports.page = page;
exports.pairs = pairs;
exports.partition = partition;
exports.partitionBy = partitionBy;
exports.partitionOf = partitionOf;
exports.partitionSort = partitionSort;
exports.partitionSync = partitionSync;
exports.permutations = permutations;
exports.permutationsN = permutationsN;
exports.pluck = pluck;
exports.push = push;
exports.pushCopy = pushCopy;
exports.range = range;
exports.range2d = range2d;
exports.range3d = range3d;
exports.reduce = reduce;
exports.reduced = reduced;
exports.reducer = reducer;
exports.reductions = reductions;
exports.rename = rename;
exports.renamer = renamer;
exports.repeat = repeat;
exports.repeatedly = repeatedly;
exports.reverse = reverse;
exports.run = run;
exports.sample = sample;
exports.scan = scan;
exports.selectKeys = selectKeys;
exports.sideEffect = sideEffect;
exports.slidingWindow = slidingWindow;
exports.some = some;
exports.step = step;
exports.str = str;
exports.streamShuffle = streamShuffle;
exports.streamSort = streamSort;
exports.struct = struct;
exports.sub = sub;
exports.swizzle = swizzle;
exports.take = take;
exports.takeLast = takeLast;
exports.takeNth = takeNth;
exports.takeWhile = takeWhile;
exports.throttle = throttle;
exports.throttleTime = throttleTime;
exports.toggle = toggle;
exports.trace = trace;
exports.transduce = transduce;
exports.tuples = tuples;
exports.unreduced = unreduced;
exports.vals = vals;
exports.wordWrap = wordWrap;
exports.wrap = wrap;
exports.zip = zip;

},{"@thi.ng/api":1,"@thi.ng/arrays":2,"@thi.ng/checks":4,"@thi.ng/compare":5,"@thi.ng/compose":6,"@thi.ng/errors":8,"@thi.ng/random":11}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var transducers = require('@thi.ng/transducers');
var errors = require('@thi.ng/errors');
var math = require('@thi.ng/math');
var checks = require('@thi.ng/checks');
var binary = require('@thi.ng/binary');
var memoize = require('@thi.ng/memoize');
var random$1 = require('@thi.ng/random');

const mi = -Infinity;
const mx = Infinity;
const MIN2 = Object.freeze([mi, mi]);
const MAX2 = Object.freeze([mx, mx]);
const ONE2 = Object.freeze([1, 1]);
const ZERO2 = Object.freeze([0, 0]);
const X2 = Object.freeze([1, 0]);
const Y2 = Object.freeze([0, 1]);
const MIN3 = Object.freeze([mi, mi, mi]);
const MAX3 = Object.freeze([mx, mx, mx]);
const ONE3 = Object.freeze([1, 1, 1]);
const ZERO3 = Object.freeze([0, 0, 0]);
const X3 = Object.freeze([1, 0, 0]);
const Y3 = Object.freeze([0, 1, 0]);
const Z3 = Object.freeze([0, 0, 1]);
const MIN4 = Object.freeze([mi, mi, mi, mi]);
const MAX4 = Object.freeze([mx, mx, mx, mx]);
const ONE4 = Object.freeze([1, 1, 1, 1]);
const ZERO4 = Object.freeze([0, 0, 0, 0]);
const X4 = Object.freeze([1, 0, 0, 0]);
const Y4 = Object.freeze([0, 1, 0, 0]);
const Z4 = Object.freeze([0, 0, 1, 0]);
const W4 = Object.freeze([0, 0, 0, 1]);

const declareIndex = (proto, id, idx, strided = true, defNumeric = true) => {
    const get = strided
        ? function () {
            return this.buf[this.offset + idx * this.stride];
        }
        : function () {
            return this.buf[this.offset + idx];
        };
    const set = strided
        ? function (n) {
            this.buf[this.offset + idx * this.stride] = n;
        }
        : function (n) {
            this.buf[this.offset + idx] = n;
        };
    defNumeric &&
        Object.defineProperty(proto, idx, {
            get,
            set,
            enumerable: true
        });
    Object.defineProperty(proto, id, {
        get,
        set,
        enumerable: true
    });
};
const declareIndices = (proto, props, strided, defNumeric) => props.forEach((id, i) => declareIndex(proto, id, i, strided, defNumeric));

class AVec {
    constructor(buf, offset = 0, stride = 1) {
        this.buf = buf;
        this.offset = offset;
        this.stride = stride;
    }
}

const MATH = (op) => ([o, a, b]) => `${o}=${a}${op}${b};`;
const MATH_N = (op) => ([o, a]) => `${o}=${a}${op}n;`;
const SIGNED = (op) => ([o, a, b]) => `${o}=(${a}${op}${b})|0;`;
const UNSIGNED = (op) => ([o, a, b]) => `${o}=(${a}${op}${b})>>>0;`;
const SIGNED_N = (op) => ([o, a]) => `${o}=(${a}${op}n)|0;`;
const UNSIGNED_N = (op) => ([o, a]) => `${o}=(${a}${op}n)>>>0;`;
const FN = (op = "op") => ([o, a]) => `${o}=${op}(${a});`;
const FN2 = (op = "op") => ([o, a, b]) => `${o}=${op}(${a},${b});`;
const FN3 = (op = "op") => ([o, a, b, c]) => `${o}=${op}(${a},${b},${c});`;
const FN5 = (op = "op") => ([o, a, b, c, d, e]) => `${o}=${op}(${a},${b},${c},${d},${e});`;
const FN_N = (op = "op") => ([o, a]) => `${o}=${op}(${a},n);`;
const DOT = ([a, b]) => `${a}*${b}`;
const DOT_G = ([a, b]) => `s+=${a}*${b};`;
const SET = ([o, a]) => `${o}=${a};`;
const SET_N = ([a]) => `${a}=n;`;
const ADDM = ([o, a, b, c]) => `${o}=(${a}+${b})*${c};`;
const ADDM_N = ([o, a, b]) => `${o}=(${a}+${b})*n;`;
const MADD = ([o, a, b, c]) => `${o}=${a}*${b}+${c};`;
const MADD_N = ([o, a, b]) => `${o}=${a}*n+${b};`;
const MIX = ([o, a, b, c]) => `${o}=${a}+(${b}-${a})*${c};`;
const MIX_N = ([o, a, b]) => `${o}=${a}+(${b}-${a})*n;`;
const SUBM = ([o, a, b, c]) => `${o}=(${a}-${b})*${c};`;
const SUBM_N = ([o, a, b]) => `${o}=(${a}-${b})*n;`;

const vop = (dispatch = 0) => {
    const impls = new Array(5);
    let fallback;
    const fn = (...args) => {
        const g = impls[args[dispatch].length] || fallback;
        return g
            ? g(...args)
            : errors.unsupported(`no impl for vec size ${args[dispatch].length}`);
    };
    fn.add = (dim, fn) => (impls[dim] = fn);
    fn.default = (fn) => (fallback = fn);
    return fn;
};

const ARGS_V = "o,a";
const ARGS_VV = "o,a,b";
const ARGS_VVV = "o,a,b,c";
const ARGS_VN = "o,a,n";
const ARGS_VNV = "o,a,n,b";
const ARGS_VVN = "o,a,b,n";
const SARGS_V = "io=0,ia=0,so=1,sa=1";
const SARGS_VV = "io=0,ia=0,ib=0,so=1,sa=1,sb=1";
const SARGS_VVV = "io=0,ia=0,ib=0,ic=0,so=1,sa=1,sb=1,sc=1";
const DEFAULT_OUT = "!o&&(o=a);";
const NEW_OUT = "!o&&(o=[]);";
const lookup = (sym) => (i) => i > 1
    ? `${sym}[i${sym}+${i}*s${sym}]`
    : i == 1
        ? `${sym}[i${sym}+s${sym}]`
        : `${sym}[i${sym}]`;
const indicesStrided = (sym) => transducers.map(lookup(sym), transducers.range());
const indices = (sym) => transducers.map((i) => `${sym}[${i}]`, transducers.range());
const assemble = (dim, tpl, syms, ret = "a", opJoin = "", pre = "", post = "", strided = false) => [
    pre,
    transducers.transduce(transducers.comp(transducers.take(dim), transducers.mapIndexed((i, x) => tpl(x, i))), transducers.str(opJoin), (transducers.zip.apply(null, (syms.split(",").map(strided ? indicesStrided : indices))))),
    post,
    ret !== "" ? `return ${ret};` : ""
];
const assembleG = (tpl, syms, ret = "a", pre, post, strided = false) => [
    pre,
    "for(let i=a.length;--i>=0;) {",
    tpl(syms
        .split(",")
        .map(strided ? (x) => `${x}[i${x}+i*s${x}]` : (x) => `${x}[i]`)),
    "}",
    post,
    ret !== null ? `return ${ret};` : ""
];
const defaultOut = (o, args) => `!${o} && (${o}=${args.split(",")[1]});`;
const compile = (dim, tpl, args, syms = args, ret = "a", opJoin, pre, post, strided = false) => (new Function(args, assemble(dim, tpl, syms, ret, opJoin, pre, post, strided).join("")));
const compileHOF = (dim, fns, tpl, hofArgs, args, syms = args, ret = "a", opJoin = "", pre, post, strided = false) => {
    return new Function(hofArgs, `return (${args})=>{${assemble(dim, tpl, syms, ret, opJoin, pre, post, strided).join("")}}`)(...fns);
};
const compileG = (tpl, args, syms = args, ret = "a", pre, post, strided = false) => (new Function(args, assembleG(tpl, syms, ret, pre, post, strided).join("")));
const compileGHOF = (fns, tpl, hofArgs, args, syms = args, ret = "a", pre, post, strided = false) => (new Function(hofArgs, `return (${args})=>{${assembleG(tpl, syms, ret, pre, post, strided).join("")}}`)(...fns));
const defOp = (tpl, args = ARGS_VV, syms, ret = "o", dispatch = 1, pre) => {
    syms = syms || args;
    pre = pre != null ? pre : defaultOut(ret, args);
    const fn = vop(dispatch);
    const $ = (dim) => fn.add(dim, compile(dim, tpl, args, syms, ret, "", pre));
    fn.default(compileG(tpl, args, syms, ret, pre));
    return [fn, $(2), $(3), $(4)];
};
const defFnOp = (op) => defOp(FN(op), ARGS_V);
const defHofOp = (op, tpl, args = ARGS_V, syms, ret = "o", dispatch = 1, pre) => {
    const _tpl = tpl || FN("op");
    syms = syms || args;
    pre = pre != null ? pre : defaultOut(ret, args);
    const $ = (dim) => compileHOF(dim, [op], _tpl, "op", args, syms, ret, "", pre);
    const fn = vop(dispatch);
    fn.default(compileGHOF([op], _tpl, "op", args, syms, ret, pre));
    return [fn, $(2), $(3), $(4)];
};
const defOpS = (tpl, args = `${ARGS_VV},${SARGS_VV}`, syms = ARGS_VV, ret = "o", pre, sizes = [2, 3, 4]) => sizes.map((dim) => compile(dim, tpl, args, syms, ret, "", pre != null ? pre : defaultOut(ret, args), "", true));
const defMathOp = (op) => defOp(MATH(op));
const defMathOpN = (op) => defOp(MATH_N(op), ARGS_VN);
const defBitOp = (op, signed = false) => defOp((signed ? SIGNED : UNSIGNED)(op));
const defBitOpN = (op, signed = false) => defOp((signed ? SIGNED_N : UNSIGNED_N)(op), ARGS_VN);

const mapBuffer = (ctor, buf, num, start, cstride, estride) => {
    const res = [];
    while (--num >= 0) {
        res.push(new ctor(buf, start, cstride));
        start += estride;
    }
    return res;
};
const intoBuffer = (set, buf, src, start, cstride, estride) => {
    for (let v of src) {
        set(buf, v, start, 0, cstride, 1);
        start += estride;
    }
    return buf;
};
function* vecIterator(ctor, buf, num, start, cstride, estride) {
    while (num-- > 0) {
        yield new ctor(buf, start, cstride);
        start += estride;
    }
}
function* values(buf, num, start, stride) {
    while (num-- > 0) {
        yield buf[start];
        start += stride;
    }
}

const $ = (dim) => eqDelta.add(dim, compileHOF(dim, [math.eqDelta, math.EPS], ([a, b]) => `eq(${a},${b},eps)`, "eq,_eps", "a,b,eps=_eps", "a,b", "", "&&", "return a.length === b.length && ", ";"));
const eqDelta = vop();
eqDelta.default((v1, v2, eps = math.EPS) => {
    if (checks.implementsFunction(v1, "eqDelta")) {
        return v1.eqDelta(v2, eps);
    }
    if (checks.implementsFunction(v2, "eqDelta")) {
        return v2.eqDelta(v1, eps);
    }
    return eqDeltaS(v1, v2, v1.length, eps);
});
const eqDelta2 = $(2);
const eqDelta3 = $(3);
const eqDelta4 = $(4);
const eqDeltaS = (a, b, n, eps = math.EPS, ia = 0, ib = 0, sa = 1, sb = 1) => {
    for (; n > 0; n--, ia += sa, ib += sb) {
        if (!math.eqDelta(a[ia], b[ib], eps)) {
            return false;
        }
    }
    return true;
};
const eqDeltaArray = (a, b, eps = math.EPS) => {
    if (a === b)
        return true;
    if (a.length !== b.length)
        return false;
    for (let i = a.length; --i >= 0;) {
        if (!eqDelta(a[i], b[i], eps)) {
            return false;
        }
    }
    return true;
};
const isInArray = (p, pts, eps = math.EPS) => {
    for (let i = pts.length; --i >= 0;) {
        if (eqDelta(p, pts[i], eps)) {
            return true;
        }
    }
    return false;
};

const hash = (v, H = 0x9e3779b1) => {
    let hash = -1;
    for (let i = v.length; --i >= 0;) {
        hash = (Math.imul(H, hash) + mix(hash, binary.floatToUintBits(v[i]))) >>> 0;
    }
    return hash;
};
const M1 = 0xcc9e2d51;
const M2 = 0x1b873593;
const M3 = 0xe6546b64;
const mix = (h, k) => {
    k = Math.imul(binary.rotateLeft(Math.imul(k, M1) >>> 0, 15), M2) >>> 0;
    return ((Math.imul(binary.rotateLeft(h ^ k, 13), 5) >>> 0) + M3) >>> 0;
};

const [setS2, setS3, setS4] = defOpS(SET, `o,a,${SARGS_V}`, "o,a", "o", NEW_OUT);
const setS = (out, a, n, io = 0, ia = 0, so = 1, sa = 1) => {
    for (let i = 0; i < n; i++) {
        out[io + i * so] = a[ia + i * sa];
    }
    return out;
};

class Vec2 extends AVec {
    constructor(buf, offset = 0, stride = 1) {
        super(buf || [0, 0], offset, stride);
    }
    static mapBuffer(buf, num = buf.length >> 1, start = 0, cstride = 1, estride = 2) {
        return mapBuffer(Vec2, buf, num, start, cstride, estride);
    }
    static intoBuffer(buf, src, start = 0, cstride = 1, estride = 2) {
        return intoBuffer(setS2, buf, src, start, cstride, estride);
    }
    static iterator(buf, num, start = 0, cstride = 1, estride = 2) {
        return vecIterator(Vec2, buf, num, start, cstride, estride);
    }
    [Symbol.iterator]() {
        return values(this.buf, 2, this.offset, this.stride);
    }
    get length() {
        return 2;
    }
    copy() {
        return new Vec2([this.x, this.y]);
    }
    copyView() {
        return new Vec2(this.buf, this.offset, this.stride);
    }
    empty() {
        return new Vec2();
    }
    eqDelta(v, eps = math.EPS) {
        return eqDelta2(this, v, eps);
    }
    hash() {
        return hash(this);
    }
    toJSON() {
        return [this.x, this.y];
    }
    toString() {
        return `[${this.x}, ${this.y}]`;
    }
}
Vec2.X_AXIS = new Vec2(X2);
Vec2.Y_AXIS = new Vec2(Y2);
Vec2.MIN = new Vec2(MIN2);
Vec2.MAX = new Vec2(MAX2);
Vec2.ZERO = new Vec2(ZERO2);
Vec2.ONE = new Vec2(ONE2);
declareIndices(Vec2.prototype, ["x", "y"]);
const vec2 = (x = 0, y = 0) => new Vec2([x, y]);
const vec2n = (n) => new Vec2([n, n]);
const asVec2 = (x) => x instanceof Vec2
    ? x
    : new Vec2(x.length >= 2 ? x : [x[0] || 0, x[1] || 0]);

class Vec3 extends AVec {
    constructor(buf, offset = 0, stride = 1) {
        super(buf || [0, 0, 0], offset, stride);
    }
    static mapBuffer(buf, num = (buf.length / 3) | 0, start = 0, cstride = 1, estride = 3) {
        return mapBuffer(Vec3, buf, num, start, cstride, estride);
    }
    static intoBuffer(buf, src, start = 0, cstride = 1, estride = 3) {
        return intoBuffer(setS3, buf, src, start, cstride, estride);
    }
    static iterator(buf, num, start = 0, cstride = 1, estride = 3) {
        return vecIterator(Vec3, buf, num, start, cstride, estride);
    }
    [Symbol.iterator]() {
        return values(this.buf, 3, this.offset, this.stride);
    }
    get length() {
        return 3;
    }
    copy() {
        return new Vec3([this.x, this.y, this.z]);
    }
    copyView() {
        return new Vec3(this.buf, this.offset, this.stride);
    }
    empty() {
        return new Vec3();
    }
    eqDelta(v, eps = math.EPS) {
        return eqDelta3(this, v, eps);
    }
    hash() {
        return hash(this);
    }
    toJSON() {
        return [this.x, this.y, this.z];
    }
    toString() {
        return `[${this.x}, ${this.y}, ${this.z}]`;
    }
}
Vec3.X_AXIS = new Vec3(X3);
Vec3.Y_AXIS = new Vec3(Y3);
Vec3.Z_AXIS = new Vec3(Z3);
Vec3.MIN = new Vec3(MIN3);
Vec3.MAX = new Vec3(MAX3);
Vec3.ZERO = new Vec3(ZERO3);
Vec3.ONE = new Vec3(ONE3);
declareIndices(Vec3.prototype, ["x", "y", "z"]);
const vec3 = (x = 0, y = 0, z = 0) => new Vec3([x, y, z]);
const vec3n = (n) => new Vec3([n, n, n]);
const asVec3 = (x) => x instanceof Vec3
    ? x
    : new Vec3(x.length >= 3 ? x : [x[0] || 0, x[1] || 0, x[2] || 0]);

class Vec4 extends AVec {
    constructor(buf, offset = 0, stride = 1) {
        super(buf || [0, 0, 0, 0], offset, stride);
    }
    static mapBuffer(buf, num = buf.length >> 2, start = 0, cstride = 1, estride = 4) {
        return mapBuffer(Vec4, buf, num, start, cstride, estride);
    }
    static intoBuffer(buf, src, start = 0, cstride = 1, estride = 4) {
        return intoBuffer(setS4, buf, src, start, cstride, estride);
    }
    static *iterator(buf, num, start = 0, cstride = 1, estride = 4) {
        return vecIterator(Vec4, buf, num, start, cstride, estride);
    }
    [Symbol.iterator]() {
        return values(this.buf, 4, this.offset, this.stride);
    }
    get length() {
        return 4;
    }
    copy() {
        return new Vec4([this.x, this.y, this.z, this.w]);
    }
    copyView() {
        return new Vec4(this.buf, this.offset, this.stride);
    }
    empty() {
        return new Vec4();
    }
    eqDelta(v, eps = math.EPS) {
        return eqDelta4(this, v, eps);
    }
    hash() {
        return hash(this);
    }
    toJSON() {
        return [this.x, this.y, this.z, this.w];
    }
    toString() {
        return `[${this.x}, ${this.y}, ${this.z}, ${this.w}]`;
    }
}
Vec4.X_AXIS = new Vec4(X4);
Vec4.Y_AXIS = new Vec4(Y4);
Vec4.Z_AXIS = new Vec4(Z4);
Vec4.MIN = new Vec4(MIN4);
Vec4.MAX = new Vec4(MAX4);
Vec4.ZERO = new Vec4(ZERO4);
Vec4.ONE = new Vec4(ONE4);
declareIndices(Vec4.prototype, ["x", "y", "z", "w"]);
const vec4 = (x = 0, y = 0, z = 0, w = 0) => new Vec4([x, y, z, w]);
const vec4n = (n) => new Vec4([n, n, n, n]);
const asVec4 = (x) => x instanceof Vec4
    ? x
    : new Vec4(x.length >= 4 ? x : [x[0] || 0, x[1] || 0, x[2] || 0, x[3] || 0]);

const [abs, abs2, abs3, abs4] = defFnOp("Math.abs");

const [acos, acos2, acos3, acos4] = defFnOp("Math.acos");

const [maddN, maddN2, maddN3, maddN4] = defOp(MADD_N, ARGS_VNV, ARGS_VV);

const [mulN, mulN2, mulN3, mulN4] = defMathOpN("*");

const addW2 = (out, a, b, wa, wb) => (!out && (out = a), maddN(out, b, wb, mulN(out, a, wa)));
const addW3 = (out, a, b, c, wa, wb, wc) => (!out && (out = a), maddN(out, c, wc, maddN(out, b, wb, mulN(out, a, wa))));
const addW4 = (out, a, b, c, d, wa, wb, wc, wd) => (!out && (out = a),
    maddN(out, d, wd, maddN(out, c, wc, maddN(out, b, wb, mulN(out, a, wa)))));
const addW5 = (out, a, b, c, d, e, wa, wb, wc, wd, we) => (!out && (out = a),
    maddN(out, e, we, maddN(out, d, wd, maddN(out, c, wc, maddN(out, b, wb, mulN(out, a, wa))))));

const [add, add2, add3, add4] = defMathOp("+");

const [addI, addI2, addI3, addI4] = defBitOp("+", true);
const [addU, addU2, addU3, addU4] = defBitOp("+");
const [addNI, addNI2, addNI3, addNI4] = defBitOpN("+", true);
const [addNU, addNU2, addNU3, addNU4] = defBitOpN("+");

const [addm, addm2, addm3, addm4] = defOp(ADDM, ARGS_VVV);

const [addmN, addmN2, addmN3, addmN4] = defOp(ADDM_N, ARGS_VVN);

const [addN, addN2, addN3, addN4] = defMathOpN("+");

const [addS2, addS3, addS4] = defOpS(MATH("+"));

const setC2 = (out, x, y) => (!out && (out = []), (out[0] = x), (out[1] = y), out);
const setC3 = (out, x, y, z) => (!out && (out = []), (out[0] = x), (out[1] = y), (out[2] = z), out);
const setC4 = (out, x, y, z, w) => (!out && (out = []),
    (out[0] = x),
    (out[1] = y),
    (out[2] = z),
    (out[3] = w),
    out);
const setC6 = (out, a, b, c, d, e, f) => (!out && (out = []),
    (out[0] = a),
    (out[1] = b),
    (out[2] = c),
    (out[3] = d),
    (out[4] = e),
    (out[5] = f),
    out);
const setC = (out, ...xs) => {
    !out && (out = []);
    for (let i = 0, n = xs.length; i < n; i++) {
        out[i] = xs[i];
    }
    return out;
};

const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const cross3 = (out, a, b) => setC3(out || a, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);

const $$1 = (dim) => dot.add(dim, compile(dim, DOT, "a,b", undefined, "", "+", "return ", ";"));
const dot = vop();
dot.default(compileG(DOT_G, "a,b", undefined, "s", "let s=0;"));
const dot2 = $$1(2);
const dot3 = $$1(3);
const dot4 = $$1(4);

const $$2 = (dim) => magSq.add(dim, compile(dim, ([a]) => `${a}*${a}`, "a", "a", "", "+", "return ", ";"));
const magSq = vop();
magSq.default(compileG(([a]) => `sum+=${a}*${a};`, "a", undefined, "sum", "let sum=0;"));
const magSq2 = $$2(2);
const magSq3 = $$2(3);
const magSq4 = $$2(4);

const mag = (v) => Math.sqrt(magSq(v));

const angleRatio = (a, b) => dot(a, b) / (mag(a) * mag(b));
const angleBetween2 = (a, b, absInner = false) => {
    const t = Math.atan2(cross2(a, b), dot(a, b));
    return absInner ? math.absInnerAngle(t) : t;
};
const angleBetween3 = (a, b, normalize = true, absInner = false) => {
    const t = normalize ? Math.acos(angleRatio(a, b)) : Math.acos(dot(a, b));
    return absInner ? math.absInnerAngle(t) : t;
};

const [asin, asin2, asin3, asin4] = defFnOp("Math.asin");

const [atan, atan2, atan3, atan4] = defFnOp("Math.atan");
const [atan_2, atan_22, atan_23, atan_24] = defOp(FN2("Math.atan2"), ARGS_VV);

const headingXY = (a) => math.atan2Abs(a[1], a[0]);
const headingXZ = (a) => math.atan2Abs(a[2], a[0]);
const headingYZ = (a) => math.atan2Abs(a[2], a[1]);
const heading = headingXY;

const bisect2 = (a, b) => {
    const theta = (headingXY(a) + headingXY(b)) / 2;
    return theta <= math.HALF_PI ? theta : math.PI - theta;
};

const [bitAndI, bitAndI2, bitAndI3, bitAndI4] = defBitOp("&", true);
const [bitAndU, bitAndU2, bitAndU3, bitAndU4] = defBitOp("&");
const [bitAndNI, bitAndNI2, bitAndNI3, bitAndNI4] = defBitOpN("&", true);
const [bitAndNU, bitAndNU2, bitAndNU3, bitAndNU4] = defBitOpN("&");

const [bitNotI, bitNotI2, bitNotI3, bitNotI4] = defOp(([o, a]) => `${o}=(~${a})|0;`, ARGS_V);
const [bitNotU, bitNotU2, bitNotU3, bitNotU4] = defOp(([o, a]) => `${o}=(~${a})>>>0;`, ARGS_V);

const [bitOrI, bitOrI2, bitOrI3, bitOrI4] = defBitOp("|", true);
const [bitOrU, bitOrU2, bitOrU3, bitOrU4] = defBitOp("|");
const [bitOrNI, bitOrNI2, bitOrNI3, bitOrNI4] = defBitOpN("|", true);
const [bitOrNU, bitOrNU2, bitOrNU3, bitOrNU4] = defBitOpN("|");

const [bitXorI, bitXorI2, bitXorI3, bitXorI4] = defBitOp("^", true);
const [bitXorU, bitXorU2, bitXorU3, bitXorU4] = defBitOp("^");
const [bitXorNI, bitXorNI2, bitXorNI3, bitXorNI4] = defBitOpN("^", true);
const [bitXorNU, bitXorNU2, bitXorNU3, bitXorNU4] = defBitOpN("^");

const cos = Math.cos;
const sin = Math.sin;
const cartesian = vop(1);
const cartesian2 = cartesian.add(2, (out, a, b = ZERO2) => maddN2(out || a, math.cossin(a[1]), a[0], b));
const cartesian3 = cartesian.add(3, (out, a, b = ZERO3) => {
    const r = a[0];
    const theta = a[1];
    const phi = a[2];
    const ct = cos(theta);
    return setC3(out || a, r * ct * cos(phi) + b[0], r * ct * sin(phi) + b[1], r * sin(theta) + b[2]);
});

const [ceil, ceil2, ceil3, ceil4] = defFnOp("Math.ceil");

const [clamp, clamp2, clamp3, clamp4] = defHofOp(math.clamp, FN3(), ARGS_VVV);
const [clamp01, clamp01_2, clamp01_3, clamp01_4] = defHofOp(math.clamp01, FN3(), ARGS_VVV);
const [clamp11, clamp11_2, clamp11_3, clamp11_4] = defHofOp(math.clamp11, FN3(), ARGS_VVV);

const [clampN, clampN2, clampN3, clampN4] = defHofOp(math.clamp, ([o, a]) => `${o}=op(${a},n,m);`, "o,a,n,m", "o,a");

const signedArea2 = (a, b, c) => {
    const ax = a[0];
    const ay = a[1];
    return (b[0] - ax) * (c[1] - ay) - (c[0] - ax) * (b[1] - ay);
};
const signedAreaC2 = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);

const corner2 = (a, b, c, eps = math.EPS) => math.sign(signedArea2(a, b, c), eps);
const clockwise2 = (a, b, c, eps = math.EPS) => corner2(a, b, c, eps) < 0;

const comparator2 = (o1, o2) => (a, b) => {
    const ax = a[o1];
    const ay = a[o2];
    const bx = b[o1];
    const by = b[o2];
    return ax === bx ? (ay === by ? 0 : ay < by ? -2 : 2) : ax < bx ? -1 : 1;
};
const comparator3 = (o1, o2, o3) => (a, b) => {
    const ax = a[o1];
    const ay = a[o2];
    const az = a[o3];
    const bx = b[o1];
    const by = b[o2];
    const bz = b[o3];
    return ax === bx
        ? ay === by
            ? az === bz
                ? 0
                : az < bz
                    ? -3
                    : 3
            : ay < by
                ? -2
                : 2
        : ax < bx
            ? -1
            : 1;
};
const comparator4 = (o1, o2, o3, o4) => (a, b) => {
    const ax = a[o1];
    const ay = a[o2];
    const az = a[o3];
    const aw = b[o4];
    const bx = b[o1];
    const by = b[o2];
    const bz = b[o3];
    const bw = b[o4];
    return ax === bx
        ? ay === by
            ? az === bz
                ? aw === bw
                    ? 0
                    : aw < bw
                        ? -4
                        : 4
                : az < bz
                    ? -3
                    : 3
            : ay < by
                ? -2
                : 2
        : ax < bx
            ? -1
            : 1;
};

const [set, set2, set3, set4] = defOp(SET, "o,a", undefined, "o", 1, NEW_OUT);

const copy = (v) => checks.implementsFunction(v, "copy") ? v.copy() : set([], v);
const copyVectors = (pts) => pts.map(copy);

const [cos$1, cos2, cos3, cos4] = defFnOp("Math.cos");

const [cosh, cosh2, cosh3, cosh4] = defFnOp("Math.cosh");

const [degrees, degrees2, degrees3, degrees4] = defHofOp(math.deg, FN("op"));

const normalize = (out, v, n = 1) => {
    !out && (out = v);
    const m = mag(v);
    return m >= math.EPS ? mulN(out, v, n / m) : out !== v ? set(out, v) : out;
};

const [sub, sub2, sub3, sub4] = defMathOp("-");

const direction = (out, a, b, n = 1) => normalize(null, sub(out || a, b, a), n);

const tpl = ([a, b]) => `t=${a}-${b};s+=t*t;`;
const pre = "let t,s=0;";
const $$3 = (dim) => distSq.add(dim, compile(dim, tpl, "a,b", undefined, "s", "", pre));
const distSq = vop();
distSq.default(compileG(tpl, "a,b", undefined, "s", pre));
const distSq2 = $$3(2);
const distSq3 = $$3(3);
const distSq4 = $$3(4);

const dist = (a, b) => Math.sqrt(distSq(a, b));

const $$4 = (dim) => distChebyshev.add(dim, compile(dim, ([a, b]) => `Math.abs(${a}-${b})`, "a,b", undefined, "", ",", "return Math.max(", ");"));
const distChebyshev = vop();
distChebyshev.default((a, b) => {
    let max = 0;
    for (let i = a.length; --i >= 0;) {
        max = Math.max(max, Math.abs(a[i] - b[i]));
    }
    return max;
});
const distChebyshev2 = $$4(2);
const distChebyshev3 = $$4(3);
const distChebyshev4 = $$4(4);

const $$5 = (dim) => distManhattan.add(dim, compile(dim, ([a, b]) => `Math.abs(${a}-${b})`, "a,b", undefined, "", "+", "return ", ";"));
const distManhattan = vop();
distManhattan.default(compileG(([a, b]) => `sum+=Math.abs(${a}-${b});`, "a,b", undefined, "sum", "let sum=0;"));
const distManhattan2 = $$5(2);
const distManhattan3 = $$5(3);
const distManhattan4 = $$5(4);

const [div, div2, div3, div4] = defMathOp("/");

const [divI, divI2, divI3, divI4] = defBitOp("/", true);
const [divU, divU2, divU3, divU4] = defBitOp("/");
const [divNI, divNI2, divNI3, divNI4] = defBitOpN("/", true);
const [divNU, divNU2, divNU3, divNU4] = defBitOpN("/");

const [divN, divN2, divN3, divN4] = defMathOpN("/");

const [divS2, divS3, divS4] = defOpS(MATH("/"));

const dotC4 = (a, b, c, d) => a * b + c * d;
const dotC6 = (a, b, c, d, e, f) => a * b + c * d + e * f;
const dotC8 = (a, b, c, d, e, f, g, h) => a * b + c * d + e * f + g * h;

const $$6 = (dim) => compile(dim, DOT, `o,a,${SARGS_V}`, "o,a", "", "+", "return ", ";", true);
const dotS2 = $$6(2);
const dotS3 = $$6(3);
const dotS4 = $$6(4);

const [setN, setN2, setN3, setN4] = defOp(SET_N, "a,n", "a", "a", 0, "");
const zero = (a) => setN(a, 0);
const one = (a) => setN(a, 1);
const zeroes = (n) => new Array(n).fill(0);
const ones = (n) => new Array(n).fill(1);

const empty = (v) => checks.implementsFunction(v, "empty") ? v.empty() : zeroes(v.length);

const every = vop();
every.default((v) => {
    for (let i = v.length; --i >= 0;) {
        if (!v[i])
            return false;
    }
    return true;
});
const every2 = every.add(2, (a) => a[0] && a[1]);
const every3 = every.add(3, (a) => a[0] && a[1] && a[2]);
const every4 = every.add(4, (a) => a[0] && a[1] && a[2] && a[3]);

const [exp, exp2, exp3, exp4] = defFnOp("Math.exp");

const [exp_2, exp_22, exp_23, exp_24] = defOp(([o, a]) => `${o}=Math.pow(2,${a});`, ARGS_V);

const faceForward = (out, n, i, nref) => {
    !out && (out = n);
    return dot(nref, i) < 0
        ? out !== n
            ? set(out, n)
            : out
        : mulN(out, n, -1);
};

const [fit, fit2, fit3, fit4] = defHofOp(math.fit, FN5(), "o,a,b,c,d,e");
const [fit01, fit01_2, fit01_3, fit01_4] = defHofOp(math.fit01, FN3(), ARGS_VVV);
const [fit11, fit11_2, fit11_3, fit11_4] = defHofOp(math.fit11, FN3(), ARGS_VVV);

const [floor, floor2, floor3, floor4] = defFnOp("Math.floor");

const [fmod, fmod2, fmod3, fmod4] = defHofOp(math.fmod, FN2("op"), ARGS_VV);

const [fmodN, fmodN2, fmodN3, fmodN4] = defHofOp(math.fmod, FN_N("op"), ARGS_VN, ARGS_V);

const [fract, fract2, fract3, fract4] = defHofOp(math.fract);

const SYM_B = "buf";
const SYM_L = "length";
const SYM_O = "offset";
const SYM_S = "stride";
const SYM_C = "copy";
const SYM_CV = "copyView";
const SYM_EMPTY = "empty";
const SYM_EQD = "eqDelta";
const SYM_STR = "toString";
const PROPS = new Set([
    SYM_B,
    SYM_C,
    SYM_CV,
    SYM_EMPTY,
    SYM_EQD,
    SYM_L,
    SYM_O,
    SYM_S,
    SYM_STR,
    Symbol.iterator
]);
const keys = memoize.memoize1((size) => [
    ...transducers.map(String, transducers.range(size)),
    ...PROPS
]);
const gvec = (buf, size, offset = 0, stride = 1) => new Proxy(buf, {
    get(obj, id) {
        switch (id) {
            case Symbol.iterator:
                return () => values(obj, size, offset, stride);
            case SYM_L:
                return size;
            case SYM_B:
                return buf;
            case SYM_O:
                return offset;
            case SYM_S:
                return stride;
            case SYM_C:
                return () => setS([], obj, size, 0, offset, 1, stride);
            case SYM_CV:
                return () => gvec(obj, size, offset, stride);
            case SYM_EMPTY:
                return () => zeroes(size);
            case SYM_EQD:
                return (o, eps = math.EPS) => eqDeltaS(buf, o, size, eps, offset, 0, stride, 1);
            case SYM_STR:
                return () => JSON.stringify([...values(obj, size, offset, stride)]);
            default:
                const j = parseInt(id);
                return !isNaN(j) && j >= 0 && j < size
                    ? obj[offset + j * stride]
                    : undefined;
        }
    },
    set(obj, id, value) {
        const j = parseInt(id);
        if (!isNaN(j) && j >= 0 && j < size) {
            obj[offset + (id | 0) * stride] = value;
        }
        else {
            switch (id) {
                case SYM_O:
                    offset = value;
                    break;
                case SYM_S:
                    stride = value;
                    break;
                case SYM_L:
                    size = value;
                    break;
                default:
                    return false;
            }
        }
        return true;
    },
    has(_, id) {
        return (id >= 0 && id < size) || PROPS.has(id);
    },
    ownKeys() {
        return keys(size);
    }
});

const headingSegmentXY = (a, b) => math.atan2Abs(b[1] - a[1], b[0] - a[0]);
const headingSegmentXZ = (a, b) => math.atan2Abs(b[2] - a[2], b[0] - a[0]);
const headingSegmentYZ = (a, b) => math.atan2Abs(b[2] - a[2], b[1] - a[1]);
const headingSegment = headingSegmentXY;

const fromHomogeneous = vop(1);
const fromHomogeneous3 = fromHomogeneous.add(3, (out, [x, y, w]) => setC2(out || [], x / w, y / w));
const fromHomogeneous4 = fromHomogeneous.add(4, (out, [x, y, z, w]) => setC3(out || [], x / w, y / w, z / w));

const [invert, invert2, invert3, invert4] = defOp(([o, a]) => `${o}=1/${a};`);

const [invSqrt, invSqrt2, invSqrt3, invSqrt4] = defOp(([o, a]) => `${o}=1/Math.sqrt(${a});`);

const [isInf, isInf2, isInf3, isInf4] = defFnOp("!isFinite");

const [isNaN$1, isNaN2, isNaN3, isNaN4] = defFnOp("isNaN");

const [random, random2, random3, random4] = defHofOp(random$1.SYSTEM, ([a]) => `${a}=rnd.minmax(n,m);`, "a,n=-1,m=1,rnd=op", "a", "a", 0, "");
const randNorm = (v, n = 1, rnd = random$1.SYSTEM) => {
    v = random(v, -1, 1, rnd);
    return normalize(v, v, n);
};
const [randMinMax, randMinMax2, randMinMax3, randMinMax4] = defHofOp(random$1.SYSTEM, ([o, a, b]) => `${o}=rnd.minmax(${a},${b});`, "o,a,b,rnd=op", "o,a,b");

const jitter = (out, a, n = 1, rnd = random$1.SYSTEM) => add(out, a, randNorm(new Array(a.length), n, rnd));

const limit = (out, v, n) => {
    !out && (out = v);
    const m = mag(v);
    return m > n ? mulN(out, v, n / m) : out !== v ? set(out, v) : out;
};

const [log, log2, log3, log4] = defFnOp("Math.log");

const [log_2, log_22, log_23, log_24] = defFnOp("Math.log2");

const [logicAnd, logicAnd2, logicAnd3, logicAnd4] = defOp(MATH("&&"));
const [logicAndN, logicAndN2, logicAndN3, logicAndN4] = defOp(MATH_N("&&"), ARGS_VN);

const [logicNot, logicNot2, logicNot3, logicNot4] = defFnOp("!");

const [logicOr, logicOr2, logicOr3, logicOr4] = defOp(MATH("||"));
const [logicOrN, logicOrN2, logicOrN3, logicOrN4] = defOp(MATH_N("||"), ARGS_VN);

const [lshiftI, lshiftI2, lshiftI3, lshiftI4] = defBitOp("<<", true);
const [lshiftU, lshiftU2, lshiftU3, lshiftU4] = defBitOp("<<");
const [lshiftNI, lshiftNI2, lshiftNI3, lshiftNI4] = defBitOpN("<<", true);
const [lshiftNU, lshiftNU2, lshiftNU3, lshiftNU4] = defBitOpN("<<");

const [madd, madd2, madd3, madd4] = defOp(MADD, ARGS_VVV);

const abs$1 = Math.abs;
const major = vop();
major.default((a) => {
    let id = -1;
    let max = -Infinity;
    for (let i = a.length; --i >= 0;) {
        const x = abs$1(a[i]);
        if (x > max) {
            max = x;
            id = i;
        }
    }
    return id;
});
const major2 = major.add(2, (a) => math.max2id(abs$1(a[0]), abs$1(a[1])));
const major3 = major.add(3, (a) => math.max3id(abs$1(a[0]), abs$1(a[1]), abs$1(a[2])));
const major4 = major.add(4, (a) => math.max4id(abs$1(a[0]), abs$1(a[1]), abs$1(a[2]), abs$1(a[3])));

const mapVV = (op, out, a, b, num, so = out.length * out.stride, sa = a.length * a.stride, sb = b.length * b.stride) => {
    while (num-- > 0) {
        op(out, a, b);
        out.offset += so;
        a.offset += sa;
        b.offset += sb;
    }
    return out.buf;
};
const mapV = (op, out, a, num, so = out.length * out.stride, sa = a.length * a.stride) => {
    while (num-- > 0) {
        op(out, a);
        out.offset += so;
        a.offset += sa;
    }
    return out.buf;
};
const mapVN = (op, out, a, n, num, so = out.length * out.stride, sa = a.length * a.stride) => {
    while (num-- > 0) {
        op(out, a, n);
        out.offset += so;
        a.offset += sa;
    }
    return out.buf;
};
const mapVVV = (op, out, a, b, c, num, so = out.length * out.stride, sa = a.length * a.stride, sb = b.length * b.stride, sc = c.length * c.stride) => {
    while (num-- > 0) {
        op(out, a, b, c);
        out.offset += so;
        a.offset += sa;
        b.offset += sb;
        c.offset += sc;
    }
    return out.buf;
};
const mapVVN = (op, out, a, b, n, num, so = out.length * out.stride, sa = a.length * a.stride, sb = b.length * b.stride) => {
    while (num-- > 0) {
        op(out, a, b, n);
        out.offset += so;
        a.offset += sa;
        b.offset += sb;
    }
    return out.buf;
};

const [max, max2, max3, max4] = defOp(FN2("Math.max"));

const [min, min2, min3, min4] = defOp(FN2("Math.min"));

const abs$2 = Math.abs;
const minor = vop();
minor.default((a) => {
    let id = -1;
    let min = Infinity;
    for (let i = a.length; --i >= 0;) {
        const x = abs$2(a[i]);
        if (x < min) {
            min = x;
            id = i;
        }
    }
    return id;
});
const minor2 = minor.add(2, (a) => math.min2id(abs$2(a[0]), abs$2(a[1])));
const minor3 = minor.add(3, (a) => math.min3id(abs$2(a[0]), abs$2(a[1]), abs$2(a[2])));
const minor4 = minor.add(4, (a) => math.min4id(abs$2(a[0]), abs$2(a[1]), abs$2(a[2]), abs$2(a[3])));

const [mixBilinear, mixBilinear2, mixBilinear3, mixBilinear4] = defHofOp(math.mixBilinear, ([o, a, b, c, d]) => `${o}=op(${a},${b},${c},${d},u,v);`, "o,a,b,c,d,u,v");

const mixCubic = (out, a, b, c, d, t) => {
    const s = 1 - t;
    const s2 = s * s;
    const t2 = t * t;
    return addW4(out, a, b, c, d, s2 * s, 3 * s2 * t, 3 * t2 * s, t2 * t);
};

const mixQuadratic = (out, a, b, c, t) => {
    const s = 1 - t;
    return addW3(out, a, b, c, s * s, 2 * s * t, t * t);
};

const [mix$1, mix2, mix3, mix4] = defOp(MIX, ARGS_VVV);

const [mixN, mixN2, mixN3, mixN4] = defOp(MIX_N, ARGS_VVN);

const [mod, mod2, mod3, mod4] = defMathOp("%");

const [modN, modN2, modN3, modN4] = defMathOpN("%");

const [mul, mul2, mul3, mul4] = defMathOp("*");

const [mulI, mulI2, mulI3, mulI4] = defBitOp("*", true);
const [mulU, mulU2, mulU3, mulU4] = defBitOp("*");
const [mulNI, mulNI2, mulNI3, mulNI4] = defBitOpN("*", true);
const [mulNU, mulNU2, mulNU3, mulNU4] = defBitOpN("*");

const [mulS2, mulS3, mulS4] = defOpS(MATH("*"));

const neg = (out, v) => mulN(out, v, -1);

const perpendicularCCW = (out, a) => setC2(out || a, -a[1], a[0]);
const perpendicularCW = (out, a) => setC2(out || a, a[1], -a[0]);

const normalCCW = (out, a, b, n = 1) => perpendicularCCW(null, direction(out || [], a, b, n));
const normalCW = (out, a, b, n = 1) => perpendicularCW(null, direction(out || [], a, b, n));

const orthoNormal3 = (out, a, b, c, doNormalize = true) => {
    out = cross3(null, sub3(out || a, b, a), sub3([], c, a));
    return doNormalize ? normalize(out, out) : out;
};

const sqrt = Math.sqrt;
const asin$1 = Math.asin;
const atan2$1 = Math.atan2;
const polar = vop(1);
const polar2 = polar.add(2, (out, a) => setC2(out || a, mag(a), atan2$1(a[1], a[0])));
const polar3 = polar.add(3, (out, a) => {
    const x = a[0];
    const y = a[1];
    const z = a[2];
    const r = sqrt(x * x + y * y + z * z);
    return setC3(out || a, r, asin$1(z / r), atan2$1(y, x));
});

const [pow, pow2, pow3, pow4] = defOp(FN2("Math.pow"));

const [powN, powN2, powN3, powN4] = defOp(FN_N("Math.pow"), ARGS_VN);

const project = (out, v, dir) => mulN(out || v, dir, dot(v, dir) / magSq(dir));

const [radians, radians2, radians3, radians4] = defHofOp(math.rad, FN("op"));

const reflect = (out, a, b) => maddN(out || a, b, -2 * dot(a, b), a);

const refract = (out, a, n, eta) => {
    !out && (out = a);
    const d = dot(a, n);
    const k = 1 - eta * eta * (1 - d * d);
    return k < 0
        ? zero(out)
        : maddN(out, n, -(eta * d + Math.sqrt(k)), mulN(out, a, eta));
};

const rotateAroundAxis3 = (out, v, axis, theta) => {
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const ax = axis[0];
    const ay = axis[1];
    const az = axis[2];
    const ux = ax * x;
    const uy = ax * y;
    const uz = ax * z;
    const vx = ay * x;
    const vy = ay * y;
    const vz = ay * z;
    const wx = az * x;
    const wy = az * y;
    const wz = az * z;
    const uvw = ux + vy + wz;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    return setC3(out || v, ax * uvw +
        (x * (ay * ay + az * az) - ax * (vy + wz)) * c +
        (-wy + vz) * s, ay * uvw +
        (y * (ax * ax + az * az) - ay * (ux + wz)) * c +
        (wx - uz) * s, az * uvw +
        (z * (ax * ax + ay * ay) - az * (ux + vy)) * c +
        (-vx + uy) * s);
};

const rotateAroundPoint2 = (out, v, p, theta) => {
    const x = v[0] - p[0];
    const y = v[1] - p[1];
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    return setC2(out || v, x * c - y * s + p[0], x * s + y * c + p[1]);
};

const _rotate = (u, v) => (out, a, theta) => {
    out ? out !== a && set(out, a) : (out = a);
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const x = a[u];
    const y = a[v];
    out[u] = x * c - y * s;
    out[v] = x * s + y * c;
    return out;
};
const rotateX = _rotate(1, 2);
const rotateY = _rotate(2, 0);
const rotateZ = _rotate(0, 1);

const [round, round2, round3, round4] = defHofOp(math.roundTo, FN_N("op"), "o,a,n=1", "o,a");

const [rshiftI, rshiftI2, rshiftI3, rshiftI4] = defBitOp(">>", true);
const [rshiftU, rshiftU2, rshiftU3, rshiftU4] = defBitOp(">>>");
const [rshiftNI, rshiftNI2, rshiftNI3, rshiftNI4] = defBitOpN(">>", true);
const [rshiftNU, rshiftNU2, rshiftNU3, rshiftNU4] = defBitOpN(">>>");

const [setSN2, setSN3, setSN4] = defOpS(SET_N, "o,n,io=0,so=1", "o", "o", "");

const setVN3 = (out, a, n) => setC3(out, a[0], a[1], n);
const setVN4 = (out, a, n) => setC4(out, a[0], a[1], a[2], n);

const setVV4 = (out, a, b) => setC4(out, a[0], a[1], b[0], b[1]);
const setVV6 = (out, a, b, c) => setC6(out, a[0], a[1], b[0], b[1], c[0], c[1]);
const setVV9 = (out, a, b, c) => setC(out, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
const setVV16 = (out, a, b, c, d) => setC(out, a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], c[0], c[1], c[2], c[3], d[0], d[1], d[2], d[3]);

const [sign, sign2, sign3, sign4] = defFnOp("Math.sign");

const [sin$1, sin2, sin3, sin4] = defFnOp("Math.sin");

const [sinh, sinh2, sinh3, sinh4] = defFnOp("Math.sinh");

const some = vop();
some.default((v) => {
    for (let i = v.length; --i >= 0;) {
        if (v[i])
            return true;
    }
    return false;
});
const some2 = some.add(2, (a) => a[0] || a[1]);
const some3 = some.add(3, (a) => a[0] || a[1] || a[2]);
const some4 = some.add(4, (a) => a[0] || a[1] || a[2] || a[3]);

const [sqrt$1, sqrt2, sqrt3, sqrt4] = defFnOp("Math.sqrt");

const [step, step2, step3, step4] = defHofOp(math.step, FN2("op"), "o,e,a", undefined, "o", 2, DEFAULT_OUT);

const [smoothStep, smoothStep2, smoothStep3, smoothStep4] = defHofOp(math.smoothStep, FN3(), "o,e1,e2,a", undefined, "o", 3, DEFAULT_OUT);

const [subI, subI2, subI3, subI4] = defBitOp("-", true);
const [subU, subU2, subU3, subU4] = defBitOp("-");
const [subNI, subNI2, subNI3, subNI4] = defBitOpN("-", true);
const [subNU, subNU2, subNU3, subNU4] = defBitOpN("-");

const [subm, subm2, subm3, subm4] = defOp(SUBM, ARGS_VVV);

const [submN, submN2, submN3, submN4] = defOp(SUBM_N, ARGS_VVN);

const [subN, subN2, subN3, subN4] = defMathOpN("-");

const [subS2, subS3, subS4] = defOpS(MATH("-"));

const sum = vop();
sum.default((v) => transducers.reduce(transducers.add(), v));
const sum2 = sum.add(2, (a) => a[0] + a[1]);
const sum3 = sum.add(3, (a) => a[0] + a[1] + a[2]);
const sum4 = sum.add(4, (a) => a[0] + a[1] + a[2] + a[3]);

const swizzle2 = (out, a, x, y) => setC2(out || a, a[x] || 0, a[y] || 0);
const swizzle3 = (out, a, x, y, z) => setC3(out || a, a[x] || 0, a[y] || 0, a[z] || 0);
const swizzle4 = (out, a, x, y, z, w) => setC4(out || a, a[x] || 0, a[y] || 0, a[z] || 0, a[w] || 0);
const swapXY = (out, v) => swizzle3(out, v, 1, 0, 2);
const swapXZ = (out, v) => swizzle3(out, v, 2, 1, 0);
const swapYZ = (out, v) => swizzle3(out, v, 0, 2, 1);
const setSwizzle1 = (out, n, a) => ((out[a] = n), out);
const setSwizzle2 = (out, v, a, b) => (((out[a] = v[0]), (out[b] = v[1])), out);
const setSwizzle3 = (out, v, a, b, c) => (((out[a] = v[0]), (out[b] = v[1]), (out[c] = v[2])), out);
const setSwizzle4 = (out, v, a, b, c, d) => (((out[a] = v[0]), (out[b] = v[1]), (out[c] = v[2]), (out[d] = v[3])), out);

const [tan, tan2, tan3, tan4] = defFnOp("Math.tan");

const [tanh, tanh2, tanh3, tanh4] = defFnOp("Math.tanh");

const [trunc, trunc2, trunc3, trunc4] = defFnOp("Math.trunc");

const vecOf = (size, n = 0) => new Array(size).fill(n);

const [wrap, wrap2, wrap3, wrap4] = defHofOp(math.wrap, FN3(), ARGS_VVV);

const [eq, eq2, eq3, eq4] = defOp(MATH("==="));

const [neq, neq2, neq3, neq4] = defOp(MATH("!=="));

const [gt, gt2, gt3, gt4] = defOp(MATH(">"));

const [gte, gte2, gte3, gte4] = defOp(MATH(">="));

const [lt, lt2, lt3, lt4] = defOp(MATH("<"));

const [lte, lte2, lte3, lte4] = defOp(MATH("<="));

exports.ADDM = ADDM;
exports.ADDM_N = ADDM_N;
exports.ARGS_V = ARGS_V;
exports.ARGS_VN = ARGS_VN;
exports.ARGS_VNV = ARGS_VNV;
exports.ARGS_VV = ARGS_VV;
exports.ARGS_VVN = ARGS_VVN;
exports.ARGS_VVV = ARGS_VVV;
exports.AVec = AVec;
exports.DEFAULT_OUT = DEFAULT_OUT;
exports.DOT = DOT;
exports.DOT_G = DOT_G;
exports.FN = FN;
exports.FN2 = FN2;
exports.FN3 = FN3;
exports.FN5 = FN5;
exports.FN_N = FN_N;
exports.MADD = MADD;
exports.MADD_N = MADD_N;
exports.MATH = MATH;
exports.MATH_N = MATH_N;
exports.MAX2 = MAX2;
exports.MAX3 = MAX3;
exports.MAX4 = MAX4;
exports.MIN2 = MIN2;
exports.MIN3 = MIN3;
exports.MIN4 = MIN4;
exports.MIX = MIX;
exports.MIX_N = MIX_N;
exports.NEW_OUT = NEW_OUT;
exports.ONE2 = ONE2;
exports.ONE3 = ONE3;
exports.ONE4 = ONE4;
exports.SARGS_V = SARGS_V;
exports.SARGS_VV = SARGS_VV;
exports.SARGS_VVV = SARGS_VVV;
exports.SET = SET;
exports.SET_N = SET_N;
exports.SIGNED = SIGNED;
exports.SIGNED_N = SIGNED_N;
exports.SUBM = SUBM;
exports.SUBM_N = SUBM_N;
exports.UNSIGNED = UNSIGNED;
exports.UNSIGNED_N = UNSIGNED_N;
exports.Vec2 = Vec2;
exports.Vec3 = Vec3;
exports.Vec4 = Vec4;
exports.W4 = W4;
exports.X2 = X2;
exports.X3 = X3;
exports.X4 = X4;
exports.Y2 = Y2;
exports.Y3 = Y3;
exports.Y4 = Y4;
exports.Z3 = Z3;
exports.Z4 = Z4;
exports.ZERO2 = ZERO2;
exports.ZERO3 = ZERO3;
exports.ZERO4 = ZERO4;
exports.abs = abs;
exports.abs2 = abs2;
exports.abs3 = abs3;
exports.abs4 = abs4;
exports.acos = acos;
exports.acos2 = acos2;
exports.acos3 = acos3;
exports.acos4 = acos4;
exports.add = add;
exports.add2 = add2;
exports.add3 = add3;
exports.add4 = add4;
exports.addI = addI;
exports.addI2 = addI2;
exports.addI3 = addI3;
exports.addI4 = addI4;
exports.addN = addN;
exports.addN2 = addN2;
exports.addN3 = addN3;
exports.addN4 = addN4;
exports.addNI = addNI;
exports.addNI2 = addNI2;
exports.addNI3 = addNI3;
exports.addNI4 = addNI4;
exports.addNU = addNU;
exports.addNU2 = addNU2;
exports.addNU3 = addNU3;
exports.addNU4 = addNU4;
exports.addS2 = addS2;
exports.addS3 = addS3;
exports.addS4 = addS4;
exports.addU = addU;
exports.addU2 = addU2;
exports.addU3 = addU3;
exports.addU4 = addU4;
exports.addW2 = addW2;
exports.addW3 = addW3;
exports.addW4 = addW4;
exports.addW5 = addW5;
exports.addm = addm;
exports.addm2 = addm2;
exports.addm3 = addm3;
exports.addm4 = addm4;
exports.addmN = addmN;
exports.addmN2 = addmN2;
exports.addmN3 = addmN3;
exports.addmN4 = addmN4;
exports.angleBetween2 = angleBetween2;
exports.angleBetween3 = angleBetween3;
exports.angleRatio = angleRatio;
exports.asVec2 = asVec2;
exports.asVec3 = asVec3;
exports.asVec4 = asVec4;
exports.asin = asin;
exports.asin2 = asin2;
exports.asin3 = asin3;
exports.asin4 = asin4;
exports.atan = atan;
exports.atan2 = atan2;
exports.atan3 = atan3;
exports.atan4 = atan4;
exports.atan_2 = atan_2;
exports.atan_22 = atan_22;
exports.atan_23 = atan_23;
exports.atan_24 = atan_24;
exports.bisect2 = bisect2;
exports.bitAndI = bitAndI;
exports.bitAndI2 = bitAndI2;
exports.bitAndI3 = bitAndI3;
exports.bitAndI4 = bitAndI4;
exports.bitAndNI = bitAndNI;
exports.bitAndNI2 = bitAndNI2;
exports.bitAndNI3 = bitAndNI3;
exports.bitAndNI4 = bitAndNI4;
exports.bitAndNU = bitAndNU;
exports.bitAndNU2 = bitAndNU2;
exports.bitAndNU3 = bitAndNU3;
exports.bitAndNU4 = bitAndNU4;
exports.bitAndU = bitAndU;
exports.bitAndU2 = bitAndU2;
exports.bitAndU3 = bitAndU3;
exports.bitAndU4 = bitAndU4;
exports.bitNotI = bitNotI;
exports.bitNotI2 = bitNotI2;
exports.bitNotI3 = bitNotI3;
exports.bitNotI4 = bitNotI4;
exports.bitNotU = bitNotU;
exports.bitNotU2 = bitNotU2;
exports.bitNotU3 = bitNotU3;
exports.bitNotU4 = bitNotU4;
exports.bitOrI = bitOrI;
exports.bitOrI2 = bitOrI2;
exports.bitOrI3 = bitOrI3;
exports.bitOrI4 = bitOrI4;
exports.bitOrNI = bitOrNI;
exports.bitOrNI2 = bitOrNI2;
exports.bitOrNI3 = bitOrNI3;
exports.bitOrNI4 = bitOrNI4;
exports.bitOrNU = bitOrNU;
exports.bitOrNU2 = bitOrNU2;
exports.bitOrNU3 = bitOrNU3;
exports.bitOrNU4 = bitOrNU4;
exports.bitOrU = bitOrU;
exports.bitOrU2 = bitOrU2;
exports.bitOrU3 = bitOrU3;
exports.bitOrU4 = bitOrU4;
exports.bitXorI = bitXorI;
exports.bitXorI2 = bitXorI2;
exports.bitXorI3 = bitXorI3;
exports.bitXorI4 = bitXorI4;
exports.bitXorNI = bitXorNI;
exports.bitXorNI2 = bitXorNI2;
exports.bitXorNI3 = bitXorNI3;
exports.bitXorNI4 = bitXorNI4;
exports.bitXorNU = bitXorNU;
exports.bitXorNU2 = bitXorNU2;
exports.bitXorNU3 = bitXorNU3;
exports.bitXorNU4 = bitXorNU4;
exports.bitXorU = bitXorU;
exports.bitXorU2 = bitXorU2;
exports.bitXorU3 = bitXorU3;
exports.bitXorU4 = bitXorU4;
exports.cartesian = cartesian;
exports.cartesian2 = cartesian2;
exports.cartesian3 = cartesian3;
exports.ceil = ceil;
exports.ceil2 = ceil2;
exports.ceil3 = ceil3;
exports.ceil4 = ceil4;
exports.clamp = clamp;
exports.clamp01 = clamp01;
exports.clamp01_2 = clamp01_2;
exports.clamp01_3 = clamp01_3;
exports.clamp01_4 = clamp01_4;
exports.clamp11 = clamp11;
exports.clamp11_2 = clamp11_2;
exports.clamp11_3 = clamp11_3;
exports.clamp11_4 = clamp11_4;
exports.clamp2 = clamp2;
exports.clamp3 = clamp3;
exports.clamp4 = clamp4;
exports.clampN = clampN;
exports.clampN2 = clampN2;
exports.clampN3 = clampN3;
exports.clampN4 = clampN4;
exports.clockwise2 = clockwise2;
exports.comparator2 = comparator2;
exports.comparator3 = comparator3;
exports.comparator4 = comparator4;
exports.compile = compile;
exports.compileG = compileG;
exports.compileGHOF = compileGHOF;
exports.compileHOF = compileHOF;
exports.copy = copy;
exports.copyVectors = copyVectors;
exports.corner2 = corner2;
exports.cos = cos$1;
exports.cos2 = cos2;
exports.cos3 = cos3;
exports.cos4 = cos4;
exports.cosh = cosh;
exports.cosh2 = cosh2;
exports.cosh3 = cosh3;
exports.cosh4 = cosh4;
exports.cross2 = cross2;
exports.cross3 = cross3;
exports.declareIndex = declareIndex;
exports.declareIndices = declareIndices;
exports.defBitOp = defBitOp;
exports.defBitOpN = defBitOpN;
exports.defFnOp = defFnOp;
exports.defHofOp = defHofOp;
exports.defMathOp = defMathOp;
exports.defMathOpN = defMathOpN;
exports.defOp = defOp;
exports.defOpS = defOpS;
exports.defaultOut = defaultOut;
exports.degrees = degrees;
exports.degrees2 = degrees2;
exports.degrees3 = degrees3;
exports.degrees4 = degrees4;
exports.direction = direction;
exports.dist = dist;
exports.distChebyshev = distChebyshev;
exports.distChebyshev2 = distChebyshev2;
exports.distChebyshev3 = distChebyshev3;
exports.distChebyshev4 = distChebyshev4;
exports.distManhattan = distManhattan;
exports.distManhattan2 = distManhattan2;
exports.distManhattan3 = distManhattan3;
exports.distManhattan4 = distManhattan4;
exports.distSq = distSq;
exports.distSq2 = distSq2;
exports.distSq3 = distSq3;
exports.distSq4 = distSq4;
exports.div = div;
exports.div2 = div2;
exports.div3 = div3;
exports.div4 = div4;
exports.divI = divI;
exports.divI2 = divI2;
exports.divI3 = divI3;
exports.divI4 = divI4;
exports.divN = divN;
exports.divN2 = divN2;
exports.divN3 = divN3;
exports.divN4 = divN4;
exports.divNI = divNI;
exports.divNI2 = divNI2;
exports.divNI3 = divNI3;
exports.divNI4 = divNI4;
exports.divNU = divNU;
exports.divNU2 = divNU2;
exports.divNU3 = divNU3;
exports.divNU4 = divNU4;
exports.divS2 = divS2;
exports.divS3 = divS3;
exports.divS4 = divS4;
exports.divU = divU;
exports.divU2 = divU2;
exports.divU3 = divU3;
exports.divU4 = divU4;
exports.dot = dot;
exports.dot2 = dot2;
exports.dot3 = dot3;
exports.dot4 = dot4;
exports.dotC4 = dotC4;
exports.dotC6 = dotC6;
exports.dotC8 = dotC8;
exports.dotS2 = dotS2;
exports.dotS3 = dotS3;
exports.dotS4 = dotS4;
exports.empty = empty;
exports.eq = eq;
exports.eq2 = eq2;
exports.eq3 = eq3;
exports.eq4 = eq4;
exports.eqDelta = eqDelta;
exports.eqDelta2 = eqDelta2;
exports.eqDelta3 = eqDelta3;
exports.eqDelta4 = eqDelta4;
exports.eqDeltaArray = eqDeltaArray;
exports.eqDeltaS = eqDeltaS;
exports.every = every;
exports.every2 = every2;
exports.every3 = every3;
exports.every4 = every4;
exports.exp = exp;
exports.exp2 = exp2;
exports.exp3 = exp3;
exports.exp4 = exp4;
exports.exp_2 = exp_2;
exports.exp_22 = exp_22;
exports.exp_23 = exp_23;
exports.exp_24 = exp_24;
exports.faceForward = faceForward;
exports.fit = fit;
exports.fit01 = fit01;
exports.fit01_2 = fit01_2;
exports.fit01_3 = fit01_3;
exports.fit01_4 = fit01_4;
exports.fit11 = fit11;
exports.fit11_2 = fit11_2;
exports.fit11_3 = fit11_3;
exports.fit11_4 = fit11_4;
exports.fit2 = fit2;
exports.fit3 = fit3;
exports.fit4 = fit4;
exports.floor = floor;
exports.floor2 = floor2;
exports.floor3 = floor3;
exports.floor4 = floor4;
exports.fmod = fmod;
exports.fmod2 = fmod2;
exports.fmod3 = fmod3;
exports.fmod4 = fmod4;
exports.fmodN = fmodN;
exports.fmodN2 = fmodN2;
exports.fmodN3 = fmodN3;
exports.fmodN4 = fmodN4;
exports.fract = fract;
exports.fract2 = fract2;
exports.fract3 = fract3;
exports.fract4 = fract4;
exports.fromHomogeneous = fromHomogeneous;
exports.fromHomogeneous3 = fromHomogeneous3;
exports.fromHomogeneous4 = fromHomogeneous4;
exports.gt = gt;
exports.gt2 = gt2;
exports.gt3 = gt3;
exports.gt4 = gt4;
exports.gte = gte;
exports.gte2 = gte2;
exports.gte3 = gte3;
exports.gte4 = gte4;
exports.gvec = gvec;
exports.hash = hash;
exports.heading = heading;
exports.headingSegment = headingSegment;
exports.headingSegmentXY = headingSegmentXY;
exports.headingSegmentXZ = headingSegmentXZ;
exports.headingSegmentYZ = headingSegmentYZ;
exports.headingXY = headingXY;
exports.headingXZ = headingXZ;
exports.headingYZ = headingYZ;
exports.intoBuffer = intoBuffer;
exports.invSqrt = invSqrt;
exports.invSqrt2 = invSqrt2;
exports.invSqrt3 = invSqrt3;
exports.invSqrt4 = invSqrt4;
exports.invert = invert;
exports.invert2 = invert2;
exports.invert3 = invert3;
exports.invert4 = invert4;
exports.isInArray = isInArray;
exports.isInf = isInf;
exports.isInf2 = isInf2;
exports.isInf3 = isInf3;
exports.isInf4 = isInf4;
exports.isNaN = isNaN$1;
exports.isNaN2 = isNaN2;
exports.isNaN3 = isNaN3;
exports.isNaN4 = isNaN4;
exports.jitter = jitter;
exports.limit = limit;
exports.log = log;
exports.log2 = log2;
exports.log3 = log3;
exports.log4 = log4;
exports.log_2 = log_2;
exports.log_22 = log_22;
exports.log_23 = log_23;
exports.log_24 = log_24;
exports.logicAnd = logicAnd;
exports.logicAnd2 = logicAnd2;
exports.logicAnd3 = logicAnd3;
exports.logicAnd4 = logicAnd4;
exports.logicAndN = logicAndN;
exports.logicAndN2 = logicAndN2;
exports.logicAndN3 = logicAndN3;
exports.logicAndN4 = logicAndN4;
exports.logicNot = logicNot;
exports.logicNot2 = logicNot2;
exports.logicNot3 = logicNot3;
exports.logicNot4 = logicNot4;
exports.logicOr = logicOr;
exports.logicOr2 = logicOr2;
exports.logicOr3 = logicOr3;
exports.logicOr4 = logicOr4;
exports.logicOrN = logicOrN;
exports.logicOrN2 = logicOrN2;
exports.logicOrN3 = logicOrN3;
exports.logicOrN4 = logicOrN4;
exports.lshiftI = lshiftI;
exports.lshiftI2 = lshiftI2;
exports.lshiftI3 = lshiftI3;
exports.lshiftI4 = lshiftI4;
exports.lshiftNI = lshiftNI;
exports.lshiftNI2 = lshiftNI2;
exports.lshiftNI3 = lshiftNI3;
exports.lshiftNI4 = lshiftNI4;
exports.lshiftNU = lshiftNU;
exports.lshiftNU2 = lshiftNU2;
exports.lshiftNU3 = lshiftNU3;
exports.lshiftNU4 = lshiftNU4;
exports.lshiftU = lshiftU;
exports.lshiftU2 = lshiftU2;
exports.lshiftU3 = lshiftU3;
exports.lshiftU4 = lshiftU4;
exports.lt = lt;
exports.lt2 = lt2;
exports.lt3 = lt3;
exports.lt4 = lt4;
exports.lte = lte;
exports.lte2 = lte2;
exports.lte3 = lte3;
exports.lte4 = lte4;
exports.madd = madd;
exports.madd2 = madd2;
exports.madd3 = madd3;
exports.madd4 = madd4;
exports.maddN = maddN;
exports.maddN2 = maddN2;
exports.maddN3 = maddN3;
exports.maddN4 = maddN4;
exports.mag = mag;
exports.magSq = magSq;
exports.magSq2 = magSq2;
exports.magSq3 = magSq3;
exports.magSq4 = magSq4;
exports.major = major;
exports.major2 = major2;
exports.major3 = major3;
exports.major4 = major4;
exports.mapBuffer = mapBuffer;
exports.mapV = mapV;
exports.mapVN = mapVN;
exports.mapVV = mapVV;
exports.mapVVN = mapVVN;
exports.mapVVV = mapVVV;
exports.max = max;
exports.max2 = max2;
exports.max3 = max3;
exports.max4 = max4;
exports.min = min;
exports.min2 = min2;
exports.min3 = min3;
exports.min4 = min4;
exports.minor = minor;
exports.minor2 = minor2;
exports.minor3 = minor3;
exports.minor4 = minor4;
exports.mix = mix$1;
exports.mix2 = mix2;
exports.mix3 = mix3;
exports.mix4 = mix4;
exports.mixBilinear = mixBilinear;
exports.mixBilinear2 = mixBilinear2;
exports.mixBilinear3 = mixBilinear3;
exports.mixBilinear4 = mixBilinear4;
exports.mixCubic = mixCubic;
exports.mixN = mixN;
exports.mixN2 = mixN2;
exports.mixN3 = mixN3;
exports.mixN4 = mixN4;
exports.mixQuadratic = mixQuadratic;
exports.mod = mod;
exports.mod2 = mod2;
exports.mod3 = mod3;
exports.mod4 = mod4;
exports.modN = modN;
exports.modN2 = modN2;
exports.modN3 = modN3;
exports.modN4 = modN4;
exports.mul = mul;
exports.mul2 = mul2;
exports.mul3 = mul3;
exports.mul4 = mul4;
exports.mulI = mulI;
exports.mulI2 = mulI2;
exports.mulI3 = mulI3;
exports.mulI4 = mulI4;
exports.mulN = mulN;
exports.mulN2 = mulN2;
exports.mulN3 = mulN3;
exports.mulN4 = mulN4;
exports.mulNI = mulNI;
exports.mulNI2 = mulNI2;
exports.mulNI3 = mulNI3;
exports.mulNI4 = mulNI4;
exports.mulNU = mulNU;
exports.mulNU2 = mulNU2;
exports.mulNU3 = mulNU3;
exports.mulNU4 = mulNU4;
exports.mulS2 = mulS2;
exports.mulS3 = mulS3;
exports.mulS4 = mulS4;
exports.mulU = mulU;
exports.mulU2 = mulU2;
exports.mulU3 = mulU3;
exports.mulU4 = mulU4;
exports.neg = neg;
exports.neq = neq;
exports.neq2 = neq2;
exports.neq3 = neq3;
exports.neq4 = neq4;
exports.normalCCW = normalCCW;
exports.normalCW = normalCW;
exports.normalize = normalize;
exports.one = one;
exports.ones = ones;
exports.orthoNormal3 = orthoNormal3;
exports.perpendicularCCW = perpendicularCCW;
exports.perpendicularCW = perpendicularCW;
exports.polar = polar;
exports.polar2 = polar2;
exports.polar3 = polar3;
exports.pow = pow;
exports.pow2 = pow2;
exports.pow3 = pow3;
exports.pow4 = pow4;
exports.powN = powN;
exports.powN2 = powN2;
exports.powN3 = powN3;
exports.powN4 = powN4;
exports.project = project;
exports.radians = radians;
exports.radians2 = radians2;
exports.radians3 = radians3;
exports.radians4 = radians4;
exports.randMinMax = randMinMax;
exports.randMinMax2 = randMinMax2;
exports.randMinMax3 = randMinMax3;
exports.randMinMax4 = randMinMax4;
exports.randNorm = randNorm;
exports.random = random;
exports.random2 = random2;
exports.random3 = random3;
exports.random4 = random4;
exports.reflect = reflect;
exports.refract = refract;
exports.rotateAroundAxis3 = rotateAroundAxis3;
exports.rotateAroundPoint2 = rotateAroundPoint2;
exports.rotateX = rotateX;
exports.rotateY = rotateY;
exports.rotateZ = rotateZ;
exports.round = round;
exports.round2 = round2;
exports.round3 = round3;
exports.round4 = round4;
exports.rshiftI = rshiftI;
exports.rshiftI2 = rshiftI2;
exports.rshiftI3 = rshiftI3;
exports.rshiftI4 = rshiftI4;
exports.rshiftNI = rshiftNI;
exports.rshiftNI2 = rshiftNI2;
exports.rshiftNI3 = rshiftNI3;
exports.rshiftNI4 = rshiftNI4;
exports.rshiftNU = rshiftNU;
exports.rshiftNU2 = rshiftNU2;
exports.rshiftNU3 = rshiftNU3;
exports.rshiftNU4 = rshiftNU4;
exports.rshiftU = rshiftU;
exports.rshiftU2 = rshiftU2;
exports.rshiftU3 = rshiftU3;
exports.rshiftU4 = rshiftU4;
exports.set = set;
exports.set2 = set2;
exports.set3 = set3;
exports.set4 = set4;
exports.setC = setC;
exports.setC2 = setC2;
exports.setC3 = setC3;
exports.setC4 = setC4;
exports.setC6 = setC6;
exports.setN = setN;
exports.setN2 = setN2;
exports.setN3 = setN3;
exports.setN4 = setN4;
exports.setS = setS;
exports.setS2 = setS2;
exports.setS3 = setS3;
exports.setS4 = setS4;
exports.setSN2 = setSN2;
exports.setSN3 = setSN3;
exports.setSN4 = setSN4;
exports.setSwizzle1 = setSwizzle1;
exports.setSwizzle2 = setSwizzle2;
exports.setSwizzle3 = setSwizzle3;
exports.setSwizzle4 = setSwizzle4;
exports.setVN3 = setVN3;
exports.setVN4 = setVN4;
exports.setVV16 = setVV16;
exports.setVV4 = setVV4;
exports.setVV6 = setVV6;
exports.setVV9 = setVV9;
exports.sign = sign;
exports.sign2 = sign2;
exports.sign3 = sign3;
exports.sign4 = sign4;
exports.signedArea2 = signedArea2;
exports.signedAreaC2 = signedAreaC2;
exports.sin = sin$1;
exports.sin2 = sin2;
exports.sin3 = sin3;
exports.sin4 = sin4;
exports.sinh = sinh;
exports.sinh2 = sinh2;
exports.sinh3 = sinh3;
exports.sinh4 = sinh4;
exports.smoothStep = smoothStep;
exports.smoothStep2 = smoothStep2;
exports.smoothStep3 = smoothStep3;
exports.smoothStep4 = smoothStep4;
exports.some = some;
exports.some2 = some2;
exports.some3 = some3;
exports.some4 = some4;
exports.sqrt = sqrt$1;
exports.sqrt2 = sqrt2;
exports.sqrt3 = sqrt3;
exports.sqrt4 = sqrt4;
exports.step = step;
exports.step2 = step2;
exports.step3 = step3;
exports.step4 = step4;
exports.sub = sub;
exports.sub2 = sub2;
exports.sub3 = sub3;
exports.sub4 = sub4;
exports.subI = subI;
exports.subI2 = subI2;
exports.subI3 = subI3;
exports.subI4 = subI4;
exports.subN = subN;
exports.subN2 = subN2;
exports.subN3 = subN3;
exports.subN4 = subN4;
exports.subNI = subNI;
exports.subNI2 = subNI2;
exports.subNI3 = subNI3;
exports.subNI4 = subNI4;
exports.subNU = subNU;
exports.subNU2 = subNU2;
exports.subNU3 = subNU3;
exports.subNU4 = subNU4;
exports.subS2 = subS2;
exports.subS3 = subS3;
exports.subS4 = subS4;
exports.subU = subU;
exports.subU2 = subU2;
exports.subU3 = subU3;
exports.subU4 = subU4;
exports.subm = subm;
exports.subm2 = subm2;
exports.subm3 = subm3;
exports.subm4 = subm4;
exports.submN = submN;
exports.submN2 = submN2;
exports.submN3 = submN3;
exports.submN4 = submN4;
exports.sum = sum;
exports.sum2 = sum2;
exports.sum3 = sum3;
exports.sum4 = sum4;
exports.swapXY = swapXY;
exports.swapXZ = swapXZ;
exports.swapYZ = swapYZ;
exports.swizzle2 = swizzle2;
exports.swizzle3 = swizzle3;
exports.swizzle4 = swizzle4;
exports.tan = tan;
exports.tan2 = tan2;
exports.tan3 = tan3;
exports.tan4 = tan4;
exports.tanh = tanh;
exports.tanh2 = tanh2;
exports.tanh3 = tanh3;
exports.tanh4 = tanh4;
exports.trunc = trunc;
exports.trunc2 = trunc2;
exports.trunc3 = trunc3;
exports.trunc4 = trunc4;
exports.values = values;
exports.vec2 = vec2;
exports.vec2n = vec2n;
exports.vec3 = vec3;
exports.vec3n = vec3n;
exports.vec4 = vec4;
exports.vec4n = vec4n;
exports.vecIterator = vecIterator;
exports.vecOf = vecOf;
exports.vop = vop;
exports.wrap = wrap;
exports.wrap2 = wrap2;
exports.wrap3 = wrap3;
exports.wrap4 = wrap4;
exports.zero = zero;
exports.zeroes = zeroes;

},{"@thi.ng/binary":3,"@thi.ng/checks":4,"@thi.ng/errors":8,"@thi.ng/math":9,"@thi.ng/memoize":10,"@thi.ng/random":11,"@thi.ng/transducers":12}],14:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],15:[function(require,module,exports){
"use strict";

var _vectors = require("@thi.ng/vectors");

var v = _interopRequireWildcard(_vectors);

var _module = require("./module");

var m = _interopRequireWildcard(_module);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var x = v.add([], [1, 2, 3], [2, 3, 4]);
console.log(x);

console.log("cool");

console.log(m.hello());

},{"./module":16,"@thi.ng/vectors":13}],16:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.hello = hello;
// module.mjs
function hello() {
    return "Hello";
}

},{}]},{},[15]);

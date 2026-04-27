// lock-manager.js

const LOCK_FILE = "/data/locks.json";
const DEFAULT_TTL = 30000; // 30 seconds

export function readLocks(ns) {
    try {
        const raw = ns.read(LOCK_FILE);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

export function writeLocks(ns, locks) {
    ns.write(LOCK_FILE, JSON.stringify(locks, null, 2), "w");
}

export function cleanupLocks(ns) {
    const now = Date.now();
    const locks = readLocks(ns);

    for (const key of Object.keys(locks)) {
        if (!locks[key].expires || locks[key].expires <= now) {
            delete locks[key];
        }
    }

    writeLocks(ns, locks);
    return locks;
}

export function setLock(ns, key, owner, ttl = DEFAULT_TTL, meta = {}) {
    const locks = cleanupLocks(ns);

    locks[key] = {
        owner,
        expires: Date.now() + ttl,
        ...meta,
    };

    writeLocks(ns, locks);
}

export function refreshLock(ns, key, owner, ttl = DEFAULT_TTL) {
    const locks = cleanupLocks(ns);

    if (!locks[key] || locks[key].owner === owner) {
        locks[key] = {
            ...(locks[key] || {}),
            owner,
            expires: Date.now() + ttl,
        };

        writeLocks(ns, locks);
    }
}

export function clearLock(ns, key, owner = null) {
    const locks = cleanupLocks(ns);

    if (!locks[key]) return;

    if (owner === null || locks[key].owner === owner) {
        delete locks[key];
        writeLocks(ns, locks);
    }
}

export function isLocked(ns, key) {
    const locks = cleanupLocks(ns);
    return Boolean(locks[key]);
}

export function getLock(ns, key) {
    const locks = cleanupLocks(ns);
    return locks[key] || null;
}

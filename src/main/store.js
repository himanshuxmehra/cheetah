const fs = require('node:fs');
const path = require('node:path');

// A tiny atomic JSON store. Writes go to a temp file first so a crash mid-write
// can't leave a user with a truncated collection file.
class Store {
  constructor(dir, name, fallback) {
    this.file = path.join(dir, `${name}.json`);
    this.fallback = fallback;
    this.cache = null;
  }

  read() {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.cache = structuredClone(this.fallback);
    }
    return this.cache;
  }

  write(data) {
    this.cache = data;
    const tmp = `${this.file}.tmp`;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
    return data;
  }
}

module.exports = { Store };

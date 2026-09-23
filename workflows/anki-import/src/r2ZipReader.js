// Adapts an R2Bucket + key to the `Reader` interface shared/data/zipRangeReader.js
// expects (getLength(): Promise<number>, read(offset, length):
// Promise<Uint8Array>) — see ANKI-IMPORT-RANGE-READ-PLAN.md (repo root) for
// why: this lets that module locate the central directory and decompress
// individual media entries via targeted R2 range GETs, so nothing in the
// import pipeline ever has to fetch the whole archive into memory. (An
// earlier version of this file fed the same interface to the `unzipit` npm
// package instead — dropped once profiling showed its own central-directory
// parser cost 21.2ms against this project's real fixture, over the
// 10ms/step CPU budget; see zipRangeReader.js's header comment. The `Reader`
// shape this adapts to is unchanged.)
//
// getLength() uses `bucket.head()`, not `bucket.get()` — a HEAD request
// returns the object's size without transferring any body bytes, unlike a
// full GET. Memoized: readCentralDirectory() only calls it once per archive,
// but there's no reason a second call should cost a second R2 request for a
// value that can't change mid-read.

export class R2ZipReader {
  #bucket
  #key
  #lengthPromise

  constructor(bucket, key) {
    this.#bucket = bucket
    this.#key = key
  }

  async getLength() {
    this.#lengthPromise ??= this.#bucket.head(this.#key).then((object) => {
      if (!object) throw new Error(`R2 object not found: ${this.#key}`)
      return object.size
    })
    return this.#lengthPromise
  }

  async read(offset, length) {
    const object = await this.#bucket.get(this.#key, { range: { offset, length } })
    if (!object) throw new Error(`R2 object not found: ${this.#key}`)
    return new Uint8Array(await object.arrayBuffer())
  }
}

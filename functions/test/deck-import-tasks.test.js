// Unit tests for the D1 task-tracking helpers each MediaChunkWorkflow
// instance uses on its way out (src/server/deckImportTasks.js) — direct
// coverage of the finalization logic (last-task-finishes flips the job to
// 'done'; any task erroring fails the job; a task finishing after the job
// already errored doesn't stomp on it), which the happy-path end-to-end test
// (decks-import-workflow.test.js, a single-media-file deck) never exercises.
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { completeMediaTask, createMediaTasks, mediaTaskId } from '../../src/server/deckImportTasks.js'

beforeEach(async () => {
  await env.DB.exec('DELETE FROM deck_import_jobs')
  await env.DB.exec('DELETE FROM deck_import_tasks')
  const { objects } = await env.MEDIA.list()
  await Promise.all(objects.map((object) => env.MEDIA.delete(object.key)))
})

async function insertJob(id, { status = 'processing' } = {}) {
  await env.DB
    .prepare(`INSERT INTO deck_import_jobs (id, r2_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, `raw-imports/${id}.apkg`, status, Date.now(), Date.now())
    .run()
}

describe('mediaTaskId', () => {
  it('is stable and unique per job/deck/chunk', () => {
    expect(mediaTaskId('job1', 900, 0)).toBe('job1-media-900-0')
    expect(mediaTaskId('job1', 900, 0)).not.toBe(mediaTaskId('job1', 900, 90))
    expect(mediaTaskId('job1', 900, 0)).not.toBe(mediaTaskId('job1', 901, 0))
  })
})

describe('createMediaTasks', () => {
  it('inserts one pending row per task id', async () => {
    await insertJob('job1')
    await createMediaTasks({ db: env.DB, jobId: 'job1', taskIds: ['job1-media-900-0', 'job1-media-900-90'] })

    const { results } = await env.DB.prepare('SELECT * FROM deck_import_tasks WHERE job_id = ? ORDER BY id').bind('job1').all()
    expect(results).toHaveLength(2)
    expect(results.every((row) => row.status === 'pending')).toBe(true)
  })

  it('is a no-op for an empty list', async () => {
    await expect(createMediaTasks({ db: env.DB, jobId: 'job1', taskIds: [] })).resolves.toBeUndefined()
  })
})

describe('completeMediaTask', () => {
  it('marks a task done without finalizing the job while other tasks are still pending', async () => {
    await insertJob('job1')
    const taskIds = ['job1-media-900-0', 'job1-media-900-90']
    await createMediaTasks({ db: env.DB, jobId: 'job1', taskIds })
    await env.MEDIA.put('raw-imports/job1.apkg', new Uint8Array([1]))

    await completeMediaTask({ db: env.DB, mediaBucket: env.MEDIA, jobId: 'job1', r2Key: 'raw-imports/job1.apkg', taskId: taskIds[0] })

    const task = await env.DB.prepare('SELECT status FROM deck_import_tasks WHERE id = ?').bind(taskIds[0]).first()
    expect(task.status).toBe('done')
    const job = await env.DB.prepare('SELECT status FROM deck_import_jobs WHERE id = ?').bind('job1').first()
    expect(job.status).toBe('processing') // still waiting on taskIds[1]
    expect(await env.MEDIA.get('raw-imports/job1.apkg')).not.toBeNull() // not cleaned up yet
  })

  it('finalizes the job (status done, raw upload deleted) when the last task completes', async () => {
    await insertJob('job1')
    const taskIds = ['job1-media-900-0', 'job1-media-900-90']
    await createMediaTasks({ db: env.DB, jobId: 'job1', taskIds })
    await env.MEDIA.put('raw-imports/job1.apkg', new Uint8Array([1]))

    await completeMediaTask({ db: env.DB, mediaBucket: env.MEDIA, jobId: 'job1', r2Key: 'raw-imports/job1.apkg', taskId: taskIds[0] })
    await completeMediaTask({ db: env.DB, mediaBucket: env.MEDIA, jobId: 'job1', r2Key: 'raw-imports/job1.apkg', taskId: taskIds[1] })

    const job = await env.DB.prepare('SELECT status FROM deck_import_jobs WHERE id = ?').bind('job1').first()
    expect(job.status).toBe('done')
    expect(await env.MEDIA.get('raw-imports/job1.apkg')).toBeNull()
  })

  it('fails the job when a task errors, even while sibling tasks are still pending', async () => {
    await insertJob('job1')
    const taskIds = ['job1-media-900-0', 'job1-media-900-90']
    await createMediaTasks({ db: env.DB, jobId: 'job1', taskIds })

    await completeMediaTask({
      db: env.DB,
      mediaBucket: env.MEDIA,
      jobId: 'job1',
      r2Key: 'raw-imports/job1.apkg',
      taskId: taskIds[0],
      error: new Error('decompression failed'),
    })

    const task = await env.DB.prepare('SELECT status, error FROM deck_import_tasks WHERE id = ?').bind(taskIds[0]).first()
    expect(task).toMatchObject({ status: 'error', error: 'decompression failed' })
    const job = await env.DB.prepare('SELECT status, error FROM deck_import_jobs WHERE id = ?').bind('job1').first()
    expect(job.status).toBe('error')
    expect(job.error).toContain('decompression failed')
  })

  it('does not resurrect an already-errored job when its remaining sibling task later succeeds', async () => {
    await insertJob('job1')
    const taskIds = ['job1-media-900-0', 'job1-media-900-90']
    await createMediaTasks({ db: env.DB, jobId: 'job1', taskIds })
    await env.MEDIA.put('raw-imports/job1.apkg', new Uint8Array([1]))

    await completeMediaTask({
      db: env.DB,
      mediaBucket: env.MEDIA,
      jobId: 'job1',
      r2Key: 'raw-imports/job1.apkg',
      taskId: taskIds[0],
      error: new Error('decompression failed'),
    })
    // The other chunk's own instance runs independently and may well finish
    // successfully after its sibling already failed the job.
    await completeMediaTask({ db: env.DB, mediaBucket: env.MEDIA, jobId: 'job1', r2Key: 'raw-imports/job1.apkg', taskId: taskIds[1] })

    const job = await env.DB.prepare('SELECT status FROM deck_import_jobs WHERE id = ?').bind('job1').first()
    expect(job.status).toBe('error') // not overwritten back to 'done'
    expect(await env.MEDIA.get('raw-imports/job1.apkg')).not.toBeNull() // not cleaned up by the finalization path
  })
})

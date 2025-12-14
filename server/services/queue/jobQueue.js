const { v4: uuidv4 } = require('uuid');
const logger = require('../../config/logger');

/**
 * Background Job Queue System
 * Handles async operations like searching, scraping, and entity extraction
 */
class JobQueue {
  constructor() {
    this.jobs = [];
    this.processing = false;
    this.workers = new Map();
    this.eventEmitter = null;
  }

  /**
   * Set event emitter for progress updates
   */
  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
  }

  /**
   * Register a worker for a job type
   */
  registerWorker(type, worker) {
    this.workers.set(type, worker);
  }

  /**
   * Add a job to the queue
   */
  async add(type, data, priority = 0) {
    const job = {
      id: uuidv4(),
      type,
      data,
      priority,
      status: 'pending',
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      error: null,
    };

    // Insert based on priority (higher priority first)
    const insertIndex = this.jobs.findIndex(j => j.priority < priority);
    if (insertIndex === -1) {
      this.jobs.push(job);
    } else {
      this.jobs.splice(insertIndex, 0, job);
    }

    logger.info('Job added to queue', { 
      jobId: job.id, 
      type, 
      priority,
      queueLength: this.jobs.length 
    });

    // Start processing if not already running
    if (!this.processing) {
      this.process();
    }

    return job;
  }

  /**
   * Process jobs from the queue
   */
  async process() {
    if (this.processing) return;
    this.processing = true;

    logger.info('Starting job queue processing', { queueLength: this.jobs.length });

    while (this.jobs.length > 0) {
      const job = this.jobs.shift();

      try {
        job.status = 'running';
        job.startedAt = new Date();

        logger.info('Processing job', { 
          jobId: job.id, 
          type: job.type,
          attempts: job.attempts + 1 
        });

        // Emit progress event
        if (this.eventEmitter) {
          this.eventEmitter.emit('job:started', job);
        }

        // Find and execute worker
        const worker = this.workers.get(job.type);
        if (!worker) {
          throw new Error(`No worker registered for type: ${job.type}`);
        }

        job.attempts++;
        const result = await worker.execute(job.data, job);

        job.status = 'completed';
        job.completedAt = new Date();
        job.result = result;

        logger.info('Job completed', { 
          jobId: job.id, 
          type: job.type,
          duration: job.completedAt - job.startedAt 
        });

        // Emit completion event
        if (this.eventEmitter) {
          this.eventEmitter.emit('job:completed', job);
        }

      } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date();

        logger.error('Job failed', { 
          jobId: job.id, 
          type: job.type,
          error: error.message,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts
        });

        // Retry if attempts remain
        if (job.attempts < job.maxAttempts) {
          logger.info('Retrying job', { jobId: job.id, attempts: job.attempts });
          job.status = 'pending';
          job.error = null;
          
          // Add back to queue with lower priority
          const insertIndex = this.jobs.findIndex(j => j.priority < job.priority - 1);
          if (insertIndex === -1) {
            this.jobs.push(job);
          } else {
            this.jobs.splice(insertIndex, 0, job);
          }
        } else {
          logger.error('Job failed permanently', { 
            jobId: job.id, 
            type: job.type 
          });
        }

        // Emit failure event
        if (this.eventEmitter) {
          this.eventEmitter.emit('job:failed', job);
        }
      }

      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.processing = false;
    logger.info('Job queue processing complete', { remainingJobs: this.jobs.length });
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      total: this.jobs.length,
      byStatus: this.jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {}),
      byType: this.jobs.reduce((acc, job) => {
        acc[job.type] = (acc[job.type] || 0) + 1;
        return acc;
      }, {}),
      processing: this.processing,
    };
  }

  /**
   * Clear all jobs
   */
  clear() {
    this.jobs = [];
    this.processing = false;
    logger.info('Job queue cleared');
  }

  /**
   * Cancel a specific job
   */
  cancel(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job && job.status === 'pending') {
      this.jobs = this.jobs.filter(j => j.id !== jobId);
      logger.info('Job cancelled', { jobId });
      return true;
    }
    return false;
  }
}

// Create singleton instance
const jobQueue = new JobQueue();

module.exports = jobQueue;


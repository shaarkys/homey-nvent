'use strict';

class Timer {

  // Constructor
  constructor({homey}) {
    this.homey = homey;
    this.timer = null;
  }

  // Fire sync event
  sync() {
    this.homey.emit('sync');
  }

  // Start timer
  async start(log = true, seconds = null) {
    if (this.timer) {
      return;
    }

    if (!seconds) {
      seconds = 60; // 1 minute
    }

    this.timer = this.homey.setInterval(this.sync.bind(this), (1000 * seconds));

    if (log) {
      this.log(`Started with ${seconds} seconds`);
    }
  }

  // Stop timer
  async stop(log = true) {
    if (!this.timer) {
      return;
    }

    this.homey.clearTimeout(this.timer);
    this.timer = null;

    if (log) {
      this.log('Stopped');
    }
  }

  // Restart timer
  async restart() {
    await this.stop(false);
    await this.start(false);
  }

  /*
  | Log functions
  */

  log() {
    this.homey.log('[App] [Timer]', ...arguments);
  }
}

module.exports = Timer;

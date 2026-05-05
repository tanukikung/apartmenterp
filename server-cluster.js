/**
 * Production Cluster Entry Point
 * Uses Node.js cluster module to distribute load across CPU cores.
 * Each worker runs the Next.js standalone server.
 */

const cluster = require('cluster');
const os = require('os');
const path = require('path');

const numCPUs = process.env.WORKERS
  ? parseInt(process.env.WORKERS, 10)
  : Math.max(os.cpus().length - 2, 1); // Leave 2 cores for system

if (cluster.isMaster || cluster.isPrimary) {
  console.log(`[cluster-master] Starting ${numCPUs} workers`);
  console.log(`[cluster-master] PID: ${process.pid}`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`[cluster-master] Worker ${worker.process.pid} exited (${code}). Restarting...`);
    cluster.fork();
  });

  cluster.on('online', (worker) => {
    console.log(`[cluster-master] Worker ${worker.process.pid} is online`);
  });
} else {
  // Worker process: run the Next.js standalone server
  process.env.NODE_ENV = 'production';
  process.chdir(path.join(__dirname, '.next', 'standalone'));

  const serverPath = path.join(__dirname, '.next', 'standalone', 'server.js');
  require(serverPath);
}

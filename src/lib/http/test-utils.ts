import { createServer } from 'node:http';

/**
 * Find an available port in the range 30000-50000
 * Retries with a new random port if the selected port is already in use
 *
 * @returns A promise that resolves to an available port number
 */
export async function getAvailablePort(): Promise<number> {
  const MIN_PORT = 30000;
  const MAX_PORT = 50000;

  const tryPort = async (port: number): Promise<number> => {
    return new Promise((resolve, reject) => {
      const server = createServer();

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port in use, try another random port
          const newPort = Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT;
          resolve(tryPort(newPort));
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        server.close(() => {
          resolve(port);
        });
      });

      server.listen(port);
    });
  };

  const initialPort = Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT;
  return tryPort(initialPort);
}

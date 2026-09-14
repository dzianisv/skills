// Separate production sockets would each open a debugger connection to the same
// Chrome. Only fake-CDP tests may isolate their proxy with a custom socket.
import os from 'node:os';

export const DEFAULT_SOCKET_PATH = `/tmp/chrome-use-${os.userInfo().uid}.sock`;

export interface SocketConfig {
  socketPath: string;
  isDefaultSocket: boolean;
  /** Set only when a non-default socket is paired with an isolated test fixture. */
  testUserDataDir?: string;
}

export function resolveSocketConfig(env: NodeJS.ProcessEnv = process.env): SocketConfig {
  const socketPath = env.CHROME_USE_SOCKET ?? DEFAULT_SOCKET_PATH;
  const isDefaultSocket = socketPath === DEFAULT_SOCKET_PATH;
  const testUserDataDir = env.CHROME_USE_TEST_USER_DATA_DIR || undefined;

  if (!isDefaultSocket && !testUserDataDir) {
    throw new Error(
      `CHROME_USE_SOCKET is set to a non-default path (${socketPath}) without CHROME_USE_TEST_USER_DATA_DIR. ` +
        `A custom socket is only supported for an isolated test fixture (a fake CDP server) — it cannot ` +
        `safely open another connection to the same real Chrome the default proxy already owns. ` +
        `There is exactly one production proxy: unset CHROME_USE_SOCKET (or point it at the default socket, ` +
        `${DEFAULT_SOCKET_PATH}) for real browser automation. Use CHROME_USE_PIN_TARGET for task isolation.`,
    );
  }
  if (isDefaultSocket && testUserDataDir) {
    throw new Error(
      'CHROME_USE_TEST_USER_DATA_DIR is only supported together with a non-default CHROME_USE_SOCKET — ' +
        'it cannot be combined with the default (production) socket.',
    );
  }

  return { socketPath, isDefaultSocket, testUserDataDir };
}

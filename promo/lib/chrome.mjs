// A minimal DevTools-protocol client for the installed Chrome: open a page at a fixed
// viewport, evaluate expressions and capture screenshots. Uses Node's built-in WebSocket.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function devtoolsUrl(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome did not start within 20 s')), 20_000);
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited with code ${code} before DevTools started:\n${output}`));
    });
  });
}

export async function launchChrome({ width, height }) {
  const profile = await mkdtemp(join(tmpdir(), 'roleharbour-chrome-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      // Rendering drives requestAnimationFrame; never throttle a page for being in the background.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const exited = new Promise((resolve) => child.once('exit', resolve));
  // Headless Chrome outlives a crashed parent, so kill it and drop its profile whenever
  // Node exits, including on an uncaught error.
  const kill = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(profile, { recursive: true, force: true });
  };
  process.once('exit', kill);
  let socket;
  try {
    socket = new WebSocket(await devtoolsUrl(child));
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('Could not connect to Chrome DevTools'));
    });
  } catch (error) {
    process.off('exit', kill);
    kill();
    throw error;
  }

  let lastId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
    } else if (message.method) for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++lastId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  /** Waits for one event; `cancel()` stops waiting without rejecting. */
  const nextEvent = (method, sessionId, timeout) => {
    let listener;
    let timer;
    const promise = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`${method} did not arrive within ${timeout / 1000} s`));
      }, timeout);
      listener = (message) => {
        if (message.method !== method || message.sessionId !== sessionId) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(message.params);
      };
      listeners.add(listener);
    });
    const cancel = () => {
      clearTimeout(timer);
      listeners.delete(listener);
    };
    return { promise, cancel };
  };
  // A response Chrome cannot display would otherwise land in ~/Downloads.
  await send('Browser.setDownloadBehavior', { behavior: 'deny' });

  return {
    async open(url, size = { width, height }) {
      const { targetId } = await send('Target.createTarget', {
        url: 'about:blank',
        newWindow: true,
      });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const call = (method, params) => send(method, params, sessionId);
      await call('Page.enable');
      await call('Runtime.enable');
      await call('Emulation.setDeviceMetricsOverride', {
        width: size.width,
        height: size.height,
        deviceScaleFactor: size.scale ?? 1,
        mobile: false,
      });
      const loaded = nextEvent('Page.loadEventFired', sessionId, 30_000);
      const { errorText } = await call('Page.navigate', { url });
      if (errorText) {
        loaded.cancel();
        throw new Error(`Could not open ${url}: ${errorText}`);
      }
      await loaded.promise;
      await call('Page.bringToFront');
      return {
        close: () => send('Target.closeTarget', { targetId }),
        async evaluate(expression) {
          const result = await call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails)
            throw new Error(
              result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
            );
          return result.result.value;
        },
        /** `clip` is { x, y, width, height } in CSS pixels; it is scaled with the page. */
        async screenshot({ transparent = false, clip } = {}) {
          if (transparent)
            await call('Emulation.setDefaultBackgroundColorOverride', {
              color: { r: 0, g: 0, b: 0, a: 0 },
            });
          const { data } = await call('Page.captureScreenshot', {
            format: 'png',
            ...(clip && { clip: { ...clip, scale: 1 } }),
          });
          return Buffer.from(data, 'base64');
        },
      };
    },
    async close() {
      await send('Browser.close').catch(() => {});
      socket.close();
      await exited;
      await rm(profile, { recursive: true, force: true });
      process.off('exit', kill);
    },
  };
}

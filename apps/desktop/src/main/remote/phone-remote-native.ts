import { spawn } from 'node:child_process';

export function remoteQR(helperPath: string, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, ['--remote-qr'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('QR generation timed out.'));
    }, 5000);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1000000) child.kill();
      else chunks.push(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const data = Buffer.concat(chunks);
      if (
        code === 0 &&
        data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        resolve(`data:image/png;base64,${data.toString('base64')}`);
      else reject(new Error('QR generation failed.'));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(url);
  });
}

export function advertiseRemote(helperPath: string, port: number): () => void {
  const child = spawn(helperPath, ['--remote-discovery', String(port)], {
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  child.on('error', () => undefined);
  child.stdin.on('error', () => undefined);
  return () => {
    child.stdin.end();
    child.kill();
  };
}

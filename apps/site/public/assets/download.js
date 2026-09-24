async function loadDownload() {
  const status = document.getElementById('download-status');
  try {
    const response = await fetch('/download/release.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('unavailable');
    const release = await response.json();
    if (
      release.schemaVersion !== 1 ||
      !/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(release.version) ||
      !/^[a-f0-9]{64}$/.test(release.sha256) ||
      !Number.isSafeInteger(release.bytes) ||
      release.bytes <= 0
    )
      throw new Error('invalid release');
    const expectedPath = `/downloads/${release.version}/${release.sha256.slice(0, 16)}/Sia-${release.version}-universal.dmg`;
    if (release.path !== expectedPath) throw new Error('invalid download');
    const link = document.getElementById('download-installer');
    link.href = expectedPath;
    link.hidden = false;
    document.getElementById('download-version').textContent =
      `Version ${release.version} · ${Math.ceil(release.bytes / 1024 / 1024)} MB · Developer ID signed and notarized`;
    document.getElementById('download-checksum').textContent = release.sha256;
    document.getElementById('download-details').hidden = false;
    status.textContent = `Sia ${release.version} is available for Mac.`;
  } catch {
    status.textContent =
      'The public installer is being prepared. Please check back or contact support.';
  }
}
void loadDownload();

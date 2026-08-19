# Vendored license sources

These immutable files let release packaging run without network access.

- The SPDX license texts are from SPDX License List Data v3.28.0, commit
  `c4a7237ec8f4654e867546f9f409749300f1bf4c`, under `text/<SPDX-ID>.txt`:
  <https://github.com/spdx/license-list-data/tree/v3.28.0/text>
- `cua-driver-rs-v0.19.3-MIT.txt` is the unmodified repository license at Cua
  Driver tag `cua-driver-rs-v0.19.3`, commit
  `a1672e7b11951275ecfba3384264d4530185d0db`:
  <https://github.com/trycua/cua/blob/cua-driver-rs-v0.19.3/LICENSE.md>
- `uniffi-bindgen-react-native-v0.31.0-3-LICENSE.txt` is the unmodified
  repository notice at tag `0.31.0-3`, commit
  `dcb5c4ab2350d57f6d26f5fa81a99c77ed86d449`:
  <https://github.com/jhugman/uniffi-bindgen-react-native/blob/0.31.0-3/LICENSE>

When a pinned native dependency changes, refresh its repository-specific text
and provenance in the same change. The build script appends the canonical SPDX
body whenever an installed npm package declares one of these licenses but omits
a root license file.

- `bricolage-grotesque-OFL.txt` is the unmodified SIL Open Font License 1.1 text shipped with the
  Bricolage Grotesque typeface (The Bricolage Grotesque Project Authors, Atelier Triay), retrieved
  from <https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt>. The renderer
  bundles the variable latin-subset WOFF2 file under `src/renderer/fonts/`.

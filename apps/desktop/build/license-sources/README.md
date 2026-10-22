# Vendored license sources

These immutable files let release packaging run without network access.

- `bricolage-grotesque-OFL.txt` accompanies the bundled Bricolage Grotesque variable Latin font;
  both are restored from Sia's existing font distribution in Git history.

- The SPDX license texts are from SPDX License List Data v3.28.0, commit
  `c4a7237ec8f4654e867546f9f409749300f1bf4c`, under `text/<SPDX-ID>.txt`:
  <https://github.com/spdx/license-list-data/tree/v3.28.0/text>
- `cua-driver-rs-v0.21.0-MIT.txt` is the unmodified repository license at Cua
  Driver tag `cua-driver-rs-v0.21.0`, commit
  `70db98d1bcd92890d778f4978e0eb107a4b66c1b`:
  <https://github.com/trycua/cua/blob/cua-driver-rs-v0.21.0/LICENSE.md>
- `uniffi-bindgen-react-native-v0.31.0-3-LICENSE.txt` is the unmodified
  repository notice at tag `0.31.0-3`, commit
  `dcb5c4ab2350d57f6d26f5fa81a99c77ed86d449`:
  <https://github.com/jhugman/uniffi-bindgen-react-native/blob/0.31.0-3/LICENSE>

When a pinned native dependency changes, refresh its repository-specific text
and provenance in the same change. The build script appends the canonical SPDX
body whenever an installed npm package declares one of these licenses but omits
a root license file.

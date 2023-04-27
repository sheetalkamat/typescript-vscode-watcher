# typescript-parcel-watcher
Prototype file and directory watcher where vscode will watch the files and directories

## Installing

```bash
git clone https://github.com/sheetalkamat/typescript-vscode-watcher.git
cd typescript-vscode-watcher
npm i
npm run build
```

## Usage

```bash
npm link
cd repoWithTypeScriptCode
npm link typescript-vscode-watcher
```

At this point you can set `watchFactory` to `typescript-vscode-watcher` in `watchOptions`of vscode settings.

import type * as ts from "typescript/lib/tsserverlibrary";
type CanonicalPath = string & { __CanonicalPath: any;  }
interface WatcherCollection<T> {
    idToCallbacks: Map<number, Set<T>>;
    pathToId: Map<CanonicalPath, number>;
}

function getWatcherCollection<T>(): WatcherCollection<T> {
    return { idToCallbacks: new Map(), pathToId: new Map() };
}

function factory({ typescript }: { typescript: typeof ts }): ts.UserWatchFactory {
    let session: ts.server.Session<unknown>;
    const watchedFiles = getWatcherCollection<ts.FileWatcherCallback>();
    const watchedDirectories = getWatcherCollection<ts.DirectoryWatcherCallback>();
    const watchedDirectoriesRecursive = getWatcherCollection<ts.DirectoryWatcherCallback>();
    let ids = 1;
    return {
        create: ({ session }) => {
            setSession(session);
            try {
                session!.addProtocolHandler("onWatchChange", req => {
                    onWatchChange(req.arguments.id, req.arguments.path, req.arguments.eventType);
                    return {
                        response: "onWatchChangeComplete"
                    }
                });
                console.log(`typescript-vscode-watcher:: Added command for onWatchChange`);
            }
            catch (e) {
                // Ignore if already registered
            }
        },
        watchDirectory,
        watchFile,
    };
    function setSession(newSession: ts.server.Session<unknown> | undefined) {
        if (!newSession) throw new Error("Session not supplied, not supported");
        if (session === newSession) return;
        else if (!session) session = newSession;
        else console.error(`typescript-vscode-watcher:: Another session in same module?`);
    }
    function watchDirectory(
        path: string,
        callback: ts.DirectoryWatcherCallback,
        recursive?: boolean,
    ): ts.FileWatcher {
        // console.log(`typescript-vscode-watcher:: watchDirectory:: path: ${path} ${recursive}`);
        return getOrCreateFileWatcher(
            recursive ? watchedDirectoriesRecursive : watchedDirectories,
            path,
            callback,
            recursive ? "rDir" : "dir",
            recursive,
        );
    }
    function watchFile(
        path: string,
        callback: ts.FileWatcherCallback,
    ) {
        // console.log(`typescript-vscode-watcher:: watchFile:: path: ${path}`);
        return getOrCreateFileWatcher(
            watchedFiles,
            path,
            callback,
            "file",
        );
    }

    function getOrCreateFileWatcher<T>(
        { pathToId, idToCallbacks }: WatcherCollection<T>,
        path: string,
        callback: T,
        type: "file" | "dir" | "rDir",
        recursive?: boolean,
    ) {
        const key = session.getCanonicalFileName(path) as CanonicalPath;
        let id = pathToId.get(key);
        if (!id) pathToId.set(key, id = ids++);
        let callbacks = idToCallbacks.get(id);
        if (!callbacks) {
            idToCallbacks.set(id, callbacks = new Set());
            // Add watcher
            const eventName = type === "file" ? "createFileWatcher" : "createDirectoryWatcher";
            // console.log(`typescript-vscode-watcher:: Sending ${eventName}:: ${type}:: ${key} ${id}`);
            session.event({ path, id, recursive }, eventName);
        }
        callbacks.add(callback);
        return {
            close() {
                const callbacks = idToCallbacks.get(id!);
                if (!callbacks?.delete(callback)) return;
                if (callbacks.size) return;
                idToCallbacks.delete(id!);
                pathToId.delete(key);
                // console.log(`typescript-vscode-watcher:: closeWatcher::  ${type}:: ${key} ${id}`);
                session.event({ id, type }, "closeWatcher");
            }
        }
    }

    function onWatchChange(
        id: number,
        path: string,
        eventType: "create" | "delete" | "update",
    ) {
        // console.log(`typescript-vscode-watcher:: Invoke:: ${id}:: ${path}:: ${eventType}`);
        onFileWatcherCallback(id, path, eventType);
        onDirectoryWatcherCallback(watchedDirectories, id, path, eventType);
        onDirectoryWatcherCallback(watchedDirectoriesRecursive, id, path, eventType);
    }

    function onFileWatcherCallback(
        id: number,
        eventPath: string,
        eventType: "create" | "delete" | "update",
    ) {
        watchedFiles.idToCallbacks.get(id)?.forEach(callback => {
            const eventKind = eventType === "create" ?
                typescript.FileWatcherEventKind.Created :
                eventType === "delete" ?
                    typescript.FileWatcherEventKind.Deleted :
                    typescript.FileWatcherEventKind.Changed;
            // console.log(`typescript-vscode-watcher:: watchFile:: Invoke:: ${eventPath}:: Event: ${eventKind}`);
            callback(eventPath, eventKind);
        });
    }

    function onDirectoryWatcherCallback(
        { idToCallbacks }: WatcherCollection<ts.DirectoryWatcherCallback>,
        id: number,
        eventPath: string,
        eventType: "create" | "delete" | "update",
    ) {
        if (eventType === "update") return;
        idToCallbacks.get(id)?.forEach(callback => {
            // console.log(`typescript-vscode-watcher:: watchDirectory:: Invoke:: ${eventPath}`);
            callback(eventPath);
        });
    }
}
export = factory;
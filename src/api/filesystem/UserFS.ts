/**
 * UserFS - Persistent File System Provider for Sirco OS
 * 
 * This provider saves files to a user-selected directory (like a USB drive
 * or local folder) instead of browser storage like IndexedDB or OPFS.
 * 
 * This ensures data persists across browser sessions and can be backed up
 * or transferred by simply copying the folder.
 */

class UserFSStats {
	name: string;
	size: number;
	atime: Date;
	mtime: Date;
	ctime: Date;
	atimeMs: number;
	mtimeMs: number;
	ctimeMs: number;
	node: string;
	nlinks: number;
	mode: number;
	type: "FILE" | "DIRECTORY";
	uid: number;
	gid: number;
	dev: string;

	isFile() {
		return this.type === "FILE";
	}

	isDirectory() {
		return this.type === "DIRECTORY";
	}

	isSymbolicLink() {
		return (this.mode & 0o170000) === 0o120000;
	}

	constructor(data: Partial<UserFSStats>) {
		this.name = data.name!;
		this.size = data.size || 0;
		this.atimeMs = data.atimeMs || Date.now();
		this.mtimeMs = data.mtimeMs || Date.now();
		this.ctimeMs = data.ctimeMs || Date.now();
		this.atime = new Date(this.atimeMs);
		this.mtime = new Date(this.mtimeMs);
		this.ctime = new Date(this.ctimeMs);
		this.node = data.node || crypto.randomUUID();
		this.nlinks = data.nlinks || 1;
		this.mode = data.mode || 0o100777;
		this.type = data.type || "FILE";
		this.uid = data.uid || 0;
		this.gid = data.gid || 0;
		this.dev = data.dev || "userfs";
	}
}

class UserFS extends AFSProvider<UserFSStats> {
	dirHandle: FileSystemDirectoryHandle;
	domain: string;
	name = "UserFS";
	version = "1.0.0";
	path: any = Filer.Path;
	stats: Map<string, any> = new Map();
	fds: FileSystemHandle[] = [];
	cursors: number[] = [];
	private static storedHandle: FileSystemDirectoryHandle | null = null;

	constructor(dirHandle: FileSystemDirectoryHandle, domain: string) {
		super();
		this.dirHandle = dirHandle;
		this.domain = domain;
		this.name += ` (${domain})`;
	}

	relativizePath(path: string) {
		return path.replace(this.domain, "").replace(/^\/+/, "");
	}

	/**
	 * Check if we have a stored directory handle permission
	 */
	static async hasStoredPermission(): Promise<boolean> {
		try {
			const handle = await (window as any).idbKeyval.get("sirco-userfs-handle");
			if (!handle) return false;
			
			const permission = await handle.queryPermission({ mode: "readwrite" });
			return permission === "granted";
		} catch {
			return false;
		}
	}

	/**
	 * Request permission to use a stored handle
	 */
	static async requestStoredPermission(): Promise<boolean> {
		try {
			const handle = await (window as any).idbKeyval.get("sirco-userfs-handle");
			if (!handle) return false;
			
			const permission = await handle.requestPermission({ mode: "readwrite" });
			if (permission === "granted") {
				UserFS.storedHandle = handle;
				return true;
			}
			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Get the stored directory handle
	 */
	static async getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
		if (UserFS.storedHandle) return UserFS.storedHandle;
		
		try {
			const handle = await (window as any).idbKeyval.get("sirco-userfs-handle");
			if (handle) {
				const permission = await handle.queryPermission({ mode: "readwrite" });
				if (permission === "granted") {
					UserFS.storedHandle = handle;
					return handle;
				}
			}
		} catch {
			// Handle not available
		}
		return null;
	}

	/**
	 * Store a directory handle for future sessions
	 */
	static async storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
		await (window as any).idbKeyval.set("sirco-userfs-handle", handle);
		UserFS.storedHandle = handle;
	}

	/**
	 * Clear the stored handle
	 */
	static async clearStoredHandle(): Promise<void> {
		await (window as any).idbKeyval.del("sirco-userfs-handle");
		UserFS.storedHandle = null;
	}

	async getChildDirHandle(
		path: string,
		recurseCounter = 0,
	): Promise<[FileSystemDirectoryHandle, string]> {
		if (recurseCounter > 20) {
			throw {
				name: "ELOOP",
				code: "ELOOP",
				errno: -40,
				message: "no such file or directory",
				path: (this.domain + "/" + path).replace("//", "/"),
			};
		}

		if (path === "") {
			return [this.dirHandle, path];
		}
		if (path.endsWith("/")) {
			path = path.substring(0, path.length - 1);
		}
		let acc = this.dirHandle;
		let curr = "";
		for await (const part of path.split("/")) {
			if (part === "" || part === ".") continue;
			curr += "/" + part;
			if ((this.stats.get(curr)?.mode & 0o170000) === 0o120000) {
				const newPart = await (
					await (await acc.getFileHandle(path)).getFile()
				).text();
				if (newPart.startsWith("/")) {
					return this.getChildDirHandle(newPart, recurseCounter + 1);
				} else {
					return this.getChildDirHandle(
						this.path.resolve(curr, newPart),
						recurseCounter + 1,
					);
				}
			}
			acc = await acc.getDirectoryHandle(part);
		}
		return [acc, curr];
	}

	async getFileHandle(
		path: string,
		options?: FileSystemGetFileOptions,
		recurseCounter = 0,
	): Promise<[FileSystemFileHandle, string]> {
		if (!path.includes("/")) {
			path = "/" + path;
		}

		const parentFolder = this.path.dirname(path);
		let [parentHandle, realPath] = await this.getChildDirHandle(parentFolder);
		const fileName = this.path.basename(path);

		if (realPath[0] === "/") {
			realPath = realPath.slice(1);
		}
		if (
			this.stats.has(realPath + "/" + fileName) &&
			(this.stats.get(realPath + "/" + fileName).mode & 0o170000) === 0o120000
		) {
			let realPath = await (
				await (await parentHandle.getFileHandle(fileName)).getFile()
			).text();
			if (realPath.startsWith("/")) {
				if (realPath.startsWith(this.domain)) {
					realPath = this.relativizePath(realPath);
					return this.getFileHandle(realPath, options, recurseCounter + 1);
				} else {
					let handle = await anura.fs.whatwgfs.getFolder();
					for (const part in realPath.split("/").slice(1, -1)) {
						handle = await handle.getDirectoryHandle(part);
					}
					return [
						await handle.getFileHandle(this.path.basename(realPath)),
						"foreign:" + realPath,
					];
				}
			} else {
				return this.getFileHandle(
					this.path.resolve(parentFolder, realPath),
					options,
					recurseCounter + 1,
				);
			}
		}
		return [await parentHandle.getFileHandle(fileName, options), path];
	}

	/**
	 * Create a new UserFS instance with user-selected directory
	 * This prompts the user to select a folder (can be a USB drive, local folder, etc.)
	 */
	static async selectUserFolder(anuraPath: string = "/"): Promise<UserFS | null> {
		try {
			const dirHandle = await window.showDirectoryPicker({
				id: "sirco-userfs",
				mode: "readwrite",
				startIn: "documents",
			});
			
			await dirHandle.requestPermission({ mode: "readwrite" });
			
			// Store the handle for future sessions
			await UserFS.storeHandle(dirHandle);
			
			// Create Sirco data directory if it doesn't exist
			let sircoDir: FileSystemDirectoryHandle;
			try {
				sircoDir = await dirHandle.getDirectoryHandle("SircoOS-Data", { create: true });
			} catch {
				sircoDir = await dirHandle.getDirectoryHandle("SircoOS-Data");
			}
			
			const fs = new UserFS(sircoDir, anuraPath);
			
			// Try to load existing stats
			const textde = new TextDecoder();
			try {
				const statsFile = await sircoDir.getFileHandle(".sirco_stats");
				const file = await statsFile.getFile();
				const content = await file.text();
				fs.stats = new Map(JSON.parse(content));
			} catch {
				console.log("UserFS: No existing stats found, starting fresh");
			}
			
			return fs;
		} catch (e) {
			console.error("UserFS: Failed to select user folder:", e);
			return null;
		}
	}

	/**
	 * Create UserFS from a stored handle (for auto-reconnect on boot)
	 */
	static async fromStoredHandle(anuraPath: string = "/"): Promise<UserFS | null> {
		try {
			const dirHandle = await UserFS.getStoredHandle();
			if (!dirHandle) return null;
			
			// Get or create SircoOS-Data subdirectory
			let sircoDir: FileSystemDirectoryHandle;
			try {
				sircoDir = await dirHandle.getDirectoryHandle("SircoOS-Data", { create: true });
			} catch {
				sircoDir = await dirHandle.getDirectoryHandle("SircoOS-Data");
			}
			
			const fs = new UserFS(sircoDir, anuraPath);
			
			// Try to load existing stats
			try {
				const statsFile = await sircoDir.getFileHandle(".sirco_stats");
				const file = await statsFile.getFile();
				const content = await file.text();
				fs.stats = new Map(JSON.parse(content));
			} catch {
				console.log("UserFS: No existing stats found");
			}
			
			return fs;
		} catch (e) {
			console.error("UserFS: Failed to load from stored handle:", e);
			return null;
		}
	}

	/**
	 * Check if UserFS is available (File System Access API supported)
	 */
	static isSupported(): boolean {
		return typeof window !== "undefined" && 
			   "showDirectoryPicker" in window;
	}

	promises = {
		saveStats: async () => {
			const jsonStats = JSON.stringify(Array.from(this.stats.entries()));
			await this.promises.writeFile(this.domain + "/.sirco_stats", jsonStats);
		},

		writeFile: async (
			path: string,
			data: Uint8Array | string,
			options?: any,
		) => {
			if (typeof data === "string") {
				data = new TextEncoder().encode(data);
			}
			path = this.relativizePath(path);

			let [handle, realPath] = await this.getFileHandle(path, { create: true });

			const writer = await handle.createWritable();
			if (realPath.startsWith("/")) {
				realPath = realPath.slice(1);
			}
			const fileStats = this.stats.get(realPath) || {};

			if (fileStats && !realPath.startsWith("foreign:")) {
				fileStats.mtimeMs = Date.now();
				fileStats.ctimeMs = Date.now();
				this.stats.set(realPath, fileStats);
			}
			writer.write(data as any);
			writer.close();
		},

		readFile: async (path: string) => {
			path = this.relativizePath(path);
			const [handle] = await this.getFileHandle(path);
			const file = await handle.getFile();
			return new Uint8Array(await file.arrayBuffer());
		},

		appendFile: async (
			path: string,
			data: Uint8Array,
			options: { encoding: string; mode: number; flag: string },
		) => {
			const existingData = await this.promises.readFile(path).catch(() => new Uint8Array());
			const combined = new Uint8Array(existingData.length + data.length);
			combined.set(existingData);
			combined.set(data, existingData.length);
			await this.promises.writeFile(path, combined, options);
		},

		access: async (path: string, mode?: number) => {
			path = this.relativizePath(path);
			try {
				await this.getFileHandle(path);
			} catch {
				await this.getChildDirHandle(path);
			}
		},

		chown: async (path: string, uid: number, gid: number) => {
			path = this.relativizePath(path);
			const stats = this.stats.get(path) || {};
			stats.uid = uid;
			stats.gid = gid;
			this.stats.set(path, stats);
			await this.promises.saveStats();
		},

		chmod: async (path: string, mode: number) => {
			path = this.relativizePath(path);
			const stats = this.stats.get(path) || {};
			stats.mode = mode;
			this.stats.set(path, stats);
			await this.promises.saveStats();
		},

		link: async (srcPath: string, dstPath: string) => {
			throw new Error("UserFS: Hard links not supported");
		},

		lstat: async (path: string) => {
			return this.promises.stat(path);
		},

		mkdir: async (path: string, mode?: number) => {
			path = this.relativizePath(path);
			const parts = path.split("/").filter(p => p);
			let current = this.dirHandle;
			
			for (const part of parts) {
				current = await current.getDirectoryHandle(part, { create: true });
			}
			
			this.stats.set(path, new UserFSStats({
				name: parts[parts.length - 1] || "",
				type: "DIRECTORY",
				mode: mode || 0o40777,
			}));
			await this.promises.saveStats();
		},

		mkdtemp: async (prefix: string, options?: { encoding: string }) => {
			const name = prefix + crypto.randomUUID().slice(0, 8);
			await this.promises.mkdir(name);
			return name;
		},

		readdir: async (
			path: string,
			options?: { encoding: string; withFileTypes: boolean },
		) => {
			path = this.relativizePath(path);
			const [dirHandle] = await this.getChildDirHandle(path);
			const entries: string[] = [];
			
			for await (const [name] of (dirHandle as any).entries()) {
				if (!name.startsWith(".sirco_")) {
					entries.push(name);
				}
			}
			return entries;
		},

		readlink: async (path: string) => {
			path = this.relativizePath(path);
			const [handle] = await this.getFileHandle(path);
			const file = await handle.getFile();
			return file.text();
		},

		rename: async (oldPath: string, newPath: string) => {
			const data = await this.promises.readFile(oldPath);
			await this.promises.writeFile(newPath, data);
			await this.promises.unlink(oldPath);
		},

		rmdir: async (path: string) => {
			path = this.relativizePath(path);
			const parentPath = this.path.dirname(path);
			const name = this.path.basename(path);
			const [parentHandle] = await this.getChildDirHandle(parentPath);
			await parentHandle.removeEntry(name, { recursive: true });
			this.stats.delete(path);
			await this.promises.saveStats();
		},

		stat: async (path: string) => {
			path = this.relativizePath(path);
			
			// Try file first
			try {
				const [handle, realPath] = await this.getFileHandle(path);
				const file = await handle.getFile();
				const existing = this.stats.get(realPath.startsWith("/") ? realPath.slice(1) : realPath) || {};
				
				return new UserFSStats({
					name: file.name,
					size: file.size,
					mtimeMs: file.lastModified,
					atimeMs: existing.atimeMs || file.lastModified,
					ctimeMs: existing.ctimeMs || file.lastModified,
					type: "FILE",
					mode: existing.mode || 0o100777,
					...existing,
				});
			} catch {
				// Try directory
				const [, realPath] = await this.getChildDirHandle(path);
				const existing = this.stats.get(realPath.startsWith("/") ? realPath.slice(1) : realPath) || {};
				
				return new UserFSStats({
					name: this.path.basename(path),
					type: "DIRECTORY",
					mode: existing.mode || 0o40777,
					...existing,
				});
			}
		},

		symlink: async (srcPath: string, dstPath: string, type?: string) => {
			dstPath = this.relativizePath(dstPath);
			await this.promises.writeFile(dstPath, srcPath);
			const stats = this.stats.get(dstPath) || {};
			stats.mode = 0o120777;
			this.stats.set(dstPath, stats);
			await this.promises.saveStats();
		},

		truncate: async (path: string, len: number) => {
			path = this.relativizePath(path);
			const data = await this.promises.readFile(path);
			await this.promises.writeFile(path, data.slice(0, len));
		},

		unlink: async (path: string) => {
			path = this.relativizePath(path);
			const parentPath = this.path.dirname(path);
			const name = this.path.basename(path);
			const [parentHandle] = await this.getChildDirHandle(parentPath);
			await parentHandle.removeEntry(name);
			this.stats.delete(path);
			await this.promises.saveStats();
		},

		utimes: async (
			path: string,
			atime: Date | number,
			mtime: Date | number,
		) => {
			path = this.relativizePath(path);
			const accessTime = typeof atime === "number" ? new Date(atime) : atime;
			const modifiedTime = typeof mtime === "number" ? new Date(mtime) : mtime;

			const fileStats = this.stats.get(path) || {};
			fileStats.atimeMs = accessTime.getTime();
			fileStats.mtimeMs = modifiedTime.getTime();
			this.stats.set(path, fileStats);
			await this.promises.saveStats();
		},
	};
}

import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as url from 'url';

export interface IServerOptions {
	rootDir?: string;
	etag?: boolean;
	expires?: number;
}

export interface IServer {
	handle(request: http.IncomingMessage, response: http.ServerResponse): void;
}

export async function createServer(options: IServerOptions): Promise<IServer> {
	const rootDir = path.normalize(typeof options.rootDir !== 'undefined' ? options.rootDir : process.cwd());
	const useETag = (typeof options.etag !== 'undefined' ? options.etag : true);
	const expires = (typeof options.expires !== 'undefined' ? options.expires : 5 * 1000 /* 5s */);

	const rootDirExists = await fsExists(rootDir);
	if (!rootDirExists) {
		throw new Error(`${options.rootDir} does not `)
	}

	async function notFound(req: http.IncomingMessage, res: http.ServerResponse, extra = '') {
		res.writeHead(404, 'Not found');
		res.end(`Not found${extra ? ` - ${extra}` : ''}`);
	}

	async function redirect(req: http.IncomingMessage, res: http.ServerResponse, location: string) {
		res.writeHead(302, 'Found', {
			'Location': location
		});
		res.end(`Location: ${location}`);
	}

	async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, extname: string, content: Buffer) {
		const headers: { [header: string]: any; } = {
			'Content-Encoding': 'utf8'
		};

		switch (extname) {
			case '.html': headers['Content-Type'] = 'text/html'; break;
			case '.htm': headers['Content-Type'] = 'text/html'; break;
			case '.js': headers['Content-Type'] = 'text/javascript'; break;
			case '.css': headers['Content-Type'] = 'text/css'; break;
			case '.ttf': headers['Content-Type'] = 'font/ttf'; break;
			case '.svg': headers['Content-Type'] = 'image/svg+xml'; break;
			case '.wasm': headers['Content-Type'] = 'application/wasm'; break;
			case '.map': break;
			default:
				console.log(`Unhandled mime-type for ext name: ${extname}`);
		}

		if (expires) {
			headers['Expires'] = new Date(Date.now() + expires).toUTCString();
		}

		if (useETag) {
			const etag = crypto.createHash('md5').update(content).digest("hex");
			headers['ETag'] = etag;
			if (req.headers['if-none-match'] === etag) {
				res.writeHead(304, 'Not modified', headers);
				res.end();
				return;
			}
		}

		headers['Content-Length'] = content.byteLength;
		res.writeHead(200, 'OK', headers);
		res.end(content);
	}

	async function serveDir(req: http.IncomingMessage, res: http.ServerResponse, dirPath: string, entries: fs.Dirent[]) {
		const relativePath = (path.sep + path.relative(rootDir, dirPath)).replace(/\\/g, '/');
		entries.sort((a, b) => {
			const aIsDir = a.isDirectory() ? 0 : 1;
			const bIsDir = b.isDirectory() ? 0 : 1;
			if (aIsDir === bIsDir) {
				return a.name.localeCompare(b.name);
			}
			return aIsDir - bIsDir;
		});
		const contents = `
<!DOCTYPE html>
<html>
	<head>
		<title>Listing of ${relativePath}</title>
		<style>
.icon {
	display: inline-block;
	width: 1em;
	height: 1em;
	margin-right: 5px;
	background-repeat: no-repeat;
}
.file-icon { background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='iso-8859-1'%3F%3E%3Csvg version='1.1' id='Capa_1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' x='0px' y='0px' viewBox='0 0 368.553 368.553' style='enable-background:new 0 0 368.553 368.553;' xml:space='preserve'%3E%3Cg%3E%3Cg%3E%3Cpath d='M239.68,0H42.695v368.553h283.164V86.811L239.68,0z M244.057,25.7l56.288,56.701h-56.288V25.7z M57.695,353.553V15 h171.362v82.401h81.802v256.151H57.695V353.553z'/%3E%3Crect x='86.435' y='82.401' width='121.875' height='15'/%3E%3Crect x='86.435' y='151.122' width='195.685' height='15'/%3E%3Crect x='86.435' y='219.843' width='195.685' height='15'/%3E%3Crect x='86.435' y='288.563' width='195.685' height='15'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E%0A"); }
.folder-icon { background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='iso-8859-1'%3F%3E%3C!-- Generator: Adobe Illustrator 19.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0) --%3E%3Csvg version='1.1' id='Layer_1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' x='0px' y='0px' viewBox='0 0 512 512' style='enable-background:new 0 0 512 512;' xml:space='preserve'%3E%3Cpath style='fill:%23FBC176;' d='M0,167.724v264.828c0,15.007,11.476,26.483,26.483,26.483h459.034 c15.007,0,26.483-11.476,26.483-26.483V167.724c0-15.007-11.476-26.483-26.483-26.483H26.483C11.476,141.241,0,153.6,0,167.724'/%3E%3Cpath style='fill:%23C39A6E;' d='M467.862,141.241c0-19.421-15.89-35.31-35.31-35.31H291.31l-44.138-52.966H52.966 c-15.007,0-26.483,12.359-26.483,26.483v61.793H467.862z'/%3E%3Cg%3E%3Cpath style='fill:%23FFFFFF;' d='M158.897,203.034H52.966c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h105.931 c5.297,0,8.828,3.531,8.828,8.828S164.193,203.034,158.897,203.034'/%3E%3Cpath style='fill:%23FFFFFF;' d='M158.897,238.345H52.966c-5.297,0-8.828-3.531-8.828-8.828s3.531-8.828,8.828-8.828h105.931 c5.297,0,8.828,3.531,8.828,8.828S164.193,238.345,158.897,238.345'/%3E%3C/g%3E%3C/svg%3E%0A"); }
		</style>
	</head>
	<body>
		<h2>Listing of ${relativePath}</h2>
		<ul style="list-style-type:none">
			${entries.map((entry) => {
				return `<li> <span class="icon ${entry.isDirectory() ? 'folder-icon' : 'file-icon'}"></span><a href="${path.posix.join(relativePath, entry.name)}${entry.isDirectory() ? '/' : ''}">${entry.name}</a></li>\n`;
			}).join('')}
		</ul>
	</body>
</html>
`
		return serveFile(req, res, '.html', Buffer.from(contents));
	}

	async function doHandle(req: http.IncomingMessage, res: http.ServerResponse) {
		if (req.method !== 'GET' || !req.url) {
			return notFound(req, res, '1');
		}
		const pathname = url.parse(req.url).pathname;
		if (!pathname) {
			return notFound(req, res, '2');
		}
		const requestedPath = path.normalize(path.join(rootDir, pathname));
		if (requestedPath.substr(0, rootDir.length) !== rootDir) {
			return notFound(req, res, '3');
		}
		const content = await fsSafeRead(requestedPath);
		if (content) {
			return serveFile(req, res, path.extname(requestedPath), content);
		}

		// maybe it was a directory?
		const stats = await fsSafeStat(requestedPath);
		if (!stats || !stats.isDirectory()) {
			return notFound(req, res, '4');
		}
		let expectedRequestPath = `${path.relative(rootDir, requestedPath).replace(/\\/g, '/')}/`;
		if (expectedRequestPath.charAt(0) !== '/') {
			expectedRequestPath = `/${expectedRequestPath}`;
		}
		if (pathname !== expectedRequestPath) {
			return redirect(req, res, expectedRequestPath);
		}
		const indexPath = path.normalize(path.join(requestedPath, 'index.html'));
		const indexContent = await fsSafeRead(indexPath);
		if (indexContent) {
			return serveFile(req, res, path.extname(indexPath), indexContent);
		}
		const dirEntries = await fsSafeReadDir(requestedPath);
		if (dirEntries) {
			return serveDir(req, res, requestedPath, dirEntries);
		}
		return notFound(req, res, '5');
	};

	return {
		handle: (req, res) => {
			doHandle(req, res).then(undefined, err => {
				console.error(err);
				res.writeHead(500, "Internal Server Error");
				res.end("Internal Server Error");
			});
		}
	}
}

//#region utils

function fsExists(path: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		fs.exists(path, (exists) => {
			resolve(exists);
		})
	});
}

function fsSafeStat(path: string): Promise<fs.Stats | null> {
	return new Promise((resolve, reject) => {
		fs.stat(path, (err, exists) => {
			if (err) {
				return resolve(null);
			}
			resolve(exists);
		})
	});
}

function fsSafeRead(path: string): Promise<Buffer | null> {
	return new Promise((resolve, reject) => {
		fs.readFile(path, (err, data) => {
			if (err) {
				return resolve(null);
			}
			resolve(data);
		});
	});
}

function fsSafeReadDir(path: string): Promise<fs.Dirent[] | null> {
	return new Promise((resolve, reject) => {
		fs.readdir(path, { withFileTypes: true }, (err, files) => {
			if (err) {
				return resolve(null);
			}
			resolve(files);
		});
	});
}

//#endregion

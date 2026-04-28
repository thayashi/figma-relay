#!/usr/bin/env node
/**
 * HTTP Bridge Server
 *
 * Exposes a REST API on localhost:3056 that proxies commands to the Figma
 * Desktop Bridge plugin via the existing WebSocket transport.
 *
 * Endpoints:
 *   GET  /status        — connection status and connected files
 *   POST /join-channel  — set the active Figma file by fileKey
 *   POST /command       — send a WebSocket command to the plugin
 *   POST /execute       — execute arbitrary Plugin API code (wraps figma_execute)
 *   POST /screenshot    — capture screenshot, save to temp file for viewing
 *
 * Usage:
 *   npx tsx src/http-bridge.ts
 *   HTTP_BRIDGE_PORT=4000 npx tsx src/http-bridge.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import pino from "pino";
import { FigmaWebSocketServer } from "./core/websocket-server.js";
import { WebSocketConnector } from "./core/websocket-connector.js";
import {
	DEFAULT_WS_PORT,
	getPortRange,
	advertisePort,
	registerPortCleanup,
	cleanupStalePortFiles,
} from "./core/port-discovery.js";
import { createChildLogger } from "./core/logger.js";

const logger = createChildLogger({ component: "http-bridge" });

import { writeFileSync, mkdirSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Request logger — writes structured JSON to logs/<session-timestamp>.jsonl
// ---------------------------------------------------------------------------

function createRequestLogger(): pino.Logger {
	const logsDir = resolve(process.cwd(), "logs");
	mkdirSync(logsDir, { recursive: true });

	const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const logPath = join(logsDir, `${ts}.jsonl`);

	const dest = pino.destination({ dest: logPath, sync: false });
	const reqLog = pino({ level: "info" }, dest);

	return reqLog;
}

const reqLogger = createRequestLogger();

interface RequestLogEntry {
	requestId: string;
	endpoint: string;
	codeLength?: number;
	codePreview?: string;
	command?: string;
	timeout?: number;
	targetFile?: string;
	durationMs: number;
	success: boolean;
	errorMessage?: string;
	responseSize: number;
	statusCode: number;
}

const DEFAULT_HTTP_PORT = 3056;
const MAX_EXECUTE_TIMEOUT = 60000;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB (screenshots can be large)

// ---------------------------------------------------------------------------
// Globals set during startup
// ---------------------------------------------------------------------------
let wsServer: FigmaWebSocketServer | null = null;
let wsPort: number | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCorsHeaders(res: ServerResponse): void {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: ServerResponse, status: number, body: unknown): number {
	setCorsHeaders(res);
	const payload = JSON.stringify(body);
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(payload);
	return Buffer.byteLength(payload, "utf-8");
}

function parseBody(req: IncomingMessage): Promise<Record<string, any>> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;

		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_SIZE) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});

		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf-8");
				resolve(raw.length === 0 ? {} : JSON.parse(raw));
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});

		req.on("error", reject);
	});
}

function requireWsServer(res: ServerResponse): FigmaWebSocketServer | null {
	if (!wsServer || !wsServer.isClientConnected()) {
		json(res, 503, {
			error: "No Figma plugin connected. Open the Desktop Bridge plugin in Figma.",
		});
		return null;
	}
	return wsServer;
}

/**
 * Resolve a file target to a fileKey. Accepts fileKey directly or fileName
 * (case-insensitive substring match). Returns null if no match found.
 */
function resolveFileKey(target: string | undefined): string | undefined {
	if (!target || !wsServer) return undefined;

	// Check if it's already a valid fileKey
	const files = wsServer.getConnectedFiles();
	if (files.some((f) => f.fileKey === target)) return target;

	// Try matching by fileName (case-insensitive substring)
	const lower = target.toLowerCase();
	const match = files.find((f) => f.fileName.toLowerCase().includes(lower));
	return match?.fileKey ?? undefined;
}

// ---------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------

function handleStatus(_req: IncomingMessage, res: ServerResponse): void {
	const connected = wsServer?.isClientConnected() ?? false;
	const files = wsServer?.getConnectedFiles() ?? [];
	const pendingRequests = wsServer?.getPendingRequestCount() ?? 0;

	json(res, 200, {
		wsConnected: connected,
		wsPort,
		connectedFiles: files,
		pendingRequests,
	});
}

async function handleJoinChannel(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const requestId = randomUUID();
	const startTime = performance.now();
	const body = await parseBody(req);
	const channel = (body.channel || body.fileName) as string | undefined;

	if (!channel) {
		const files = wsServer?.getConnectedFiles() ?? [];
		const size = json(res, 200, {
			message: "Provide a 'channel' (fileKey) to set the active file.",
			availableChannels: files.map((f) => ({
				fileKey: f.fileKey,
				fileName: f.fileName,
				isActive: f.isActive,
			})),
		});
		reqLogger.info({ requestId, endpoint: "/join-channel", durationMs: Math.round(performance.now() - startTime), success: true, statusCode: 200, responseSize: size } satisfies RequestLogEntry);
		return;
	}

	const server = requireWsServer(res);
	if (!server) {
		reqLogger.info({ requestId, endpoint: "/join-channel", targetFile: channel, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "No plugin connected", statusCode: 503, responseSize: 0 } satisfies RequestLogEntry);
		return;
	}

	const resolvedKey = resolveFileKey(channel);
	const switched = resolvedKey ? server.setActiveFile(resolvedKey) : false;
	if (!switched) {
		const size = json(res, 404, {
			error: `File "${channel}" is not connected. Open the Desktop Bridge plugin in that file.`,
			availableChannels: server.getConnectedFiles().map((f) => ({
				fileKey: f.fileKey,
				fileName: f.fileName,
			})),
		});
		reqLogger.info({ requestId, endpoint: "/join-channel", targetFile: channel, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "File not connected", statusCode: 404, responseSize: size } satisfies RequestLogEntry);
		return;
	}

	const size = json(res, 200, { success: true, activeChannel: resolvedKey });
	reqLogger.info({ requestId, endpoint: "/join-channel", targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: true, statusCode: 200, responseSize: size } satisfies RequestLogEntry);
}

async function handleCommand(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const requestId = randomUUID();
	const startTime = performance.now();
	const body = await parseBody(req);
	const { command, params = {}, timeout = 15000, fileKey, fileName } = body;

	if (!command || typeof command !== "string") {
		const size = json(res, 400, { error: "Missing required field: 'command' (string)" });
		reqLogger.info({ requestId, endpoint: "/command", durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "Missing command field", statusCode: 400, responseSize: size } satisfies RequestLogEntry);
		return;
	}

	const server = requireWsServer(res);
	if (!server) {
		reqLogger.info({ requestId, endpoint: "/command", command, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "No plugin connected", statusCode: 503, responseSize: 0 } satisfies RequestLogEntry);
		return;
	}

	const resolvedKey = resolveFileKey(fileKey || fileName);

	try {
		const result = await server.sendCommand(command, params, timeout, resolvedKey);
		const size = json(res, 200, { success: true, result });
		reqLogger.info({ requestId, endpoint: "/command", command, timeout, targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: true, statusCode: 200, responseSize: size } satisfies RequestLogEntry);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const isTimeout = message.includes("timed out");
		const statusCode = isTimeout ? 504 : 502;
		const size = json(res, statusCode, {
			success: false,
			error: message,
			...(isTimeout && { timedOut: true, mayStillBeRunning: true, requestId }),
		});
		reqLogger.info({ requestId, endpoint: "/command", command, timeout, targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: message, statusCode, responseSize: size } satisfies RequestLogEntry);
	}
}

async function handleScreenshot(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const requestId = randomUUID();
	const startTime = performance.now();
	const body = await parseBody(req);
	const { nodeId = "", format = "PNG", scale = 2, save, fileKey, fileName } = body;

	const server = requireWsServer(res);
	if (!server) {
		reqLogger.info({ requestId, endpoint: "/screenshot", durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "No plugin connected", statusCode: 503, responseSize: 0 } satisfies RequestLogEntry);
		return;
	}

	const resolvedKey = resolveFileKey(fileKey || fileName);
	if (resolvedKey) server.setActiveFile(resolvedKey);

	const connector = new WebSocketConnector(server);

	try {
		const result = await connector.captureScreenshot(nodeId, { format, scale });

		if (!result?.success || !result?.image?.base64) {
			const size = json(res, 502, { success: false, error: "Screenshot capture failed", result });
			reqLogger.info({ requestId, endpoint: "/screenshot", targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "Screenshot capture failed", statusCode: 502, responseSize: size } satisfies RequestLogEntry);
			return;
		}

		const base64 = result.image.base64;

		if (save !== false) {
			const dir = join(tmpdir(), "figma-screenshots");
			mkdirSync(dir, { recursive: true });
			const ext = format.toLowerCase() === "jpg" ? "jpg" : "png";
			const filename = `figma-${Date.now()}.${ext}`;
			const filepath = join(dir, filename);
			writeFileSync(filepath, Buffer.from(base64, "base64"));

			const size = json(res, 200, {
				success: true,
				filepath,
				format,
				scale,
				byteLength: result.image.byteLength,
				node: result.image.node,
			});
			reqLogger.info({ requestId, endpoint: "/screenshot", targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: true, statusCode: 200, responseSize: size } satisfies RequestLogEntry);
			return;
		}

		const size = json(res, 200, {
			success: true,
			base64,
			format,
			scale,
			byteLength: result.image.byteLength,
			node: result.image.node,
		});
		reqLogger.info({ requestId, endpoint: "/screenshot", targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: true, statusCode: 200, responseSize: size } satisfies RequestLogEntry);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const size = json(res, 502, { success: false, error: message });
		reqLogger.info({ requestId, endpoint: "/screenshot", targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: message, statusCode: 502, responseSize: size } satisfies RequestLogEntry);
	}
}

async function handleExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const requestId = randomUUID();
	const startTime = performance.now();
	const body = await parseBody(req);
	const { code, timeout = 15000, fileKey, fileName } = body;

	if (!code || typeof code !== "string") {
		const size = json(res, 400, { error: "Missing required field: 'code' (string)" });
		reqLogger.info({ requestId, endpoint: "/execute", durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "Missing code field", statusCode: 400, responseSize: size } satisfies RequestLogEntry);
		return;
	}

	const server = requireWsServer(res);
	if (!server) {
		reqLogger.info({ requestId, endpoint: "/execute", codeLength: code.length, codePreview: code.slice(0, 120), durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: "No plugin connected", statusCode: 503, responseSize: 0 } satisfies RequestLogEntry);
		return;
	}

	const resolvedKey = resolveFileKey(fileKey || fileName);

	if (resolvedKey) server.setActiveFile(resolvedKey);

	const cappedTimeout = Math.min(Number(timeout) || 5000, MAX_EXECUTE_TIMEOUT);
	const connector = new WebSocketConnector(server);

	try {
		const result = await connector.executeCodeViaUI(code, cappedTimeout);
		const size = json(res, 200, { success: true, result });
		reqLogger.info({ requestId, endpoint: "/execute", codeLength: code.length, codePreview: code.slice(0, 120), timeout: cappedTimeout, targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: true, statusCode: 200, responseSize: size } satisfies RequestLogEntry);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const isTimeout = message.includes("timed out");
		const size = json(res, 504, {
			success: false,
			error: message,
			...(isTimeout && { timedOut: true, mayStillBeRunning: true, requestId }),
		});
		reqLogger.info({ requestId, endpoint: "/execute", codeLength: code.length, codePreview: code.slice(0, 120), timeout: cappedTimeout, targetFile: resolvedKey, durationMs: Math.round(performance.now() - startTime), success: false, errorMessage: message, statusCode: 504, responseSize: size } satisfies RequestLogEntry);
	}
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
	// CORS preflight
	if (req.method === "OPTIONS") {
		setCorsHeaders(res);
		res.writeHead(204);
		res.end();
		return;
	}

	try {
		if (req.url === "/status" && req.method === "GET") {
			handleStatus(req, res);
		} else if (req.url === "/join-channel" && req.method === "POST") {
			await handleJoinChannel(req, res);
		} else if (req.url === "/command" && req.method === "POST") {
			await handleCommand(req, res);
		} else if (req.url === "/execute" && req.method === "POST") {
			await handleExecute(req, res);
		} else if (req.url === "/screenshot" && req.method === "POST") {
			await handleScreenshot(req, res);
		} else {
			json(res, 404, {
				error: "Not found",
				endpoints: {
					"GET /status": "Connection status",
					"POST /join-channel": "Set active Figma file",
					"POST /command": "Send WebSocket command",
					"POST /execute": "Execute Plugin API code",
					"POST /screenshot": "Capture screenshot (saves to temp file)",
				},
			});
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error({ err }, "Request handler error");

		if (message === "Invalid JSON") {
			json(res, 400, { error: "Invalid JSON in request body" });
		} else if (message === "Request body too large") {
			json(res, 400, { error: "Request body too large (max 1 MB)" });
		} else {
			json(res, 500, { error: "Internal server error" });
		}
	}
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function startWebSocketServer(): Promise<void> {
	const wsHost = process.env.FIGMA_WS_HOST || "localhost";
	const preferredPort = parseInt(process.env.FIGMA_WS_PORT || String(DEFAULT_WS_PORT), 10);

	cleanupStalePortFiles();

	const portsToTry = getPortRange(preferredPort);

	for (const port of portsToTry) {
		try {
			wsServer = new FigmaWebSocketServer({ port, host: wsHost });
			await wsServer.start();

			const addr = wsServer.address();
			wsPort = addr?.port ?? port;

			advertisePort(wsPort, wsHost);
			registerPortCleanup(wsPort);

			logger.info({ wsPort }, "WebSocket server started — waiting for Figma plugin connections");
			return;
		} catch (err) {
			const errorCode = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
			if (errorCode === "EADDRINUSE") {
				logger.debug({ port }, "Port in use, trying next");
				wsServer = null;
				continue;
			}
			logger.error({ err, port }, "Failed to start WebSocket server");
			wsServer = null;
			break;
		}
	}

	throw new Error(
		`Could not bind WebSocket server on any port in range ${preferredPort}-${preferredPort + portsToTry.length - 1}`,
	);
}

async function main(): Promise<void> {
	await startWebSocketServer();

	const httpPort = parseInt(process.env.HTTP_BRIDGE_PORT || String(DEFAULT_HTTP_PORT), 10);
	const httpServer = createServer((req, res) => {
		handleRequest(req, res).catch((err) => {
			logger.error({ err }, "Unhandled request error");
			if (!res.headersSent) {
				json(res, 500, { error: "Internal server error" });
			}
		});
	});

	httpServer.listen(httpPort, "localhost", () => {
		logger.info({ httpPort, wsPort }, "HTTP Bridge ready");
		console.log(`\nHTTP Bridge listening on http://localhost:${httpPort}`);
		console.log(`WebSocket server on port ${wsPort}`);
		console.log(`\nEndpoints:`);
		console.log(`  GET  http://localhost:${httpPort}/status`);
		console.log(`  POST http://localhost:${httpPort}/join-channel`);
		console.log(`  POST http://localhost:${httpPort}/command`);
		console.log(`  POST http://localhost:${httpPort}/execute`);
		console.log(`  POST http://localhost:${httpPort}/screenshot`);
		console.log(`\nRequest logs: logs/\n`);
	});

	// Graceful shutdown
	const shutdown = () => {
		console.log("\nShutting down...");
		httpServer.close();
		wsServer?.stop();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((err) => {
	logger.fatal({ err }, "HTTP Bridge failed to start");
	console.error("Failed to start HTTP Bridge:", err.message || err);
	process.exit(1);
});

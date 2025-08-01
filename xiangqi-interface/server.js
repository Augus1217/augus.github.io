const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Config ---
let config;
try {
    config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
} catch (error) {
    console.error("--- FATAL ERROR ---");
    console.error("Could not read 'config.json'. Make sure the file exists and contains valid JSON.");
    console.error("Example: { \"enginePath\": \"C:\\path\\to\\your\\engine.exe\" }");
    console.error("Error details:", error);
    process.exit(1);
}
const enginePath = path.resolve(__dirname, config.enginePath);

// --- Static File Server ---
app.use(express.static(path.join(__dirname, 'public')));

// --- WebSocket Connection Handling ---
wss.on('connection', (ws) => {
    console.log('[WebSocket] Frontend client connected.');
    let engineProcess = null;

    // Function to start the engine
    const startEngine = () => {
        console.log(`[Engine] Spawning Pikafish engine process from: ${enginePath}`);
        try {
            const engineDir = path.dirname(enginePath);
            console.log(`[Engine] Setting working directory to: ${engineDir}`);
            engineProcess = spawn(enginePath, [], { cwd: engineDir });

            engineProcess.on('error', (err) => {
                console.error('[Engine] Error event on engine process:', err);
                ws.send(JSON.stringify({ type: 'error', data: `Engine process error: ${err.message}` }));
            });

            engineProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                const lines = output.split('\n');
                lines.forEach(line => {
                    console.log(`[Engine OUT] ${line}`);
                    if (line.startsWith('bestmove')) {
                        const uciMove = line.split(' ')[1];
                        if (uciMove && uciMove !== '(none)') {
                            console.log(`[WebSocket] Sending 'engineMove' to frontend: ${uciMove}`);
                            ws.send(JSON.stringify({ type: 'engineMove', move: uciMove }));
                        } else {
                            console.error(`[Engine] Engine returned an invalid move: ${line}`);
                        }
                    }
                });
            });

            engineProcess.stderr.on('data', (data) => {
                console.error(`[Engine ERR] ${data}`);
            });

            engineProcess.on('close', (code) => {
                console.log(`[Engine] Process exited with code ${code}`);
                engineProcess = null;
            });

            console.log('[Engine IN] Sending: uci');
            engineProcess.stdin.write('uci\n');

            const nnuePath = 'pikafish.nnue';
            console.log(`[Engine IN] Sending: setoption name EvalFile value ${nnuePath}`);
            engineProcess.stdin.write(`setoption name EvalFile value ${nnuePath}\n`);

            const threads = 8;
            console.log(`[Engine IN] Sending: setoption name Threads value ${threads}`);
            engineProcess.stdin.write(`setoption name Threads value ${threads}\n`);

        } catch (spawnError) {
            console.error("[Engine] FATAL: Failed to spawn engine process.", spawnError);
            ws.send(JSON.stringify({ type: 'error', data: 'Failed to start engine on server.' }));
        }
    };

    startEngine();

    ws.on('message', (message) => {
        const msg = JSON.parse(message);

        if (msg.type === 'getmove') {
            console.log(`[WebSocket] Received 'getmove' request.`);
            console.log(`[FEN] ${msg.fen}`);
            const movetime = msg.movetime || 3000; // Default to 3000ms

            if (engineProcess) {
                console.log(`[Engine IN] Sending: position fen ${msg.fen}`);
                engineProcess.stdin.write(`position fen ${msg.fen}\n`);
                console.log(`[Engine IN] Sending: go movetime ${movetime}`);
                engineProcess.stdin.write(`go movetime ${movetime}\n`);
            } else {
                console.error('[Engine] Engine process not running. Cannot process getmove request.');
                ws.send(JSON.stringify({ type: 'error', data: 'Engine not running.' }));
            }
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Frontend client disconnected.');
        if (engineProcess) {
            console.log('[Engine] Terminating engine process.');
            engineProcess.kill();
            engineProcess = null;
        }
    });
});

// --- Start Server ---
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`--- Server is running. Open http://localhost:${PORT} in your browser. ---`);
    if (!fs.existsSync(enginePath)) {
        console.warn(`\x1b[33m[CONFIG WARNING] The engine path in 'config.json' does not exist: ${enginePath}\x1b[0m`);
        console.warn(`\x1b[33m[CONFIG WARNING] Pikafish AI mode will fail until the path is corrected.\x1b[0m`);
    } else {
        console.log(`[CONFIG] Engine path set to: ${enginePath}`);
    }
});
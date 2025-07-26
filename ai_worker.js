// --- AI Worker ---
// This script runs in a separate thread and handles all AI calculations.

// --- Constants & Data (Copied from main script) ---
const ROWS = 10, COLS = 9;
const pieceNames = { 'r': { 'K': '帥', 'A': '仕', 'E': '相', 'H': '傌', 'R': '俥', 'C': '炮', 'P': '兵' }, 'b': { 'K': '將', 'A': '士', 'E': '象', 'H': '馬', 'R': '車', 'C': '包', 'P': '卒' } };
const PST_A = Array(10).fill().map(() => Array(9).fill(0));
PST_A[7][3] = PST_A[7][5] = PST_A[9][3] = PST_A[9][5] = 1; PST_A[8][4] = 3;
const PST_E = Array(10).fill().map(() => Array(9).fill(0));
PST_E[5][2] = PST_E[5][6] = PST_E[7][0] = PST_E[7][4] = PST_E[7][8] = 2;
const PST_K = Array(10).fill().map(() => Array(9).fill(0));
PST_K[7][4] = PST_K[9][4] = 1; PST_K[8][3] = PST_K[8][5] = 2;
const PST = { 'P': [
            [-5, -5, -5, -5, -5, -5, -5, -5, -5], // Black's baseline (low value for red pawn)
            [0, 0, 0, 5, 8, 5, 0, 0, 0],   // Inside black's palace
            [0, 0, 5, 10, 15, 10, 5, 0, 0],  // Approaching the palace
            [25, 30, 35, 40, 45, 40, 35, 30, 25], // The most threatening row
            [20, 25, 30, 35, 40, 35, 30, 25, 20], // Strong row
            [15, 18, 20, 22, 25, 22, 20, 18, 15], // Just crossed the river
            [7, 7, 7, 7, 7, 7, 7, 7, 7],   // River bank
            [0, 0, 0, -2, -2, -2, 0, 0, 0],  // Starting row (slight penalty to encourage moving)
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0]
        ], 'C': [
            [1, 2, 3, 4, 5, 4, 3, 2, 1],
            [1, 2, 3, 4, 5, 4, 3, 2, 1],
            [2, 3, 4, 6, 7, 6, 4, 3, 2],
            [3, 4, 5, 8, 10, 8, 5, 4, 3],
            [4, 5, 6, 9, 11, 9, 6, 5, 4],
            [4, 5, 6, 9, 11, 9, 6, 5, 4],
            [3, 4, 5, 8, 9, 8, 5, 4, 3],
            [2, 3, 3, 6, 7, 6, 3, 3, 2],
            [1, 1, 2, 4, 5, 4, 2, 1, 1],
            [0, 0, 1, 2, 3, 2, 1, 0, 0]
        ], 'H': [
            [0, 2, 4, 6, 8, 6, 4, 2, 0],
            [2, 4, 8, 10, 12, 10, 8, 4, 2],
            [4, 8, 12, 14, 16, 14, 12, 8, 4],
            [6, 10, 14, 16, 18, 16, 14, 10, 6],
            [4, 8, 12, 14, 16, 14, 12, 8, 4],
            [2, 6, 10, 12, 14, 12, 10, 6, 2],
            [2, 4, 8, 10, 12, 10, 8, 4, 2],
            [0, 2, 4, 6, 8, 6, 4, 2, 0],
            [-2, 0, 2, 4, 6, 4, 2, 0, -2],
            [-4, -2, 0, 2, 0, 2, 0, -2, -4]
        ], 'R': [
            [14, 14, 14, 16, 18, 16, 14, 14, 14],
            [13, 13, 13, 15, 16, 15, 13, 13, 13],
            [12, 12, 12, 14, 15, 14, 12, 12, 12],
            [11, 11, 11, 13, 14, 13, 11, 11, 11],
            [10, 10, 10, 12, 13, 12, 10, 10, 10],
            [9, 9, 9, 11, 12, 11, 9, 9, 9],
            [8, 8, 8, 10, 11, 10, 8, 8, 8],
            [7, 7, 7, 9, 9, 9, 7, 7, 7],
            [6, 6, 6, 8, 8, 8, 6, 6, 6],
            [6, 6, 6, 8, 8, 8, 6, 6, 6]
        ], 'A': PST_A, 'E': PST_E, 'K': PST_K };
let aiColor = 'black'; // Will be updated by the main thread
let moveHistory = []; // Will be updated by the main thread


// --- Helper Functions (Copied from main script) ---
function getPieceInfo(piece) { if (!piece) return null; const color = piece.charAt(0) === 'r' ? 'red' : 'black'; const type = piece.charAt(1); const name = pieceNames[piece.charAt(0)][type]; return { color, type, name }; }
function getValidMoves(currentBoard, r, c) { const piece = currentBoard[r][c]; if (!piece) return []; const pieceInfo = getPieceInfo(piece); const moves = []; const { color } = pieceInfo; function addMove(toR, toC) { if (toR < 0 || toR >= ROWS || toC < 0 || toC >= COLS) return; const targetPiece = currentBoard[toR][toC]; if (targetPiece === null || getPieceInfo(targetPiece).color !== color) { moves.push({ r: toR, c: toC }); } } switch (pieceInfo.type) { case 'K': for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const newR = r + dr; const newC = c + dc; if (newC >= 3 && newC <= 5) { if (color === 'red' && newR >= 7 && newR <= 9) addMove(newR, newC); if (color === 'black' && newR >= 0 && newR <= 2) addMove(newR, newC); } } let oppKingC = -1, oppKingR = -1; findOppKing: for (let i = 0; i < ROWS; i++) { for (let j = 0; j < COLS; j++) { const p = currentBoard[i][j]; if (p && getPieceInfo(p).type === 'K' && getPieceInfo(p).color !== color) { oppKingR = i; oppKingC = j; break findOppKing; } } } if (c === oppKingC) { let hasPieceBetween = false; for (let i = Math.min(r, oppKingR) + 1; i < Math.max(r, oppKingR); i++) { if (currentBoard[i][c] !== null) { hasPieceBetween = true; break; } } if (!hasPieceBetween) addMove(oppKingR, oppKingC); } break; case 'A': for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const newR = r + dr; const newC = c + dc; if (newC >= 3 && newC <= 5) { if (color === 'red' && newR >= 7 && newR <= 9) addMove(newR, newC); if (color === 'black' && newR >= 0 && newR <= 2) addMove(newR, newC); } } break; case 'E': const elephantMoves = [[-2, -2], [-2, 2], [2, -2], [2, 2]]; for (const [dr, dc] of elephantMoves) { const newR = r + dr; const newC = c + dc; if (newR < 0 || newR >= ROWS || newC < 0 || newC >= COLS) continue; const crossesRiver = (color === 'red' && newR < 5) || (color === 'black' && newR > 4); if (crossesRiver) continue; const blockR = r + dr / 2; const blockC = c + dc / 2; if (currentBoard[blockR][blockC] !== null) continue; addMove(newR, newC); } break; case 'H': const horseMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]; for (const [dr, dc] of horseMoves) { const newR = r + dr; const newC = c + dc; if (newR < 0 || newR >= ROWS || newC < 0 || newC >= COLS) continue; if (Math.abs(dr) === 2) { if (currentBoard[r + dr / 2][c] === null) addMove(newR, newC); } else { if (currentBoard[r][c + dc / 2] === null) addMove(newR, newC); } } break; case 'R': for (let i = r - 1; i >= 0; i--) { addMove(i, c); if (currentBoard[i][c] !== null) break; } for (let i = r + 1; i < ROWS; i++) { addMove(i, c); if (currentBoard[i][c] !== null) break; } for (let i = c - 1; i >= 0; i--) { addMove(r, i); if (currentBoard[r][i] !== null) break; } for (let i = c + 1; i < COLS; i++) { addMove(r, i); if (currentBoard[r][i] !== null) break; } break; case 'C': for (let i = r - 1; i >= 0; i--) { if (currentBoard[i][c] === null) { addMove(i, c); } else { for (let j = i - 1; j >= 0; j--) { const target = currentBoard[j][c]; if (target !== null) { if (getPieceInfo(target).color !== color) addMove(j, c); break; } } break; } } for (let i = r + 1; i < ROWS; i++) { if (currentBoard[i][c] === null) { addMove(i, c); } else { for (let j = i + 1; j < ROWS; j++) { const target = currentBoard[j][c]; if (target !== null) { if (getPieceInfo(target).color !== color) addMove(j, c); break; } } break; } } for (let i = c - 1; i >= 0; i--) { if (currentBoard[r][i] === null) { addMove(r, i); } else { for (let j = i - 1; j >= 0; j--) { const target = currentBoard[r][j]; if (target !== null) { if (getPieceInfo(target).color !== color) addMove(r, j); break; } } break; } } for (let i = c + 1; i < COLS; i++) { if (currentBoard[r][i] === null) { addMove(r, i); } else { for (let j = i + 1; j < COLS; j++) { const target = currentBoard[r][j]; if (target !== null) { if (getPieceInfo(target).color !== color) addMove(r, j); break; } } break; } } break; case 'P': const forward = color === 'red' ? -1 : 1; addMove(r + forward, c); const crossedRiver = (color === 'red' && r < 5) || (color === 'black' && r > 4); if (crossedRiver) { addMove(r, c - 1); addMove(r, c + 1); } break; } return moves; }
function isKingInCheck(currentBoard, kingColor) { const kingPos = { r: -1, c: -1 }; const opponentColor = (kingColor === 'red') ? 'black' : 'red'; findKing: for(let r=0; r<ROWS; r++) for(let c=0; c<COLS; c++) { const p = currentBoard[r][c]; if (p && getPieceInfo(p).type === 'K' && getPieceInfo(p).color === kingColor) { kingPos.r = r; kingPos.c = c; break findKing; }} if (kingPos.r === -1) return true; for(let r=0; r<ROWS; r++) for(let c=0; c<COLS; c++) { const p = currentBoard[r][c]; if (p && getPieceInfo(p).color === opponentColor) { const moves = getValidMoves(currentBoard, r, c); if (moves.some(move => move.r === kingPos.r && move.c === kingPos.c)) return true; }} return false; }
function filterValidMoves(currentBoard, allMoves, color) { return allMoves.filter(move => { const tempBoard = currentBoard.map(row => [...row]); tempBoard[move.to.r][move.to.c] = tempBoard[move.from.r][move.from.c]; tempBoard[move.from.r][move.from.c] = null; return !isKingInCheck(tempBoard, color); }); }
function isRepetitiveCheckViolation(move, board, player) { const REPETITION_LIMIT = 5; const pieceCode = board[move.from.r][move.from.c]; if (!pieceCode) return false; const tempBoard = board.map(r => [...r]); tempBoard[move.to.r][move.to.c] = pieceCode; tempBoard[move.from.r][move.from.c] = null; if (!isKingInCheck(tempBoard, (player === 'red' ? 'black' : 'red'))) { return false; } let consecutiveCount = 1; if (moveHistory.length < 2) return false; for (let i = moveHistory.length - 2; i >= 0; i -= 2) { const historyEntry = moveHistory[i]; if (historyEntry.player !== player || !historyEntry.isCheck) { break; } const historicPieceCode = historyEntry.board[historyEntry.move.from.r][historyEntry.move.from.c]; if (historicPieceCode === pieceCode) { consecutiveCount++; } else { break; } } return consecutiveCount >= REPETITION_LIMIT; }

// --- AI LOGIC ---
const basePieceValues = { K: 10000, R: 900, H: 400, E: 200, A: 200, C: 450, P: 100 };
function getDynamicPieceValues(currentBoard) {
    const pieceCount = currentBoard.flat().filter(p => p).length;
    let dynamicValues = { ...basePieceValues };

    if (pieceCount > 20) { // Opening Phase
        dynamicValues.C = 470; // Cannon is more valuable with more pieces on board (screens)
        dynamicValues.H = 400;
    } else if (pieceCount > 10) { // Mid-game Phase
        dynamicValues.C = 430; // Values are closer
        dynamicValues.H = 420;
        dynamicValues.P = 150; // Pawns that have survived are more valuable
    } else { // Endgame Phase
        dynamicValues.C = 380; // Cannon is much less valuable without screens
        dynamicValues.H = 450; // Horse is a king in the endgame
        dynamicValues.P = 200; // Endgame pawns are critical
    }
    return dynamicValues;
}
function evaluateThreats(board, playerColor, currentPieceValues) {
    let threatScore = 0;
    const opponentColor = playerColor === 'red' ? 'black' : 'red';

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece && getPieceInfo(piece).color === playerColor) {
                const moves = getValidMoves(board, r, c);
                for (const move of moves) {
                    const targetPiece = board[move.r][move.c];
                    if (targetPiece && getPieceInfo(targetPiece).color === opponentColor) {
                        const attackerValue = currentPieceValues[getPieceInfo(piece).type] || 0;
                        const targetValue = currentPieceValues[getPieceInfo(targetPiece).type] || 0;
                        if (targetValue > attackerValue) {
                            threatScore += (targetValue - attackerValue) / 100;
                        }
                        threatScore += 1;
                    }
                }
            }
        }
    }
    return threatScore;
}

function evaluateKingSafety(board, kingColor, currentPieceValues) {
    let safetyScore = 0;
    const kingPos = { r: -1, c: -1 };
    findKing: for(let r=0; r<ROWS; r++) for(let c=0; c<COLS; c++) {
        const p = board[r][c];
        if (p && getPieceInfo(p).type === 'K' && getPieceInfo(p).color === kingColor) {
            kingPos.r = r;
            kingPos.c = c;
            break findKing;
        }
    }

    if (kingPos.r === -1) return -1000;

    const palaceCenterR = kingColor === 'red' ? 8 : 1;
    const palaceCenterC = 4;
    const advisorPositions = [[palaceCenterR - 1, palaceCenterC - 1], [palaceCenterR - 1, palaceCenterC + 1], [palaceCenterR + 1, palaceCenterC - 1], [palaceCenterR + 1, palaceCenterC + 1]];
    for(const [r, c] of advisorPositions) {
        const piece = board[r] ? board[r][c] : null;
        if(piece && getPieceInfo(piece).type === 'A' && getPieceInfo(piece).color === kingColor) {
            safetyScore += 5;
        }
    }

    const opponentColor = kingColor === 'red' ? 'black' : 'red';
    for(let r = 0; r < ROWS; r++) {
        for(let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if(piece && getPieceInfo(piece).color === opponentColor) {
                const distanceR = Math.abs(r - kingPos.r);
                const distanceC = Math.abs(c - kingPos.c);
                if (distanceR <= 3 && distanceC <= 3) {
                    safetyScore -= (currentPieceValues[getPieceInfo(piece).type] || 0) / 100;
                }
            }
        }
    }
    
    if ((kingColor === 'red' && kingPos.r === 9) || (kingColor === 'black' && kingPos.r === 0)) {
        safetyScore += 3;
    }

    return safetyScore;
}

function evaluateBoardState(currentBoard) {
    let totalScore = 0;
    let redMobility = 0;
    let blackMobility = 0;
    const currentPieceValues = getDynamicPieceValues(currentBoard);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const pieceCode = currentBoard[r][c];
            if (pieceCode) {
                const pieceInfo = getPieceInfo(pieceCode);
                let score = currentPieceValues[pieceInfo.type] || 0;
                
                if (PST[pieceInfo.type]) {
                    score += (pieceInfo.color === 'red') ? PST[pieceInfo.type][r][c] : PST[pieceInfo.type][9 - r][c];
                }

                const moves = getValidMoves(currentBoard, r, c);
                const mobilityScore = moves.length;

                if (pieceInfo.color === 'red') {
                    redMobility += mobilityScore;
                } else {
                    blackMobility += mobilityScore;
                }

                if (pieceInfo.color === aiColor) {
                    totalScore += score;
                } else {
                    totalScore -= score;
                }
            }
        }
    }

    const mobilityWeight = 10;
    const mobilityDifference = (aiColor === 'red') ? (redMobility - blackMobility) : (blackMobility - redMobility);
    totalScore += mobilityDifference * mobilityWeight;

    const kingSafetyWeight = 50;
    totalScore += (evaluateKingSafety(currentBoard, aiColor, currentPieceValues) - evaluateKingSafety(currentBoard, aiColor === 'red' ? 'black' : 'red', currentPieceValues)) * kingSafetyWeight;

    const threatWeight = 20;
    totalScore += (evaluateThreats(currentBoard, aiColor, currentPieceValues) - evaluateThreats(currentBoard, aiColor === 'red' ? 'black' : 'red', currentPieceValues)) * threatWeight;

    return totalScore;
}

// --- Move Ordering Optimization ---
function scoreMove(move, board, currentPieceValues) {
    let score = 0;
    const targetPiece = board[move.to.r][move.to.c];
    if (targetPiece) {
        const movingPiece = board[move.from.r][move.from.c];
        const movingPieceInfo = getPieceInfo(movingPiece);
        const targetPieceInfo = getPieceInfo(targetPiece);
        score = (currentPieceValues[targetPieceInfo.type] || 0) - (currentPieceValues[movingPieceInfo.type] || 0);
    }
    // Add positional bonus
    const pieceType = getPieceInfo(board[move.from.r][move.from.c]).type;
    if (PST[pieceType]) {
        score += (PST[pieceType][move.to.r][move.to.c] - PST[pieceType][move.from.r][move.from.c]);
    }
    return score;
}

function minimax(currentBoard, depth, alpha, beta, maximizingPlayer, useOptimizations) {
    if (depth === 0) {
        if (useOptimizations) return quiescenceSearch(currentBoard, alpha, beta, maximizingPlayer);
        return { score: evaluateBoardState(currentBoard) };
    }
    const color = maximizingPlayer ? aiColor : (aiColor === 'red' ? 'black' : 'red');
    let bestMove = null;
    const moves = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const p = currentBoard[r][c]; if (p && getPieceInfo(p).color === color) getValidMoves(currentBoard, r, c).forEach(m => moves.push({ from: { r, c }, to: m })); }
    let legalMoves = filterValidMoves(currentBoard, moves, color);
    legalMoves = legalMoves.filter(move => !isRepetitiveCheckViolation(move, currentBoard, color));
    if (legalMoves.length === 0) { 
        const score = isKingInCheck(currentBoard, color) ? (maximizingPlayer ? -Infinity : Infinity) : 0;
        return { score: score, move: null }; // Explicitly return null for the move
    }
    
    if (useOptimizations) {
        const currentPieceValues = getDynamicPieceValues(currentBoard);
        legalMoves.forEach(move => move.score = scoreMove(move, currentBoard, currentPieceValues));
        legalMoves.sort((a, b) => b.score - a.score);
    }

    if (maximizingPlayer) {
        let maxEval = -Infinity;
        for (const move of legalMoves) {
            const tempBoard = currentBoard.map(row => [...row]);
            tempBoard[move.to.r][move.to.c] = tempBoard[move.from.r][move.from.c];
            tempBoard[move.from.r][move.from.c] = null;
            const { score } = minimax(tempBoard, depth - 1, alpha, beta, false, useOptimizations);
            if (score > maxEval) {
                maxEval = score;
                bestMove = move;
            }
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        // Failsafe: If no move was chosen (e.g., all moves lead to an equally bad mate), pick the first available one.
        if (bestMove === null && legalMoves.length > 0) {
            bestMove = legalMoves[0];
        }
        return { score: maxEval, move: bestMove };
    } else {
        let minEval = Infinity;
        for (const move of legalMoves) {
            const tempBoard = currentBoard.map(row => [...row]);
            tempBoard[move.to.r][move.to.c] = tempBoard[move.from.r][move.from.c];
            tempBoard[move.from.r][move.from.c] = null;
            const { score } = minimax(tempBoard, depth - 1, alpha, beta, true, useOptimizations);
            if (score < minEval) {
                minEval = score;
                bestMove = move;
            }
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
        // Failsafe for minimizing player
        if (bestMove === null && legalMoves.length > 0) {
            bestMove = legalMoves[0];
        }
        return { score: minEval, move: bestMove };
    }
}

function quiescenceSearch(currentBoard, alpha, beta, maximizingPlayer) {
    const standPat = evaluateBoardState(currentBoard);
    const color = maximizingPlayer ? aiColor : (aiColor === 'red' ? 'black' : 'red');
    if (maximizingPlayer) {
        if (standPat >= beta) return { score: beta };
        if (standPat > alpha) alpha = standPat;
    } else {
        if (standPat <= alpha) return { score: alpha };
        if (standPat < beta) beta = standPat;
    }
    const moves = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const p = currentBoard[r][c]; if (p && getPieceInfo(p).color === color) { getValidMoves(currentBoard, r, c).forEach(m => { if (currentBoard[m.r][m.c]) moves.push({ from: { r, c }, to: m }); }); } }
    const legalCaptures = filterValidMoves(currentBoard, moves, color);
    if (legalCaptures.length === 0) {
        return { score: maximizingPlayer ? alpha : beta };
    }
    
    const currentPieceValues = getDynamicPieceValues(currentBoard);
    legalCaptures.forEach(move => move.score = scoreMove(move, currentBoard, currentPieceValues));
    legalCaptures.sort((a, b) => b.score - a.score);

    for (const move of legalCaptures) {
        const tempBoard = currentBoard.map(row => [...row]);
        tempBoard[move.to.r][move.to.c] = tempBoard[move.from.r][move.from.c];
        tempBoard[move.from.r][move.from.c] = null;
        const { score } = quiescenceSearch(tempBoard, alpha, beta, !maximizingPlayer);
        if (maximizingPlayer) {
            if (score >= beta) return { score: beta };
            if (score > alpha) alpha = score;
        } else {
            if (score <= alpha) return { score: alpha };
            if (score < beta) beta = score;
        }
    }
    return { score: maximizingPlayer ? alpha : beta };
}

// --- Worker Event Listener ---
self.onmessage = function(e) {
    const { boardState, difficulty, aiColor: newAiColor, moveHistory: newMoveHistory } = e.data;
    aiColor = newAiColor;
    moveHistory = newMoveHistory;

    let depth, useOptimizations;
    switch (difficulty) {
        case 'easy':
            depth = 2;
            useOptimizations = false;
            break;
        case 'medium':
            depth = 3;
            useOptimizations = true;
            break;
        case 'hard':
            depth = 3;
            useOptimizations = true;
            break;
        case 'expert':
            depth = 4;
            useOptimizations = true;
            break;
        default:
            depth = 2;
            useOptimizations = false;
            break;
    }
    
    const result = minimax(boardState, depth, -Infinity, Infinity, true, useOptimizations);
    self.postMessage(result);
};

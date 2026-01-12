// lib/ocr.js - OCR et extraction vidéo (migré de fluent-ffmpeg vers child_process)
import { createWorker } from 'tesseract.js';
import { spawn } from 'child_process';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const debug = process.env.DEBUG_TELEGRAM === '1';

// Cache pour éviter de traiter plusieurs fois la même image
const processedCache = new Set();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

// Initialiser le worker Tesseract (réutilisé pour toutes les images)
let ocrWorker = null;

// Utiliser le répertoire temp du système (compatible Windows/Linux)
const TMP_DIR = os.tmpdir();

/**
 * Initialise le worker OCR Tesseract
 */
export async function initOCR() {
  if (ocrWorker) return ocrWorker;

  console.log('[ocr] Initializing Tesseract worker...');

  // Options conditionnelles pour le logger (Tesseract.js ne supporte pas undefined)
  const options = debug ? { logger: (m) => console.log('[ocr]', m) } : {};
  ocrWorker = await createWorker('eng', 1, options);

  // Configuration optimale pour détecter des codes courts
  await ocrWorker.setParameters({
    tessedit_pageseg_mode: '6', // Assume uniform block of text
    tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  });

  console.log('[ocr] Tesseract worker ready');
  return ocrWorker;
}

/**
 * Extrait le code bonus d'un texte OCR
 * Pattern: stakecomXXXXXXXX (10-30 caractères alphanumériques)
 */
function extractBonusCodeFromText(text) {
  if (!text) return null;

  // Pattern prioritaire: stakecom suivi de caractères alphanumériques
  const stakecomPattern = /stakecom[a-z0-9]{3,20}/gi;
  const stakecomMatches = text.match(stakecomPattern);

  if (stakecomMatches && stakecomMatches.length > 0) {
    const code = stakecomMatches[0].toLowerCase();
    if (debug) console.log('[ocr] Found stakecom code:', code);
    return code;
  }

  // Pattern générique: code alphanumérique de 10-30 caractères
  const genericPattern = /\b[a-z0-9]{10,30}\b/gi;
  const genericMatches = text.match(genericPattern);

  if (genericMatches && genericMatches.length > 0) {
    const code = genericMatches[0].toLowerCase();
    if (debug) console.log('[ocr] Found generic code:', code);
    return code;
  }

  return null;
}

/**
 * Preprocess une image pour améliorer la détection OCR
 * - Crop le tiers inférieur de l'image (zone du code)
 * - Augmente le contraste et la netteté
 * - Convertit en niveaux de gris
 * @param {string} imagePath - Chemin vers l'image originale
 * @returns {Promise<string>} - Chemin vers l'image preprocessée
 */
async function preprocessImage(imagePath) {
  try {
    const preprocessedPath = imagePath.replace(/\.(jpg|png|jpeg)$/i, '_preprocessed.png');

    // Obtenir les dimensions de l'image
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;

    // Calculer la zone à extraire (tiers inférieur centré)
    const cropHeight = Math.floor(height / 3);
    const cropTop = height - cropHeight;

    if (debug) {
      console.log('[ocr] Preprocessing image:', imagePath);
      console.log('[ocr] Original size:', width, 'x', height);
      console.log('[ocr] Cropping bottom third: top=', cropTop, 'height=', cropHeight);
    }

    // Crop + amélioration + niveaux de gris
    await sharp(imagePath)
      .extract({ left: 0, top: cropTop, width, height: cropHeight })
      .greyscale()
      .normalize() // Améliore le contraste automatiquement
      .sharpen()
      .toFile(preprocessedPath);

    if (debug) console.log('[ocr] Preprocessed image saved:', preprocessedPath);

    return preprocessedPath;
  } catch (error) {
    console.error('[ocr] Preprocessing error:', error.message);
    // En cas d'erreur, retourner l'image originale
    return imagePath;
  }
}

/**
 * Extrait le code bonus depuis une image
 * @param {string} imagePath - Chemin vers l'image
 * @returns {Promise<{code: string|null, text: string, confidence: number}>}
 */
export async function extractCodeFromImage(imagePath) {
  let preprocessedPath = null;

  try {
    if (!ocrWorker) {
      await initOCR();
    }

    if (debug) console.log('[ocr] Processing image:', imagePath);

    // Preprocessing: crop la zone du code + amélioration
    preprocessedPath = await preprocessImage(imagePath);

    // OCR sur l'image preprocessée
    const { data } = await ocrWorker.recognize(preprocessedPath);
    const extractedText = data.text;
    const bonusCode = extractBonusCodeFromText(extractedText);

    if (debug) {
      console.log('[ocr] Extracted text:', extractedText.substring(0, 200));
      console.log('[ocr] Confidence:', data.confidence);
      console.log('[ocr] Bonus code found:', bonusCode || 'none');
    }

    // Nettoyer l'image preprocessée
    if (preprocessedPath !== imagePath) {
      cleanupFile(preprocessedPath);
    }

    return {
      code: bonusCode,
      text: extractedText,
      confidence: data.confidence,
    };
  } catch (error) {
    console.error('[ocr] Image processing error:', error.message);

    // Nettoyer l'image preprocessée en cas d'erreur
    if (preprocessedPath && preprocessedPath !== imagePath) {
      cleanupFile(preprocessedPath);
    }

    return { code: null, text: '', confidence: 0 };
  }
}

/**
 * Exécute une commande FFmpeg via child_process
 * @param {string[]} args - Arguments FFmpeg
 * @returns {Promise<void>}
 */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpegCmd = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const proc = spawn(ffmpegCmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Exécute ffprobe pour obtenir les métadonnées d'une vidéo
 * @param {string} videoPath - Chemin vers la vidéo
 * @returns {Promise<{duration: number}>}
 */
function runFFprobe(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobeCmd = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ];

    const proc = spawn(ffprobeCmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) {
          reject(new Error('Could not parse video duration'));
        } else {
          resolve({ duration });
        }
      } else {
        reject(new Error(`FFprobe exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFprobe spawn error: ${err.message}`));
    });
  });
}

/**
 * Extrait les frames des dernières secondes d'une vidéo
 * @param {string} videoPath - Chemin vers la vidéo
 * @param {number} lastSeconds - Nombre de secondes à extraire depuis la fin (défaut: 2)
 * @param {number} fps - Nombre de frames par seconde à extraire (défaut: 5)
 * @returns {Promise<string[]>} - Tableau des chemins des frames extraites (ordre inverse: plus récentes en premier)
 */
async function extractVideoFrames(videoPath, lastSeconds = 2, fps = 5) {
  const frameDir = path.join(TMP_DIR, `frames_${Date.now()}`);

  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true });
  }

  if (debug) console.log('[ocr] Extracting last', lastSeconds, 'seconds of video at', fps, 'fps');

  // Obtenir la durée de la vidéo
  const metadata = await runFFprobe(videoPath);
  const duration = metadata.duration;
  const startTime = Math.max(0, duration - lastSeconds);

  if (debug) console.log('[ocr] Video duration:', duration, 's, extracting from', startTime.toFixed(1), 's');

  // Extraire les frames avec FFmpeg
  const outputPattern = path.join(frameDir, 'frame-%03d.png');
  const ffmpegArgs = [
    '-ss', startTime.toString(),
    '-i', videoPath,
    '-t', lastSeconds.toString(),
    '-vf', `fps=${fps}`,
    '-y',
    outputPattern
  ];

  await runFFmpeg(ffmpegArgs);

  // Lister les frames générées
  const frames = fs.readdirSync(frameDir)
    .filter(f => f.startsWith('frame-'))
    .map(f => path.join(frameDir, f))
    .sort()
    .reverse(); // Ordre inverse: dernières frames en premier

  if (debug) console.log('[ocr] Extracted', frames.length, 'frames (reversed order)');
  return frames;
}

/**
 * Extrait le code bonus depuis une vidéo (avec traitement parallèle par batch)
 * @param {string} videoPath - Chemin vers la vidéo
 * @returns {Promise<{code: string|null, text: string, confidence: number, framesProcessed: number}>}
 */
export async function extractCodeFromVideo(videoPath) {
  let frames = [];
  let frameDir = null;

  try {
    if (!ocrWorker) {
      await initOCR();
    }

    if (debug) console.log('[ocr] Processing video:', videoPath);

    // Extraire les frames (2 dernières secondes)
    frames = await extractVideoFrames(videoPath, 2);

    if (frames.length === 0) {
      return { code: null, text: '', confidence: 0, framesProcessed: 0 };
    }

    frameDir = path.dirname(frames[0]);

    // Traitement par batch pour optimiser la performance
    const BATCH_SIZE = 3;

    for (let i = 0; i < frames.length; i += BATCH_SIZE) {
      const batch = frames.slice(i, i + BATCH_SIZE);

      // Traiter le batch en parallèle
      const results = await Promise.all(
        batch.map(framePath =>
          extractCodeFromImage(framePath).catch(() => ({ code: null, text: '', confidence: 0 }))
        )
      );

      // Vérifier si un code a été trouvé
      const found = results.find(r => r.code);
      if (found) {
        if (debug) console.log('[ocr] Code found in batch starting at frame', i + 1);

        // Nettoyer les frames
        cleanupDirectory(frameDir);

        return {
          code: found.code,
          text: found.text,
          confidence: found.confidence,
          framesProcessed: i + batch.indexOf(found) + 1,
        };
      }
    }

    // Aucun code trouvé
    if (debug) console.log('[ocr] No code found in', frames.length, 'frames');
    cleanupDirectory(frameDir);

    return {
      code: null,
      text: '',
      confidence: 0,
      framesProcessed: frames.length,
    };
  } catch (error) {
    console.error('[ocr] Video processing error:', error.message);

    // Nettoyer en cas d'erreur
    if (frameDir) cleanupDirectory(frameDir);

    return {
      code: null,
      text: '',
      confidence: 0,
      framesProcessed: 0,
    };
  }
}

/**
 * Nettoie un répertoire et tous ses fichiers
 */
function cleanupDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        fs.unlinkSync(path.join(dirPath, file));
      }
      fs.rmdirSync(dirPath);
      if (debug) console.log('[ocr] Cleaned up directory:', dirPath);
    }
  } catch (error) {
    console.error('[ocr] Cleanup error:', error.message);
  }
}

/**
 * Nettoie un fichier
 */
export function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      if (debug) console.log('[ocr] Cleaned up file:', filePath);
    }
  } catch (error) {
    console.error('[ocr] File cleanup error:', error.message);
  }
}

/**
 * Vérifie si une image a déjà été traitée récemment (cache)
 */
export function isAlreadyProcessed(messageId) {
  return processedCache.has(messageId);
}

/**
 * Marque une image comme traitée
 */
export function markAsProcessed(messageId) {
  processedCache.add(messageId);

  // Nettoyer le cache après TTL
  setTimeout(() => {
    processedCache.delete(messageId);
  }, CACHE_TTL);
}

/**
 * Termine le worker OCR (à appeler lors de l'arrêt du bot)
 */
export async function terminateOCR() {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
    console.log('[ocr] Tesseract worker terminated');
  }
}

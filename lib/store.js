// lib/store.js - Gestion de la déduplication avec protection contre les race conditions
import sqlite3 from 'sqlite3';

let db;

// Map pour gérer les locks par clé (évite les race conditions)
const processingKeys = new Map();

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export async function initStore() {
  sqlite3.verbose();
  db = new sqlite3.Database('seen.db');
  await runAsync('CREATE TABLE IF NOT EXISTS seen (key TEXT PRIMARY KEY, ts INTEGER)');

  // Nettoyer les anciennes entrées (> 7 jours) pour éviter que la DB grossisse
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  try {
    await runAsync('DELETE FROM seen WHERE ts < ?', [sevenDaysAgo]);
  } catch (e) {
    // Ignorer les erreurs de nettoyage
  }
}

/**
 * Vérifie si une clé a déjà été vue, et la marque comme vue si ce n'est pas le cas.
 * Utilise un système de locks en mémoire pour éviter les race conditions
 * quand deux messages identiques arrivent en même temps.
 *
 * @param {string} key - Clé unique (ex: "tg:chatId:messageId")
 * @returns {Promise<boolean>} - true si déjà vu, false si nouveau
 */
export async function alreadySeen(key) {
  // Si la clé est en cours de traitement, considérer comme déjà vue
  if (processingKeys.has(key)) {
    return true;
  }

  // Marquer la clé comme en cours de traitement
  processingKeys.set(key, true);

  try {
    // Vérifier d'abord si elle existe déjà en base
    const existing = await getAsync('SELECT 1 FROM seen WHERE key = ?', [key]);
    if (existing) {
      return true; // Déjà vu
    }

    // Insérer la nouvelle clé
    await runAsync('INSERT INTO seen(key, ts) VALUES(?, ?)', [key, Date.now()]);
    return false; // Nouveau
  } catch (e) {
    // En cas d'erreur (ex: contrainte PK violée par une autre instance)
    // Considérer comme déjà vue par sécurité
    return true;
  } finally {
    // Libérer le lock après un court délai pour éviter les doublons rapprochés
    setTimeout(() => {
      processingKeys.delete(key);
    }, 1000); // 1 seconde de protection supplémentaire
  }
}

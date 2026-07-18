/**
 * E2ECryptoService — Chiffrement bout-en-bout inspiré de Signal
 *
 * Primitives : X25519 (échange de clés Diffie-Hellman sur Curve25519)
 *              + XSalsa20-Poly1305 (chiffrement authentifié)
 * Bibliothèque : tweetnacl (pure JS, auditée, ~6 Ko gzip)
 *
 * Flux :
 *   1. À l'inscription → generateKeyPair() → clé pub dans Supabase (public_profiles),
 *      clé priv dans expo-secure-store (jamais quitte l'appareil)
 *   2. Envoi → encrypt(plaintext, partnerId)
 *      → nonce aléatoire 24 octets + nacl.box.after(sharedSecret)
 *   3. Réception → decrypt(ciphertext, nonce, partnerId)
 *      → nacl.box.open.after(sharedSecret)
 *   4. Secret partagé → dérivé UNE fois par partenaire (X25519),
 *      mis en cache en mémoire pendant la session
 */
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { KeyStorage } from './KeyStorage';
import { supabase, TABLES } from '../supabase/config';

export class E2ECryptoService {
  /** Secret partagé X25519 par partenaire, mis en cache dès la 1ère dérivation */
  private sharedSecretCache = new Map<string, Uint8Array>();
  private privateKey: Uint8Array | null = null;

  // ─── Génération de la paire de clés ──────────────────────────────────────

  generateKeyPair(): { publicKeyB64: string; privateKeyB64: string } {
    const kp = nacl.box.keyPair();
    return {
      publicKeyB64: encodeBase64(kp.publicKey),
      privateKeyB64: encodeBase64(kp.secretKey),
    };
  }

  // ─── Initialisation de session ────────────────────────────────────────────

  /** Charge la clé privée depuis le keychain. À appeler après chaque login. */
  async initialize(uid: string): Promise<boolean> {
    const privB64 = await KeyStorage.getPrivateKey(uid);
    if (!privB64) return false;
    this.privateKey = decodeBase64(privB64);
    return true;
  }

  /** Réinitialise la session (logout). */
  clearSession(): void {
    this.privateKey = null;
    this.sharedSecretCache.clear();
  }

  isReady(): boolean {
    return this.privateKey !== null;
  }

  // ─── Dérivation du secret partagé ─────────────────────────────────────────

  /**
   * Calcule ou retourne depuis le cache le secret partagé avec `partnerId`.
   * Le secret est identique des deux côtés (propriété DH).
   */
  async getSharedSecret(partnerId: string): Promise<Uint8Array> {
    const cached = this.sharedSecretCache.get(partnerId);
    if (cached) return cached;

    if (!this.privateKey) throw new Error('[E2E] Service non initialisé — clé privée manquante');

    // Récupère la clé publique du partenaire depuis public_profiles (Supabase)
    const { data, error } = await supabase
      .from(TABLES.PUBLIC_PROFILES)
      .select('e2e_public_key')
      .eq('id', partnerId)
      .maybeSingle();

    if (error || !data) throw new Error(`[E2E] Profil de ${partnerId} introuvable`);

    const pubKeyB64: string | null = data.e2e_public_key;
    if (!pubKeyB64) throw new Error(`[E2E] Clé publique de ${partnerId} absente — version ancienne ?`);

    const partnerPub = decodeBase64(pubKeyB64);
    const secret = nacl.box.before(partnerPub, this.privateKey);
    this.sharedSecretCache.set(partnerId, secret);
    return secret;
  }

  // ─── Chiffrement ──────────────────────────────────────────────────────────

  async encrypt(
    plaintext: string,
    partnerId: string
  ): Promise<{ ciphertext: string; nonce: string }> {
    const secret = await this.getSharedSecret(partnerId);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box.after(encodeUTF8(plaintext), nonce, secret);
    return {
      ciphertext: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
    };
  }

  // ─── Déchiffrement ────────────────────────────────────────────────────────

  /**
   * Retourne le texte clair, ou `null` si le déchiffrement échoue
   * (clé incorrecte, message corrompu, version antérieure non chiffrée).
   */
  async decrypt(
    ciphertextB64: string,
    nonceB64: string,
    partnerId: string
  ): Promise<string | null> {
    try {
      const secret = await this.getSharedSecret(partnerId);
      const decrypted = nacl.box.open.after(
        decodeBase64(ciphertextB64),
        decodeBase64(nonceB64),
        secret
      );
      if (!decrypted) return null;
      return decodeUTF8(decrypted);
    } catch {
      return null;
    }
  }
}

export const e2eCryptoService = new E2ECryptoService();

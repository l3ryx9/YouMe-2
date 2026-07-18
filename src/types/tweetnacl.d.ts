// Déclarations de types minimales pour tweetnacl et tweetnacl-util
declare module 'tweetnacl' {
  export const box: {
    keyPair(): { publicKey: Uint8Array; secretKey: Uint8Array };
    before(theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
    after(msg: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
    open: {
      after(box: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null;
    };
    nonceLength: number;
    publicKeyLength: number;
    secretKeyLength: number;
    overheadLength: number;
  };
  export function randomBytes(n: number): Uint8Array;
  const nacl: { box: typeof box; randomBytes: typeof randomBytes };
  export default nacl;
}

declare module 'tweetnacl-util' {
  export function encodeBase64(data: Uint8Array): string;
  export function decodeBase64(data: string): Uint8Array;
  export function encodeUTF8(data: string): Uint8Array;
  export function decodeUTF8(data: Uint8Array): string;
}

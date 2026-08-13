import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";

import { loadPrivateKey, readPrivateKeyPem } from "@/lib/bank/enablebanking";

/**
 * La clé de signature Enable Banking arrive dans une variable d'environnement,
 * sous une forme qui varie selon le fournisseur et la façon dont l'utilisateur
 * l'a exportée. Ces tests fixent ce que le chargement doit accepter — c'est
 * exactement là que le portage a échoué en conditions réelles : `importPKCS8`
 * refusait une clé PKCS#1, format pourtant courant.
 */

const pkcs8 = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }).privateKey as string;

const pkcs1 = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
  }).privateKey as string;

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("lecture du PEM", () => {
  it("décode la forme attendue : le .pem encodé en base64", () => {
    const pem = pkcs8();
    expect(readPrivateKeyPem(b64(pem))).toBe(pem.trim());
  });

  it("accepte aussi le PEM collé tel quel, sans encodage", () => {
    const pem = pkcs8();
    expect(readPrivateKeyPem(pem)).toBe(pem.trim());
  });

  it("tolère les espaces et retours à la ligne autour de la valeur", () => {
    const pem = pkcs8();
    expect(readPrivateKeyPem(`\n  ${b64(pem)}  \n`)).toBe(pem.trim());
  });

  it("refuse explicitement une valeur qui ne contient aucune clé", () => {
    expect(() => readPrivateKeyPem("pas-une-cle")).toThrow(/ne contient pas de clé PEM/);
    expect(() => readPrivateKeyPem("")).toThrow(/ne contient pas de clé PEM/);
  });
});

describe("chargement de la clé", () => {
  it("charge une clé PKCS#8 (-----BEGIN PRIVATE KEY-----)", () => {
    const key = loadPrivateKey(b64(pkcs8()));
    expect(key.type).toBe("private");
    expect(key.asymmetricKeyType).toBe("rsa");
  });

  it("charge une clé PKCS#1 (-----BEGIN RSA PRIVATE KEY-----), que importPKCS8 rejetait", () => {
    const pem = pkcs1();
    expect(pem).toContain("BEGIN RSA PRIVATE KEY");
    const key = loadPrivateKey(b64(pem));
    expect(key.type).toBe("private");
    expect(key.asymmetricKeyType).toBe("rsa");
  });

  it("remonte une erreur lisible quand le contenu ressemble à un PEM sans en être un", () => {
    const fake = "-----BEGIN PRIVATE KEY-----\nnimportequoi\n-----END PRIVATE KEY-----";
    expect(() => loadPrivateKey(b64(fake))).toThrow(/Clé privée Enable Banking illisible/);
  });
});

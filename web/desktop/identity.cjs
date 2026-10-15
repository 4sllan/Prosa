// identity.cjs — identidade Ed25519 da instalação (Electron main).
// A chave privada nunca sai deste processo; o renderer recebe pubkey + assinaturas.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let identity = null; // { pubKeyHex, privateKey }

function init(userDataDir) {
  if (identity) return identity;
  const dir = path.join(userDataDir, 'p2p');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dir, 'identity.key');

  let privateKey, pubKeyHex;
  if (fs.existsSync(keyFile)) {
    privateKey = crypto.createPrivateKey({ key: fs.readFileSync(keyFile), format: 'der', type: 'pkcs8' });
  } else {
    const kp = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(keyFile, kp.privateKey.export({ format: 'der', type: 'pkcs8' }), { mode: 0o600 });
    privateKey = kp.privateKey;
  }
  const pub = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  pubKeyHex = pub.toString('hex');
  identity = { pubKeyHex, privateKey };
  return identity;
}

function pubkey() { return identity.pubKeyHex; }

function sign(dataB64) {
  const sig = crypto.sign(null, Buffer.from(dataB64, 'base64'), identity.privateKey);
  return sig.toString('base64');
}

// fingerprint curto exibido ao usuário ("p2p:xxxxxxxxxxxxxxxx")
function fingerprint() {
  const h = crypto.createHash('sha256').update(Buffer.from(identity.pubKeyHex, 'hex')).digest('hex');
  return 'p2p:' + h.slice(0, 16);
}

module.exports = { init, pubkey, sign, fingerprint };

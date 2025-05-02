require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Connection, Keypair, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, createTransferInstruction, getMint, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const nacl = require('tweetnacl');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Налаштування ключа payer
let secretKey;
try {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY не визначено у .env');
  }
  secretKey = Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY));
} catch (e) {
  console.error('❌ Помилка: Некоректний PRIVATE_KEY у .env:', e.message);
  process.exit(1);
}
const payer = Keypair.fromSecretKey(secretKey);
console.log('Payer Public Key:', payer.publicKey.toBase58());

// Підключення до Helius
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=f6c43c4f-5764-4355-8cd2-30fed87b2519', 'confirmed');

// Перевірка адреси токена
let MINT_ADDRESS;
try {
  MINT_ADDRESS = new PublicKey(process.env.TOKEN_MINT);
  console.log('Token Mint Address:', MINT_ADDRESS.toBase58());
} catch (e) {
  console.error('❌ Помилка: Некоректна адреса TOKEN_MINT у .env');
  process.exit(1);
}

// Перевірка балансу payer
async function checkPayerBalance() {
  const balance = await connection.getBalance(payer.publicKey);
  console.log('💰 Баланс Payer:', balance / 1e9, 'SOL');
  if (balance < 0.002 * 1e9) {
    console.warn('⚠️ Увага: Недостатньо SOL на рахунку payer');
  }
}
checkPayerBalance();

// Тестування підпису payer
function testPayerSignature() {
  try {
    const message = Buffer.from('test');
    const signature = nacl.sign.detached(message, payer.secretKey);
    console.log('Тестовий підпис payer:', Buffer.from(signature).toString('hex'));
  } catch (e) {
    console.error('❌ Помилка при створенні тестового підпису:', e);
  }
}
testPayerSignature();

// Ендпоінт для створення транзакції
app.post('/get-transaction', async (req, res) => {
  try {
    const buyerAddress = new PublicKey(req.body.buyer);
    console.log('Buyer Address:', buyerAddress.toBase58());

    const latestBlockhash = await connection.getLatestBlockhash();
    console.log('Latest Blockhash:', latestBlockhash.blockhash);

    const transaction = new Transaction();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = buyerAddress;
    
    
    const solAmount = parseFloat(req.body.solAmount || '0.001')

    
    // Додавання інструкції SystemProgram.transfer
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: buyerAddress,
      lamports: Math.floor(solAmount * 1e9) // 0.001 SOL
    });
    transaction.add(transferInstruction);

    // Логування транзакції до підпису
    console.log('Transaction before signing:', {
      recentBlockhash: transaction.recentBlockhash,
      feePayer: transaction.feePayer?.toBase58(),
      instructions: transaction.instructions.map(i => ({
        programId: i.programId.toBase58(),
        data: i.data.toString('hex'),
        keys: i.keys.map(k => k.pubkey.toBase58())
      }))
    });

    // Встановлення порядку підписантів (payer перший, buyer другий)
    transaction.setSigners(payer.publicKey, buyerAddress);

    // Підпис транзакції payer
    transaction.partialSign(payer);

    // Логування підписів
    console.log('Transaction signatures:', transaction.signatures.map(s => ({
      publicKey: s.publicKey.toBase58(),
      signature: s.signature ? s.signature.toString('hex') : 'null'
    })));

    // Серіалізація транзакції
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });

    console.log('Serialized transaction length:', serializedTransaction.length);

    res.send({
      transaction: Buffer.from(serializedTransaction).toString('base64'),
      recentBlockhash: latestBlockhash.blockhash
    });
  } catch (error) {
    console.error('Помилка створення транзакції:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Ендпоінт для відправки токенів
app.post('/send-tokens', async (req, res) => {
  try {
    const buyer = new PublicKey(req.body.buyer);
    console.log('Buyer Address:', buyer.toBase58());

    const payerBalance = await connection.getBalance(payer.publicKey);
    console.log('💰 Payer SOL balance:', payerBalance / 1e9, 'SOL');
    if (payerBalance < 0.002 * 1e9) {
      throw new Error('Недостатньо SOL на рахунку payer');
    }

    const tokenAmountRaw = parseFloat(req.body.tokenAmount || '1')
    const tokenAmount = Math.floor(tokenAmountRaw * 10 ** decimals)
    
    // Отримання інформації про токен
    const mintInfo = await getMint(connection, MINT_ADDRESS);
    const decimals = mintInfo.decimals;
    console.log('🔢 Token decimals:', decimals);

    // Сума в токенах (1 токен)
    const tokenAmount = 1 * 10 ** decimals;

    // Акаунт відправника
    const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      MINT_ADDRESS,
      payer.publicKey
    );

    // Акаунт одержувача
    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      MINT_ADDRESS,
      buyer
    );

    // Створення інструкції переказу токенів
    const transferIx = createTransferInstruction(
      senderTokenAccount.address,
      recipientTokenAccount.address,
      payer.publicKey,
      tokenAmount,
      [],
      TOKEN_PROGRAM_ID
    );

    // Створення транзакції
    const transaction = new Transaction().add(transferIx);
    const latestBlockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = payer.publicKey;

    // Підпис і відправка транзакції
    const signature = await connection.sendTransaction(transaction, [payer], {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('✅ Токени надіслано. Підпис:', signature);
    res.send({ success: true, signature });
  } catch (error) {
    console.error('❌ Помилка переказу токенів:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Бекенд запущено на http://localhost:${port}`);
});

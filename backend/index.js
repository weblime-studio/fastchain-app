require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Connection, Keypair, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer, getAccount } = require('@solana/spl-token');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const secretKey = Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY));
const payer = Keypair.fromSecretKey(secretKey);

// Виводимо публічний ключ payer для перевірки
console.log('Payer Public Key:', payer.publicKey.toBase58());

// Підключення до Devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Перевірка валідності токена
let MINT_ADDRESS;
try {
  MINT_ADDRESS = new PublicKey(process.env.TOKEN_MINT);
  console.log('Token Mint Address:', MINT_ADDRESS.toBase58());
} catch (e) {
  console.error('❌ ERROR: Invalid TOKEN_MINT address in .env');
  process.exit(1);
}

app.post('/get-transaction', async (req, res) => {
  try {
    const buyerAddress = new PublicKey(req.body.buyer);
    console.log('Buyer Address:', buyerAddress.toBase58());

    // Перевіряємо баланс payer
    const payerBalance = await connection.getBalance(payer.publicKey);
    console.log('Payer Balance:', payerBalance / 1e9, 'SOL');
    if (payerBalance < 0.002 * 1e9) {
      throw new Error('Insufficient SOL in payer account');
    }

    const latestBlockhash = await connection.getLatestBlockhash();

    // Створюємо транзакцію
    const transaction = new Transaction({
      recentBlockhash: latestBlockhash.blockhash,
      feePayer: buyerAddress,
    });

    // Додаємо переказ SOL
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: buyerAddress,
        toPubkey: payer.publicKey,
        lamports: BigInt(100), // 0.001 SOL, використовуємо BigInt для коректних операцій
      })
    );

    // Перевіряємо токен-акаунт для buyer
    console.log('Creating token account for buyer:', buyerAddress.toBase58());
    let toTokenAccount;
    try {
      toTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        MINT_ADDRESS,
        buyerAddress
      );
      console.log('Token account created:', toTokenAccount.address.toBase58());
    } catch (error) {
      console.error('Failed to create token account for buyer:', error);
      throw new Error('Cannot create token account for buyer: ' + error.message);
    }

    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.send({ transaction: serializedTx.toString('base64') });
  } catch (error) {
    console.error('Transaction creation error:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.post('/send-tokens', async (req, res) => {
  try {
    const buyer = new PublicKey(req.body.buyer);
    const amount = BigInt(1); // Кількість токенів, використовуємо BigInt для коректних операцій

    // Перевіряємо баланс payer
    const payerBalance = await connection.getBalance(payer.publicKey);
    console.log('Payer Balance:', payerBalance / 1e9, 'SOL');
    if (payerBalance < 0.002 * 1e9) {
      throw new Error('Insufficient SOL in payer account');
    }

    // Перевіряємо токен-акаунт для payer
    let fromTokenAccount;
    try {
      fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        MINT_ADDRESS,
        payer.publicKey
      );
      console.log('Payer token account:', fromTokenAccount.address.toBase58());
    } catch (error) {
      console.error('Failed to create token account for payer:', error);
      throw new Error('Cannot create token account for payer: ' + error.message);
    }

    // Перевіряємо баланс токенів
    const tokenAccountInfo = await getAccount(connection, fromTokenAccount.address);
console.log('Payer token balance:', tokenAccountInfo.amount); // Логуємо баланс
    //console.log('Payer token balance:', tokenAccountInfo.amount / Math.pow(10, 9)); // Якщо 9 десяткових знаків

    if (Number(tokenAccountInfo.amount) < Number(amount) * 1e9) { // Перевіряємо, чи достатньо токенів
      //throw new Error(`Insufficient token balance: ${Number(tokenAccountInfo.amount) / 1e9} tokens available, ${amount} required`);
    }

    // Перевіряємо токен-акаунт для buyer
    console.log('Creating token account for buyer:', buyer.toBase58());
    let toTokenAccount;
    try {
      toTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        MINT_ADDRESS,
        buyer
      );
      console.log('Buyer token account:', toTokenAccount.address.toBase58());
    } catch (error) {
      console.error('Failed to create token account for buyer:', error);
      throw new Error('Cannot create token account for buyer: ' + error.message);
    }

    // Переказ токенів
    console.log('Transferring tokens:', amount);
    const signature = await transfer(
      connection,
      payer,
      fromTokenAccount.address,
      toTokenAccount.address,
      payer.publicKey,
      amount // Кількість у найменших одиницях (з урахуванням decimals)
    );

    res.send({ success: true, signature });
  } catch (error) {
    console.error('Token transfer error:', error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Backend listening at http://localhost:${port}`);
});

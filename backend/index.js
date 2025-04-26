require('dotenv').config();
const express = require('express');
const cors = require('cors');

/*const {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Transaction,
  solanaWeb3,
  SystemProgram,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');*/


const { Connection, clusterApiUrl, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');


const {
  getOrCreateAssociatedTokenAccount,
  transfer,
} = require('@solana/spl-token');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const secretKey = Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY));
const payer = Keypair.fromSecretKey(secretKey);



/*const connection = new solanaWeb3.Connection(
  solanaWeb3.clusterApiUrl('mainnet-beta'),
  'confirmed'
);*/
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');



//const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');


const MINT_ADDRESS = new PublicKey(process.env.TOKEN_MINT);

app.post('/get-transaction', async (req, res) => {
  try {
    const buyerAddress = new PublicKey(req.body.buyer);
    const latestBlockhash = await connection.getLatestBlockhash();

    const solTransferTx = new Transaction({
      recentBlockhash: latestBlockhash.blockhash,
      feePayer: buyerAddress,
    }).add(
      SystemProgram.transfer({
        fromPubkey: buyerAddress,
        toPubkey: payer.publicKey,
        lamports: 100000, // 0.001 SOL
      })
    );

    const serializedTx = solTransferTx.serialize({
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
    const amount = 100; // кількість токенів (в найменшій одиниці)

    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      MINT_ADDRESS,
      payer.publicKey
    );

    const toTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      MINT_ADDRESS,
      buyer
    );

    const signature = await transfer(
      connection,
      payer,
      fromTokenAccount.address,
      toTokenAccount.address,
      payer.publicKey,
      amount
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
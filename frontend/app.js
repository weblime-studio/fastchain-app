let wallet = null;
document.getElementById('connect').addEventListener('click', async () => {
  if (window.solana && window.solana.isPhantom) {
    try {
      const resp = await window.solana.connect();
      wallet = resp.publicKey.toString();

      alert('Connected: ' + wallet);
    } catch (err) {
      console.error('Connection error', err);
    }
  } else {
    alert('Phantom not found. Install it!');
  }
});

document.getElementById('buy').addEventListener('click', async () => {
  if (!wallet) return alert('Please connect wallet first');

  try {
    const res = await fetch('http://localhost:3001/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer: wallet })
    });

    const data = await res.json();
    console.log(data);
    alert('Buy request sent');
  } catch (e) {
    console.error(e);
    alert('Error sending buy request');
  }
});

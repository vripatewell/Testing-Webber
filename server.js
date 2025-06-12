const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');
const qrcode = require('qrcode');
const session = require('express-session');
const config = require('./config/config'); // Mengambil konfigurasi dari file terpisah

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // Melayani file statis dari folder 'public'
app.set('view engine', 'ejs'); // Contoh penggunaan EJS sebagai template engine

// Konfigurasi session (penting untuk menyimpan data panel dan status pembayaran)
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'), // Ganti dengan secret yang kuat
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Dummy database (ganti dengan MongoDB/PostgreSQL di produksi)
const db = {}; // Format: db[userId] = { orders: [], currentPayment: {} }

// Fungsi utilitas (sesuaikan dari kode Anda)
const generateRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const toIDR = (amount) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
const capital = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const tanggal = (timestamp) => new Date(timestamp).toLocaleString('id-ID'); // Format tanggal yang lebih baik

// --- ROUTES ---

// Halaman utama
app.get('/', (req, res) => {
    res.render('index', {
        motivation: "Jadikan impian Anda menjadi kenyataan. Dengan panel otomatis kami, kreativitas Anda tak terbatas!"
    }); // Anda perlu membuat file index.ejs
});

// Endpoint untuk memproses pembelian panel
app.post('/buy-panel', async (req, res) => {
    const { username, password, panelType } = req.body; // Ambil data dari form
    const userId = req.session.id; // Menggunakan session ID sebagai userId sementara

    let Obj = {}; // Objek untuk menyimpan spesifikasi panel
    switch (panelType) {
        case "1gb": Obj = { ram: "1000", disk: "1000", cpu: "40", harga: "3000" }; break;
        case "2gb": Obj = { ram: "2000", disk: "1000", cpu: "60", harga: "4000" }; break;
        // ... tambahkan kasus lain sesuai kebutuhan
        case "unli": Obj = { ram: "0", disk: "0", cpu: "0", harga: "13000" }; break;
        default: return res.status(400).send("Jenis panel tidak valid.");
    }

    const amount = Number(Obj.harga) + generateRandomNumber(110, 250);
    const transactionId = `TRX${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`; // ID transaksi unik

    try {
        // Panggil API OrderKuota untuk membuat pembayaran
        const getPayment = await axios.get(`${config.apibot1}/api/orkut/createpayment`, {
            params: {
                apikey: config.apiSimpleBotv2,
                amount: amount,
                codeqr: config.qrisOrderKuota // QRIS statis
            }
        });

        const paymentData = getPayment.data.result;

        // Simpan data pembayaran di session atau database
        if (!db[userId]) db[userId] = { orders: [] };
        db[userId].currentPayment = {
            transactionId: paymentData.transactionId, // Gunakan ID dari OrderKuota jika ada, atau ID lokal
            amount: paymentData.amount,
            qrImageUrl: paymentData.qrImageUrl || await qrcode.toDataURL(config.qrisOrderKuota), // QRIS dari OrderKuota atau generate sendiri
            panelType: panelType,
            username: username,
            password: password,
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 menit
        };

        // Render halaman pembayaran
        res.render('payment', {
            transactionId: db[userId].currentPayment.transactionId,
            totalAmount: toIDR(db[userId].currentPayment.amount),
            qrImageUrl: db[userId].currentPayment.qrImageUrl,
            expiresAt: new Date(db[userId].currentPayment.expiresAt).toLocaleTimeString('id-ID'),
            panelType: panelType
        });

        // Set timeout untuk mengecek status pembayaran
        const checkPaymentInterval = setInterval(async () => {
            if (!db[userId] || !db[userId].currentPayment) {
                clearInterval(checkPaymentInterval);
                return;
            }

            if (Date.now() > db[userId].currentPayment.expiresAt) {
                console.log(`QRIS Pembayaran ${db[userId].currentPayment.transactionId} telah expired!`);
                delete db[userId].currentPayment;
                clearInterval(checkPaymentInterval);
                // Anda bisa mengirim notifikasi ke frontend
                return;
            }

            const resultcek = await axios.get(`${config.apibot1}/api/orkut/cekstatus`, {
                params: {
                    apikey: config.apiSimpleBotv2,
                    merchant: config.merchantIdOrderKuota,
                    keyorkut: config.apiOrderKuota,
                    // Anda mungkin perlu parameter lain seperti transactionId untuk OrderKuota
                }
            });

            // Perlu disesuaikan dengan respons API OrderKuota yang sebenarnya
            // Jika OrderKuota tidak mendukung cek status berdasarkan ID transaksi spesifik,
            // ini akan menjadi tantangan karena akan mengecek semua transaksi.
            // Asumsi: resultcek.data.amount mencocokkan jumlah yang dibayarkan
            if (resultcek.data && resultcek.data.amount == db[userId].currentPayment.amount) {
                console.log(`Pembayaran ${db[userId].currentPayment.transactionId} berhasil diterima!`);
                clearInterval(checkPaymentInterval);

                // --- PROSES PEMBUATAN PANEL ---
                const generatedUsername = db[userId].currentPayment.username;
                const generatedEmail = generatedUsername + "@gmail.com";
                const generatedName = capital(generatedUsername) + " Server";
                const generatedPassword = db[userId].currentPayment.password; // Gunakan password dari input user

                try {
                    // 1. Buat User di Pterodactyl
                    const createUserRes = await axios.post(`${config.domainV3}/api/application/users`, {
                        email: generatedEmail,
                        username: generatedUsername.toLowerCase(),
                        first_name: generatedName,
                        last_name: "Server",
                        language: "en",
                        password: generatedPassword
                    }, {
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${config.apikeyV3}`
                        }
                    });
                    const user = createUserRes.data.attributes;
                    const usr_id = user.id;

                    // 2. Dapatkan Startup Command Egg
                    const getEggRes = await axios.get(`${config.domainV3}/api/application/nests/${config.nestidV3}/eggs/${config.eggV3}`, {
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${config.apikeyV3}`
                        }
                    });
                    const startup_cmd = getEggRes.data.attributes.startup;

                    // 3. Buat Server di Pterodactyl
                    const createServerRes = await axios.post(`${config.domainV3}/api/application/servers`, {
                        name: generatedName,
                        description: tanggal(Date.now()),
                        user: usr_id,
                        egg: parseInt(config.eggV3),
                        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
                        startup: startup_cmd,
                        environment: {
                            INST: "npm",
                            USER_UPLOAD: "0",
                            AUTO_UPDATE: "0",
                            CMD_RUN: "npm start"
                        },
                        limits: {
                            memory: Obj.ram,
                            swap: 0,
                            disk: Obj.disk,
                            io: 500,
                            cpu: Obj.cpu
                        },
                        feature_limits: {
                            databases: 5,
                            backups: 5,
                            allocations: 5
                        },
                        deploy: {
                            locations: [parseInt(config.locV3)],
                            dedicated_ip: false,
                            port_range: [],
                        },
                    }, {
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${config.apikeyV3}`,
                        }
                    });
                    const server = createServerRes.data.attributes;

                    const panelData = {
                        serverId: server.id,
                        username: user.username,
                        password: generatedPassword,
                        loginLink: config.domainV3,
                        ram: Obj.ram,
                        disk: Obj.disk,
                        cpu: Obj.cpu,
                        createdAt: tanggal(Date.now()),
                        // linkYtb: linkytb // jika ada
                    };

                    // Simpan data panel ke dalam riwayat pembelian pengguna
                    db[userId].orders.push(panelData);
                    delete db[userId].currentPayment; // Hapus data pembayaran sementara

                    // Redirect ke halaman rahasia atau berikan notifikasi (misalnya melalui WebSocket)
                    // Untuk contoh ini, kita akan menyimpan di session dan membiarkan frontend mengambilnya
                    // atau arahkan ke halaman dashboard
                } catch (pterodactylError) {
                    console.error("Error creating Pterodactyl panel:", pterodactylError.response ? pterodactylError.response.data : pterodactylError.message);
                    // Handle error, misalnya kirim email ke admin
                    delete db[userId].currentPayment; // Hapus data pembayaran
                    // Beri tahu pengguna bahwa ada masalah
                }
            }
        }, 8000); // Cek setiap 8 detik

    } catch (error) {
        console.error("Error creating payment:", error.response ? error.response.data : error.message);
        res.status(500).send("Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.");
    }
});

// Endpoint untuk mendapatkan data panel (setelah pembayaran berhasil)
app.get('/get-panel-data', (req, res) => {
    const userId = req.session.id;
    if (db[userId] && db[userId].orders && db[userId].orders.length > 0) {
        res.json({ success: true, panels: db[userId].orders });
    } else {
        res.json({ success: false, message: "Belum ada panel yang dibeli atau pembayaran belum terkonfirmasi." });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
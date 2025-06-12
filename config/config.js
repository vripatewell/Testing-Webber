// Anda bisa menggunakan dotenv untuk mengelola variabel lingkungan
require('dotenv').config();

module.exports = {
    eggV3: process.env.EGG_ID, 
    nestidV3: process.env.NEST_ID, 
    locV3: process.env.LOCATION_ID, 
    domainV3: process.env.PTERODACTYL_DOMAIN, 
    apikeyV3: process.env.PTERODACTYL_API_KEY, 
    capikeyV3: process.env.PTERODACTYL_CLIENT_API_KEY, 
    apibot1: process.env.ORDERKUOTA_API_BASE_URL, 
    apiSimpleBotv2: process.env.ORDERKUOTA_API_KEY, 
    merchantIdOrderKuota: process.env.MERCHANT_ID_ORDERKUOTA, 
    apiOrderKuota: process.env.ORDERKUOTA_TRANSACTION_KEY, 
    qrisOrderKuota: process.env.QRIS_CODE_ORDERKUOTA
};
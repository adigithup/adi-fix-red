// ADI FIX MERAH BOT - INTEGRATED CONFIGURATION

module.exports = {
    // Server Configuration
    server: {
        port: 3000,
        host: "0.0.0.0",
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    },

    // Bot Configuration
    bot: {
        token: "8366266164:AAEW2ztq5uyJFk5uPgBu141_ZbTtvL4owpU",
        ownerId: 7567536569,
        adminIds: [],
        targetEmail: "support@support.whatsapp.com",
        logChannel: -1003637575128
    },

    // Database Configuration
    database: {
        files: {
            senders: 'senders.json',
            users: 'users.json',
            history: 'history.json',
            premium: 'prem.json',
            payments: 'payments.json'
        },
        autoSaveInterval: 300000, // 5 minutes
        backupInterval: 86400000 // 24 hours
    },

    // VIP Packages Configuration
    vipPackages: {
        "1h": {
            label: "VIP 1 Hari",
            price: 1600,
            days: 1,
            icon: "⭐",
            description: "Cocok untuk coba-coba",
            features: ["Unlimited fixes", "Priority processing"]
        },
        "2h": {
            label: "VIP 2 Hari",
            price: 2500,
            days: 2,
            icon: "💎",
            description: "Value lebih hemat",
            features: ["Unlimited fixes", "Priority processing", "Faster response"]
        },
        "4h": {
            label: "VIP 4 Hari",
            price: 3700,
            days: 4,
            icon: "👑",
            description: "Paling populer!",
            features: ["Unlimited fixes", "Priority processing", "Faster response", "24/7 support"]
        },
        "6h": {
            label: "VIP 6 Hari",
            price: 5300,
            days: 6,
            icon: "🚀",
            description: "Hemat hingga 30%",
            features: ["Unlimited fixes", "Priority processing", "Faster response", "24/7 support", "Exclusive features"]
        }
    },

    // User Limits
    limits: {
        dailyLimitFree: 2,
        dailyLimitVIP: 99999,
        maxHistory: 100,
        maxConcurrentRequests: 3
    },

    // API Configuration
    api: {
        timeout: 15000,
        retryAttempts: 3,
        retryDelay: 2000
    },

    // Features Configuration
    features: {
        enableWebSocket: true,
        enableRealTimeUpdates: true,
        enableResendAll: true,
        enableLeaderboard: true,
        enableVIPSystem: true,
        enablePaymentGateway: true,
        enableTelegramBot: true
    },

    // Payment Configuration
    payment: {
        provider: "qris",
        currency: "IDR",
        webhookUrl: null,
        webhookSecret: null
    },

    // Security Configuration
    security: {
        rateLimit: {
            windowMs: 60000, // 1 minute
            max: 100 // requests per window
        },
        cors: {
            origin: "*",
            methods": ["GET", "POST"]
        },
        helmet: {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "ws:", "wss:"]
                }
            }
        }
    },

    // Logging Configuration
    logging: {
        level: "info",
        format: "combined",
        directory: "./logs",
        maxSize: "10m",
        maxFiles: 5
    },

    // Cache Configuration
    cache: {
        type: "memory",
        ttl: 3600, // 1 hour
        maxSize: 1000
    },

    // Email Configuration (for notifications)
    email: {
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER || "",
            pass: process.env.EMAIL_PASS || ""
        }
    },

    // Feature Flags
    featureFlags: {
        maintenanceMode: false,
        debugMode: false,
        testMode: false,
        enableAnalytics: true,
        enableReferralSystem: false,
        enablePromoCodes: false
    },

    // UI Configuration
    ui: {
        theme: "default",
        primaryColor: "#6366f1",
        secondaryColor: "#8b5cf6",
        animations: true,
        darkMode: false
    },

    // Analytics Configuration
    analytics: {
        enabled: true,
        provider: "google",
        trackingId: process.env.ANALYTICS_ID || "",
        enableHeatmap: false,
        enableSessionRecording: false
    },

    // Third Party Services
    services: {
        // QRIS Payment
        qris: {
            apiUrl: "https://api.qrispy.id",
            apiKey: "cki_3YjJp8xdshDnDsmz1Uj7kgXN1ZVA0g6xDwgSVuCuvY50i4Uc",
            timeout: 15000,
            merchantName: "ADI FIX MERAH"
        },
        
        // SMS Service (optional)
        sms: {
            provider: "twilio",
            accountSid: process.env.TWILIO_SID || "",
            authToken: process.env.TWILIO_TOKEN || "",
            phoneNumber: process.env.TWILIO_PHONE || ""
        },
        
        // Cloud Storage (optional)
        storage: {
            provider: "aws",
            accessKeyId: process.env.AWS_ACCESS_KEY || "",
            secretAccessKey: process.env.AWS_SECRET_KEY || "",
            region: "ap-southeast-1",
            bucket: "adi-fix-merah"
        }
    },

    // Telegram Bot Settings
    telegram: {
        enabled: true,
        commands: {
            start: { description: "Show welcome message" },
            help: { description: "Show help information" },
            addsender: { description: "Add new sender", adminOnly: true },
            listsenders: { description: "List all senders", adminOnly: true },
            delsender: { description: "Delete sender by index", adminOnly: true },
            resetsenders: { description: "Reset all senders", adminOnly: true },
            stats: { description: "Show system statistics", adminOnly: true },
            vip: { description: "Manage VIP", adminOnly: true },
            broadcast: { description: "Broadcast to all users", adminOnly: true },
            balance: { description: "Check QRIS balance", adminOnly: true },
            payments: { description: "View payment history", adminOnly: true },
            addvip: { description: "Add VIP manually", ownerOnly: true },
            removevip: { description: "Remove VIP", ownerOnly: true },
            listvip: { description: "List all VIP", adminOnly: true },
            backup: { description: "Manual backup", ownerOnly: true },
            reload: { description: "Reload configuration", ownerOnly: true }
        }
    },

    // Development Configuration
    development: {
        hotReload: true,
        mockData: true,
        debugEndpoints: true,
        slowDownRequests: false
    }
};